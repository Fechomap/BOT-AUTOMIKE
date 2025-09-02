import winston from 'winston';
import { LogContext } from '../types';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || 'info';

// Configurar Winston
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'expedientes-ike-bot' },
  transports: [
    // Archivo para errores
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Archivo para todos los logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// En desarrollo, también log a consola
if (isDevelopment) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

// Clase de Logger personalizada
export class Logger {
  static error(message: string, context?: LogContext, error?: Error): void {
    logger.error(message, {
      context,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : undefined,
    });
  }

  static warn(message: string, context?: LogContext): void {
    logger.warn(message, { context });
  }

  static info(message: string, context?: LogContext): void {
    logger.info(message, { context });
  }

  static debug(message: string, context?: LogContext): void {
    logger.debug(message, { context });
  }

  static bot(message: string, telegramId: string, tenantId?: string, context?: LogContext): void {
    logger.info(`[BOT] ${message}`, {
      context: {
        telegramId,
        tenantId,
        action: 'bot_interaction',
        ...context,
      },
    });
  }

  static processing(message: string, expedienteNum: string, tenantId: string): void {
    logger.info(`[PROCESSING] ${message}`, {
      context: {
        tenantId,
        expedienteNum,
        action: 'expediente_processing',
      },
    });
  }

  static automation(message: string, context: LogContext): void {
    logger.info(`[AUTOMATION] ${message}`, {
      context: {
        ...context,
        action: 'web_automation',
      },
    });
  }

  static database(message: string, context?: LogContext): void {
    logger.info(`[DATABASE] ${message}`, {
      context: {
        ...context,
        action: 'database_operation',
      },
    });
  }

  static security(message: string, context: LogContext): void {
    logger.warn(`[SECURITY] ${message}`, {
      context: {
        ...context,
        action: 'security_event',
      },
    });
  }
}

export default Logger;
