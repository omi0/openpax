// config/logger.js
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info', // trace, debug, info, warn, error, fatal
  
  // Development: pretty-print with colors
  // Production: raw JSON for log aggregators (Datadog, CloudWatch, etc.)
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    }
  } : undefined,
  
  // Base fields for all logs
  base: {
    env: process.env.NODE_ENV,
  },
  
  // Automatically log error stack traces
  serializers: {
    error: pino.stdSerializers.err,
  },
  
  // Redact sensitive data
  redact: {
    paths: ['password', 'password_hash', 'token', 'accessToken', 'refreshToken'],
    remove: true
  }
});

module.exports = logger;