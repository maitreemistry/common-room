import { afterAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { createMessageRepository, roomRedisKey } from '../src/repositories/message-repository.js';
import { createPresenceRepository } from '../src/repositories/presence-repository.js';

const host = process.env.REDIS_TEST_HOST ?? '127.0.0.1';
const port = Number(process.env.REDIS_TEST_PORT ?? 6389);
const password = process.env.REDIS_TEST_PASSWORD ?? 'backend-test-password';
const redis = new Redis({
  host,
  port,
  password,
  lazyConnect: true,
  connectTimeout: 1000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
});
redis.on('error', () => undefined);
const available = await (async () => {
  try {
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    redis.disconnect();
    return false;
  }
})();

afterAll(async () => {
  if (redis.status !== 'end') await redis.quit();
});

describe('Redis repositories', () => {
  it('constructs a stable, room-isolated message key', () => {
    expect(roomRedisKey('general')).toBe(roomRedisKey('general'));
    expect(roomRedisKey('general')).not.toBe(roomRedisKey('other'));
  });

  it.skipIf(!available)('stores idempotent messages in chronological order with bounded retention', async () => {
    const repository = createMessageRepository(redis, 2);
    const roomId = `test-${Date.now()}`;
    const makeMessage = (content, clientMessageId) => ({
      id: `id-${content}`,
      clientMessageId,
      roomId,
      senderId: 'guest-1',
      senderName: 'Ada',
      content,
      timestamp: new Date().toISOString()
    });

    const first = makeMessage('one', 'e9a4dd7f-e7bd-4ed3-b3ae-43cb01bb6a89');
    await repository.append(first);
    const retry = await repository.append({ ...first, id: 'new-id', content: 'changed retry' });
    expect(retry.created).toBe(false);
    expect(retry.message.id).toBe(first.id);
    await repository.append(makeMessage('two', '7123fd9c-a3a1-4c12-8619-c855f2be36c6'));
    await repository.append(makeMessage('three', 'caf52a17-baa3-4db0-8e2c-944815e6b211'));
    expect((await repository.getRecent(roomId, 10)).map((message) => message.content)).toEqual(['two', 'three']);
  });

  it.skipIf(!available)('keeps presence until the last socket for a guest leaves the room', async () => {
    const repository = createPresenceRepository(redis);
    const roomId = `presence-${Date.now()}`;
    const user = { userId: `user-${Date.now()}`, displayName: 'Ada' };
    await repository.registerSocket('socket-one', user, roomId);
    await repository.registerSocket('socket-two', user, roomId);
    expect(await repository.getRoomUsers(roomId)).toEqual([user]);
    expect((await repository.unregisterSocket('socket-one')).userLeftRoom).toBe(false);
    expect(await repository.getRoomUsers(roomId)).toEqual([user]);
    expect((await repository.unregisterSocket('socket-two')).userLeftRoom).toBe(true);
    expect(await repository.getRoomUsers(roomId)).toEqual([]);
  });

  if (!available) it('skips Redis integration checks when no authenticated test Redis is running', () => expect(available).toBe(false));
});