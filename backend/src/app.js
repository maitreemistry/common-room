import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { createApiRouter } from './routes/api.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

export function createApp({ config, redisClients, messages, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (request) => request.url === '/api/health' } }));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));
  app.use('/api', createApiRouter({ config, redisClients, messages, logger }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}