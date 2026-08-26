const fs = require('fs');
const path = require('path');
const winston = require('winston');

const logDirectory = path.resolve(__dirname, '../../../logs');
const errorLogPath = path.join(logDirectory, 'error.log');
const combinedLogPath = path.join(logDirectory, 'combined.log');

fs.mkdirSync(logDirectory, { recursive: true });

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const details = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const stackInfo = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${details}${stackInfo}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const details = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const stackInfo = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${details}${stackInfo}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports: [
    new winston.transports.File({
      filename: errorLogPath,
      level: 'error',
      handleExceptions: true,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: combinedLogPath,
      handleExceptions: true,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    }),
    new winston.transports.Console({
      level: 'info',
      format: consoleFormat,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: errorLogPath }),
  ],
  exitOnError: false,
});

logger.stream = {
  write: (message) => {
    const cleanedMessage = typeof message === 'string' ? message.trim() : '';
    if (cleanedMessage) {
      logger.info(cleanedMessage);
    }
  },
};

module.exports = logger;
