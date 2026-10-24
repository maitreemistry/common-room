import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  REDIS_HOST: z.string().trim().min(1).default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().min(1),
  GUEST_SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  MESSAGE_HISTORY_LIMIT: z.coerce.number().int().min(1).max(100).default(100),
  MESSAGE_MAX_LENGTH: z.coerce.number().int().min(1).max(10000).default(2000)
});

export function parseEnvironment(environment = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid backend configuration: ${details}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    redis: {
      host: result.data.REDIS_HOST,
      port: result.data.REDIS_PORT,
      password: result.data.REDIS_PASSWORD
    },
    guestSessionSecret: result.data.GUEST_SESSION_SECRET,
    corsOrigin: result.data.CORS_ORIGIN,
    messageHistoryLimit: result.data.MESSAGE_HISTORY_LIMIT,
    messageMaxLength: result.data.MESSAGE_MAX_LENGTH
  };
}