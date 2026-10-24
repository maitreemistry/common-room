const PRESENCE_TTL_SECONDS = 90;

function encodedRoom(roomId) {
  return Buffer.from(roomId, 'utf8').toString('base64url');
}

function roomKeys(roomId) {
  const roomKey = `chat:room:${encodedRoom(roomId)}`;
  return {
    users: `${roomKey}:users`,
    details: `${roomKey}:user-details`
  };
}

const REGISTER_SOCKET_SCRIPT = `
local socket = cjson.encode({ userId = ARGV[1], displayName = ARGV[2], roomId = ARGV[3] })
redis.call('SET', KEYS[1], socket, 'EX', ARGV[5])
redis.call('SADD', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[5])
redis.call('SADD', KEYS[3], ARGV[4])
redis.call('EXPIRE', KEYS[3], ARGV[5])
redis.call('ZADD', KEYS[4], ARGV[6], ARGV[1])
redis.call('HSET', KEYS[5], ARGV[1], cjson.encode({ userId = ARGV[1], displayName = ARGV[2] }))
redis.call('EXPIRE', KEYS[4], tonumber(ARGV[5]) * 2)
redis.call('EXPIRE', KEYS[5], tonumber(ARGV[5]) * 2)
return 1
`;

const TOUCH_SOCKET_SCRIPT = `
local socket = redis.call('GET', KEYS[1])
if not socket then return 0 end
local data = cjson.decode(socket)
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[3], ARGV[1])
redis.call('ZADD', KEYS[4], ARGV[2], data.userId)
redis.call('HSET', KEYS[5], data.userId, cjson.encode({ userId = data.userId, displayName = data.displayName }))
redis.call('EXPIRE', KEYS[4], tonumber(ARGV[1]) * 2)
redis.call('EXPIRE', KEYS[5], tonumber(ARGV[1]) * 2)
return 1
`;

const UNREGISTER_SOCKET_SCRIPT = `
local socket = redis.call('GET', KEYS[1])
if not socket then return false end
local data = cjson.decode(socket)
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[1])
redis.call('SREM', KEYS[3], ARGV[1])
local remaining = redis.call('SCARD', KEYS[3])
if remaining == 0 then
  redis.call('DEL', KEYS[3])
  redis.call('ZREM', KEYS[4], data.userId)
  redis.call('HDEL', KEYS[5], data.userId)
end
return cjson.encode({ userId = data.userId, displayName = data.displayName, roomId = data.roomId, userLeftRoom = remaining == 0 })
`;

export function createPresenceRepository(redis) {
  function keysFor(socketId, userId, roomId) {
    const keys = roomKeys(roomId);
    return [
      `chat:socket:${socketId}`,
      `chat:user:${userId}:sockets`,
      `${keys.users}:user:${userId}:sockets`,
      keys.users,
      keys.details
    ];
  }

  return {
    async registerSocket(socketId, user, roomId, now = Date.now()) {
      return redis.eval(
        REGISTER_SOCKET_SCRIPT,
        5,
        ...keysFor(socketId, user.userId, roomId),
        user.userId,
        user.displayName,
        roomId,
        socketId,
        String(PRESENCE_TTL_SECONDS),
        String(now)
      );
    },
    async touchSocket(socketId, now = Date.now()) {
      const socketJson = await redis.get(`chat:socket:${socketId}`);
      if (!socketJson) return false;
      const socket = JSON.parse(socketJson);
      return (await redis.eval(
        TOUCH_SOCKET_SCRIPT,
        5,
        ...keysFor(socketId, socket.userId, socket.roomId),
        String(PRESENCE_TTL_SECONDS),
        String(now)
      )) === 1;
    },
    async unregisterSocket(socketId) {
      const socketValue = await redis.get(`chat:socket:${socketId}`);
      if (!socketValue) return null;
      const socket = JSON.parse(socketValue);
      const keys = roomKeys(socket.roomId);
      const result = await redis.eval(
        UNREGISTER_SOCKET_SCRIPT,
        5,
        `chat:socket:${socketId}`,
        `chat:user:${socket.userId}:sockets`,
        `${keys.users}:user:${socket.userId}:sockets`,
        keys.users,
        keys.details,
        socketId
      );
      return result ? JSON.parse(result) : null;
    },
    async getRoomUsers(roomId, now = Date.now()) {
      const keys = roomKeys(roomId);
      const staleBefore = now - PRESENCE_TTL_SECONDS * 1000;
      const staleUsers = await redis.zrangebyscore(keys.users, '-inf', staleBefore);
      if (staleUsers.length) {
        await redis.zrem(keys.users, ...staleUsers);
        await redis.hdel(keys.details, ...staleUsers);
      }
      const userIds = await redis.zrange(keys.users, 0, -1);
      if (userIds.length === 0) return [];
      const details = await redis.hmget(keys.details, ...userIds);
      return details.filter(Boolean).map((entry) => JSON.parse(entry));
    },
    async countUserSockets(userId) {
      return redis.scard(`chat:user:${userId}:sockets`);
    }
  };
}