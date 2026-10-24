import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createMessageRepository } from './repositories/message-repository.js';
import { createPresenceRepository } from './repositories/presence-repository.js';
import { createChatServer } from './sockets/chat.js';
import { createLogger } from './utils/logger.js';
import { createRedisClients } from './services/redis-clients.js';

const config = parseEnvironment();
const logger = createLogger(config.nodeEnv);
const redisClients = createRedisClients(config, logger);

async function start() {
  await redisClients.connect();
  const messages = createMessageRepository(redisClients.cache, config.messageHistoryLimit);
  const presence = createPresenceRepository(redisClients.cache);
  const app = createApp({ config, redisClients, messages, logger });
  const httpServer = createServer(app);
  const io = createChatServer(httpServer, { config, redisClients, messages, presence, logger });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, '0.0.0.0', resolve);
  });
  logger.info({ port: config.port }, 'Chat backend listening');

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down chat backend');
    const forceClose = setTimeout(() => httpServer.closeAllConnections(), 10_000);
    forceClose.unref();
    await new Promise((resolve) => io.close(resolve));
    await redisClients.close();
    clearTimeout(forceClose);
  };
  process.once('SIGINT', () => shutdown('SIGINT').finally(() => process.exit(0)));
  process.once('SIGTERM', () => shutdown('SIGTERM').finally(() => process.exit(0)));
}

start().catch(async (error) => {
  logger.fatal({ err: error }, 'Backend startup failed');
  await redisClients.close().catch(() => {});
  process.exitCode = 1;
});