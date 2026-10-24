import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import Redis from 'ioredis';
import { io as createClient } from 'socket.io-client';
import { createChatServer } from '../src/sockets/chat.js';
import { createGuestSession } from '../src/services/guest-sessions.js';
import { createMessageRepository } from '../src/repositories/message-repository.js';
import { createPresenceRepository } from '../src/repositories/presence-repository.js';
import { createLogger } from '../src/utils/logger.js';

const host = process.env.REDIS_TEST_HOST ?? '127.0.0.1';
const port = Number(process.env.REDIS_TEST_PORT ?? 6389);
const password = process.env.REDIS_TEST_PASSWORD ?? 'backend-test-password';
const secret = 'integration-test-secret-with-at-least-32-chars';
const clients = ['cache', 'pub', 'sub'].map(() => new Redis({
  host,
  port,
  password,
  lazyConnect: true,
  connectTimeout: 1000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
}));
clients.forEach((client) => client.on('error', () => undefined));
let available = false;
try {
  await Promise.all(clients.map((client) => client.connect()));
  await clients[0].ping();
  available = true;
} catch {
  clients.forEach((client) => client.disconnect());
}

const activeServers = new Set();
const activeSockets = new Set();

afterEach(async () => {
  for (const socket of activeSockets) socket.disconnect();
  activeSockets.clear();
  await Promise.all([...activeServers].map(({ io, httpServer }) => new Promise((resolve) => {
    io.close(() => resolve());
    if (!httpServer.listening) resolve();
  })));
  activeServers.clear();
});

afterAll(async () => {
  await Promise.all(clients.map(async (client) => {
    if (client.status !== 'end') await client.quit();
  }));
});

