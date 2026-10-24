import { performance } from 'node:perf_hooks';
import Redis from 'ioredis';
import { createMessageRepository, roomRedisKey } from '../repositories/message-repository.js';

const operations = Number(process.env.BENCHMARK_OPERATIONS ?? 1000);
const historyLimit = Number(process.env.MESSAGE_HISTORY_LIMIT ?? 100);
const messageCount = Math.min(historyLimit, 100);
if (!Number.isInteger(operations) || operations < 20 || operations > 100_000) {
  throw new Error('BENCHMARK_OPERATIONS must be an integer between 20 and 100000.');
}

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'redis',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
});
redis.on('error', () => undefined);

const roomId = `benchmark-${process.pid}-${Date.now()}`;
const repository = createMessageRepository(redis, historyLimit);
const seedMessages = Array.from({ length: messageCount }, (_, index) => ({
  id: `benchmark-message-${index}`,
  clientMessageId: `benchmark-client-${index}`,
  roomId,
  senderId: `benchmark-guest-${index % 4}`,
  senderName: `Guest ${index % 4}`,
  content: `Benchmark message ${index}: representative fixed-length room history payload.`,
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
}));

async function removeBenchmarkData() {
  const historyKey = roomRedisKey(roomId);
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${historyKey}:client:*`, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
  await redis.del(historyKey);
  await redis.srem('chat:rooms', roomId);
}

function summarize(samples, totalMs) {
  const sorted = [...samples].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
  return {
    totalMs: Number(totalMs.toFixed(2)),
    averageMs: Number((samples.reduce((total, sample) => total + sample, 0) / samples.length).toFixed(4)),
    medianMs: Number(medianMs.toFixed(4)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(4))
  };
}

async function runBenchmark(read, count) {
  for (let warmup = 0; warmup < Math.min(count, 20); warmup += 1) await read();
  const samples = new Array(count);
  const totalStart = performance.now();
  for (let index = 0; index < count; index += 1) {
    const operationStart = performance.now();
    await read();
    samples[index] = performance.now() - operationStart;
  }
  return summarize(samples, performance.now() - totalStart);
}

try {
  await redis.connect();
  for (const message of seedMessages) await repository.append(message);

  const redisSnapshot = await repository.getRecent(roomId, messageCount);
  if (JSON.stringify(redisSnapshot) !== JSON.stringify(seedMessages)) {
    throw new Error('Redis history does not match the benchmark source data.');
  }

  const redisHistoryRead = await runBenchmark(
    () => repository.getRecent(roomId, messageCount),
    operations
  );
  const uncachedSerializationBaseline = await runBenchmark(
    () => JSON.parse(JSON.stringify(seedMessages)),
    operations
  );

  console.log(JSON.stringify({
    benchmark: 'Redis room history read vs in-memory JSON serialization baseline',
    note: 'The baseline is synthetic, not a database comparison. Both paths return the same message array; Redis reads include network round-trip and JSON parsing.',
    operations,
    messageCount,
    outputEquivalent: true,
    redisHistoryRead,
    uncachedSerializationBaseline
  }, null, 2));
} finally {
  if (redis.status === 'ready') await removeBenchmarkData().catch(() => {});
  if (redis.status !== 'end') await redis.quit().catch(() => {});
}