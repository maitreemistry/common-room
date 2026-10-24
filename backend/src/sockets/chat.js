import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { randomUUID } from 'node:crypto';
import { createMessageSendSchema, roomJoinSchema } from '../validation/schemas.js';
import { verifyGuestSession } from '../services/guest-sessions.js';

const ROOM_RATE_WINDOW_SECONDS = 10;
const ROOM_RATE_LIMIT = 12;
const ROOM_EVENT_RATE_LIMIT = 20;
const CONNECTION_RATE_WINDOW_SECONDS = 10;
const CONNECTION_RATE_LIMIT = 30;

function channelFor(roomId) {
  return `chat-room:${Buffer.from(roomId, 'utf8').toString('base64url')}`;
}

async function incrementRate(redis, key, ttlSeconds) {
  const script = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return count
  `;
  return redis.eval(script, 1, key, String(ttlSeconds));
}

function sendFailure(socket, acknowledge, code, message) {
  const response = { success: false, error: { code, message } };
  if (typeof acknowledge === 'function') acknowledge(response);
  else socket.emit('system:error', response.error);
}

export function createChatServer(httpServer, { config, redisClients, messages, presence, logger }) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000
  });
  io.adapter(createAdapter(redisClients.pub, redisClients.sub));

  io.use(async (socket, next) => {
    try {
      const session = verifyGuestSession(socket.handshake.auth?.sessionToken, config.guestSessionSecret);
      if (!session) return next(new Error('A valid guest session is required.'));
      const connectionCount = await incrementRate(
        redisClients.cache,
        `chat:rate:connect:${socket.handshake.address}`,
        CONNECTION_RATE_WINDOW_SECONDS
      );
      if (connectionCount > CONNECTION_RATE_LIMIT) return next(new Error('Connection rate limit exceeded.'));
      socket.data.user = session;
      next();
    } catch (error) {
      logger.warn({ err: error }, 'Socket connection rejected');
      next(new Error('Connection could not be verified.'));
    }
  });

  io.on('connection', (socket) => {
    const presenceHeartbeat = setInterval(() => {
      presence.touchSocket(socket.id).catch((error) => {
        logger.warn({ err: error }, 'Presence heartbeat failed');
      });
    }, 30_000);
    presenceHeartbeat.unref();

    socket.on('room:join', async (payload, acknowledge) => {
      const parsed = roomJoinSchema.safeParse(payload);
      if (!parsed.success) return sendFailure(socket, acknowledge, 'INVALID_ROOM', 'Room name must be between 1 and 40 valid characters.');

      let joinedRoomId;
      try {
        const eventRate = await incrementRate(redisClients.cache, `chat:rate:room-event:${socket.id}`, ROOM_RATE_WINDOW_SECONDS);
        if (eventRate > ROOM_EVENT_RATE_LIMIT) return sendFailure(socket, acknowledge, 'RATE_LIMITED', 'Too many room events. Please slow down.');
        const roomId = parsed.data.roomId;
        if (socket.data.roomId === roomId) {
          const [history, users] = await Promise.all([
            messages.getRecent(roomId, config.messageHistoryLimit),
            presence.getRoomUsers(roomId)
          ]);
          return acknowledge?.({ success: true, data: { roomId, messages: history, users } });
        }

        if (socket.data.roomId) await leaveRoom(socket, socket.data.roomId);
        await messages.registerRoom(roomId);
        await socket.join(channelFor(roomId));
        try {
          await presence.registerSocket(socket.id, socket.data.user, roomId);
        } catch (error) {
          await socket.leave(channelFor(roomId));
          throw error;
        }
        socket.data.roomId = roomId;
          joinedRoomId = roomId;

        const [history, users] = await Promise.all([
          messages.getRecent(roomId, config.messageHistoryLimit),
          presence.getRoomUsers(roomId)
        ]);
        acknowledge?.({ success: true, data: { roomId, messages: history, users } });
        socket.emit('room:joined', { roomId });
        io.to(channelFor(roomId)).emit('presence:update', { roomId, users, count: users.length });
      } catch (error) {
        if (joinedRoomId) {
          try {
            await presence.unregisterSocket(socket.id);
            await socket.leave(channelFor(joinedRoomId));
            delete socket.data.roomId;
          } catch (cleanupError) {
            logger.error({ err: cleanupError }, 'Failed to roll back room join');
          }
        }
        logger.error({ err: error }, 'Room join failed');
        sendFailure(socket, acknowledge, 'ROOM_JOIN_FAILED', 'Unable to join this room right now.');
      }
    });

    socket.on('room:leave', async (payload, acknowledge) => {
      const parsed = roomJoinSchema.safeParse(payload);
      if (!parsed.success) return sendFailure(socket, acknowledge, 'INVALID_ROOM', 'Room name is invalid.');
      if (socket.data.roomId !== parsed.data.roomId) {
        return sendFailure(socket, acknowledge, 'NOT_IN_ROOM', 'This connection has not joined that room.');
      }
      try {
        const eventRate = await incrementRate(redisClients.cache, `chat:rate:room-event:${socket.id}`, ROOM_RATE_WINDOW_SECONDS);
        if (eventRate > ROOM_EVENT_RATE_LIMIT) return sendFailure(socket, acknowledge, 'RATE_LIMITED', 'Too many room events. Please slow down.');
        const result = await leaveRoom(socket, parsed.data.roomId);
        acknowledge?.({ success: true, data: result });
      } catch (error) {
        logger.error({ err: error }, 'Room leave failed');
        sendFailure(socket, acknowledge, 'ROOM_LEAVE_FAILED', 'Unable to leave this room right now.');
      }
    });

    socket.on('message:send', async (payload, acknowledge) => {
      const parsed = createMessageSendSchema(config.messageMaxLength).safeParse(payload);
      if (!parsed.success) return sendFailure(socket, acknowledge, 'INVALID_MESSAGE', 'Message payload is invalid.');
      if (!socket.data.roomId || parsed.data.roomId !== socket.data.roomId) {
        return sendFailure(socket, acknowledge, 'NOT_IN_ROOM', 'Join the target room before sending a message.');
      }

      try {
        const rate = await incrementRate(
          redisClients.cache,
          `chat:rate:message:${socket.id}`,
          ROOM_RATE_WINDOW_SECONDS
        );
        if (rate > ROOM_RATE_LIMIT) return sendFailure(socket, acknowledge, 'RATE_LIMITED', 'Too many messages. Please slow down.');

        const message = {
          id: randomUUID(),
          clientMessageId: parsed.data.clientMessageId,
          roomId: socket.data.roomId,
          senderId: socket.data.user.userId,
          senderName: socket.data.user.displayName,
          content: parsed.data.content,
          timestamp: new Date().toISOString()
        };
        const stored = await messages.append(message);
        if (stored.created) io.to(channelFor(message.roomId)).emit('message:new', stored.message);
        acknowledge?.({ success: true, data: { message: stored.message, duplicate: !stored.created } });
      } catch (error) {
        logger.error({ err: error }, 'Message send failed');
        sendFailure(socket, acknowledge, 'MESSAGE_STORE_FAILED', 'Message was not sent because storage is unavailable.');
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(presenceHeartbeat);
      try {
        const result = await presence.unregisterSocket(socket.id);
        if (result?.userLeftRoom) await broadcastPresence(result.roomId);
      } catch (error) {
        logger.error({ err: error }, 'Presence cleanup failed');
      }
    });
  });

  async function broadcastPresence(roomId) {
    const users = await presence.getRoomUsers(roomId);
    io.to(channelFor(roomId)).emit('presence:update', { roomId, users, count: users.length });
  }

  async function leaveRoom(socket, roomId) {
    const result = await presence.unregisterSocket(socket.id);
    await socket.leave(channelFor(roomId));
    delete socket.data.roomId;
    socket.emit('room:left', { roomId });
    const users = await presence.getRoomUsers(roomId);
    if (result?.userLeftRoom) {
      io.to(channelFor(roomId)).emit('presence:update', { roomId, users, count: users.length });
    }
    return { roomId };
  }

  return io;
}