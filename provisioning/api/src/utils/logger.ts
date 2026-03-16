import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  serializers: {
    req(request) {
      return {
        method: request.method,
        url: request.url,
        ...(request.body && typeof request.body === 'object'
          ? {
              body: Object.fromEntries(
                Object.entries(request.body as Record<string, unknown>).filter(
                  ([key]) => !['password', 'oldPassword', 'newPassword'].includes(key),
                ),
              ),
            }
          : {}),
      };
    },
  },
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
