import pino from 'pino';

export function createLogger(environment = 'development') {
  return pino({
    level: environment === 'test' ? 'silent' : 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.sessionToken',
        '*.token'
      ],
      censor: '[REDACTED]'
    }
  });
}