import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = pino({
  level,
  base: {
    service: 'oblio-shopify-integration'
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'config.headers.Authorization',
      'accessToken',
      '*.token',
      '*.client_secret',
      '*.clientSecret'
    ],
    remove: true
  },
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

export default logger;


