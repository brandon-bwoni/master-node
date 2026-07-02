import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  base: {
    service: process.env['SERVICE_NAME'] ?? 'gateway',
    node:    process.env['NODE_ID']      ?? 'unknown',
    pid:     process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target:  'pino-pretty',
      options: {
        colorize:      true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore:        'pid,hostname',
      },
    },
  }),
});

export type Logger = typeof logger;