import Redis from 'ioredis';

export function createRedisClients(config, logger) {
  const options = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 250, 3000)
  };
  const cache = new Redis(options);
  const pub = new Redis(options);
  const sub = new Redis(options);

  for (const [name, client] of Object.entries({ cache, pub, sub })) {
    client.on('error', (error) => logger.error({ client: name, err: error }, 'Redis client error'));
  }

  return {
    cache,
    pub,
    sub,
    async connect() {
      await Promise.all([cache.connect(), pub.connect(), sub.connect()]);
    },
    async ping() {
      return cache.ping();
    },
    async close() {
      await Promise.all([cache, pub, sub].map(async (client) => {
        if (client.status !== 'end') await client.quit();
      }));
    }
  };
}