async function createSocketServer() {
  const config = {
    guestSessionSecret: secret,
    corsOrigin: 'http://localhost:3000',
    messageHistoryLimit: 100,
    messageMaxLength: 2000
  };
  const redisClients = { cache: clients[0], pub: clients[1], sub: clients[2] };
  const messages = createMessageRepository(redisClients.cache, config.messageHistoryLimit);
  const presence = createPresenceRepository(redisClients.cache);
  const httpServer = createServer();
  const io = createChatServer(httpServer, {
    config,
    redisClients,
    messages,
    presence,
    logger: createLogger('test')
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const server = { io, httpServer, messages, presence, url: `http://127.0.0.1:${address.port}` };
  activeServers.add(server);
  return server;
}

async function connectGuest(server, displayName, session = createGuestSession(displayName, secret)) {
  const socket = createClient(server.url, {
    auth: { sessionToken: session.token },
    transports: ['websocket'],
    reconnection: false
  });
  activeSockets.add(socket);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 2000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return socket;
}

function emitAck(socket, event, payload) {
  return socket.timeout(2000).emitWithAck(event, payload);
}

function nextEvent(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('Socket.IO chat', () => {
  it.skipIf(!available)('delivers room messages and isolates other rooms', async () => {
    const server = await createSocketServer();
    const sender = await connectGuest(server, 'Ada');
    const recipient = await connectGuest(server, 'Lin');
    const outsider = await connectGuest(server, 'Sam');
    await Promise.all([
      emitAck(sender, 'room:join', { roomId: 'general' }),
      emitAck(recipient, 'room:join', { roomId: 'general' }),
      emitAck(outsider, 'room:join', { roomId: 'random' })
    ]);

    const senderMessage = nextEvent(sender, 'message:new');
    const recipientMessage = nextEvent(recipient, 'message:new');
    let outsiderReceived = false;
    outsider.once('message:new', () => { outsiderReceived = true; });
    const acknowledgement = await emitAck(sender, 'message:send', {
      roomId: 'general',
      content: 'Hello from Ada',
      clientMessageId: '6e82a9f3-4c17-4ca5-b6c1-baa9af463815'
    });

    expect(acknowledgement.success).toBe(true);
    expect((await senderMessage).id).toBe(acknowledgement.data.message.id);
    expect((await recipientMessage).content).toBe('Hello from Ada');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(outsiderReceived).toBe(false);
  });

  it.skipIf(!available)('rejects invalid payloads and sends from rooms not joined', async () => {
    const server = await createSocketServer();
    const client = await connectGuest(server, 'Ada');
    expect((await emitAck(client, 'room:join', { roomId: 'bad\u0000room' })).error.code).toBe('INVALID_ROOM');
    expect((await emitAck(client, 'message:send', {
      roomId: 'general',
      content: 'hello',
      clientMessageId: '6e82a9f3-4c17-4ca5-b6c1-baa9af463815'
    })).error.code).toBe('NOT_IN_ROOM');
    await emitAck(client, 'room:join', { roomId: 'general' });
    expect((await emitAck(client, 'message:send', {
      roomId: 'general',
      content: 'bad\u0000message',
      clientMessageId: '6e82a9f3-4c17-4ca5-b6c1-baa9af463815'
    })).error.code).toBe('INVALID_MESSAGE');
  });

  it.skipIf(!available)('returns history on join and does not duplicate retried messages', async () => {
    const server = await createSocketServer();
    const sender = await connectGuest(server, 'Ada');
    await emitAck(sender, 'room:join', { roomId: 'history-test' });
    let delivered = 0;
    sender.on('message:new', () => { delivered += 1; });
    const payload = {
      roomId: 'history-test',
      content: 'Persist exactly once',
      clientMessageId: '6e82a9f3-4c17-4ca5-b6c1-baa9af463815'
    };
    const first = await emitAck(sender, 'message:send', payload);
    const retry = await emitAck(sender, 'message:send', payload);
    expect(retry.data.duplicate).toBe(true);
    expect(retry.data.message.id).toBe(first.data.message.id);
    expect(await server.messages.getRecent('history-test', 100)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(delivered).toBe(1);

    const newcomer = await connectGuest(server, 'Lin');
    const joined = await emitAck(newcomer, 'room:join', { roomId: 'history-test' });
    expect(joined.data.messages.map((message) => message.content)).toEqual(['Persist exactly once']);
  });

  it.skipIf(!available)('does not broadcast when Redis message storage fails', async () => {
    const server = await createSocketServer();
    const sender = await connectGuest(server, 'Ada');
    const recipient = await connectGuest(server, 'Lin');
    await Promise.all([
      emitAck(sender, 'room:join', { roomId: 'outage-test' }),
      emitAck(recipient, 'room:join', { roomId: 'outage-test' })
    ]);
    vi.spyOn(server.messages, 'append').mockRejectedValue(new Error('Redis unavailable'));
    const received = vi.fn();
    recipient.on('message:new', received);
    const result = await emitAck(sender, 'message:send', {
      roomId: 'outage-test',
      content: 'must not be delivered',
      clientMessageId: '6e82a9f3-4c17-4ca5-b6c1-baa9af463815'
    });
    expect(result.error.code).toBe('MESSAGE_STORE_FAILED');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).not.toHaveBeenCalled();
  });

  it.skipIf(!available)('keeps shared guest presence until the final socket disconnects', async () => {
    const server = await createSocketServer();
    const sharedSession = createGuestSession('Ada', secret);
    const first = await connectGuest(server, 'Ada', sharedSession);
    const second = await connectGuest(server, 'Ada', sharedSession);
    await emitAck(first, 'room:join', { roomId: 'presence-test' });
    await emitAck(second, 'room:join', { roomId: 'presence-test' });
    expect(await server.presence.getRoomUsers('presence-test')).toHaveLength(1);

    first.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await server.presence.getRoomUsers('presence-test')).toHaveLength(1);
    second.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await server.presence.getRoomUsers('presence-test')).toHaveLength(0);
  });

  if (!available) it('skips integration checks without an authenticated test Redis', () => expect(available).toBe(false));
});