import { PrismaClient } from '@prisma/client';
import { Logger } from '../../utils/logger';

class DatabaseClient {
  private static instance: PrismaClient;

  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new PrismaClient({
        log: [
          {
            emit: 'event',
            level: 'query',
          },
          {
            emit: 'event',
            level: 'error',
          },
          {
            emit: 'event',
            level: 'info',
          },
          {
            emit: 'event',
            level: 'warn',
          },
        ],
      });

      // Log de queries en desarrollo
      if (process.env.NODE_ENV === 'development') {
        DatabaseClient.instance.$on('query', (e) => {
          Logger.debug(`Query: ${e.query}`);
        });
      }

      // Log de errores
      DatabaseClient.instance.$on('error', (e) => {
        Logger.error('Database error', {}, new Error(e.message));
      });

      // Log de info y warnings
      DatabaseClient.instance.$on('info', (e) => {
        Logger.info(`Database info: ${e.message}`);
      });

      DatabaseClient.instance.$on('warn', (e) => {
        Logger.warn(`Database warning: ${e.message}`);
      });
    }

    return DatabaseClient.instance;
  }

  static async connect(): Promise<void> {
    try {
      const prisma = DatabaseClient.getInstance();
      await prisma.$connect();
      Logger.info('✅ Conectado a la base de datos');
    } catch (error) {
      Logger.error('❌ Error conectando a la base de datos', {}, error as Error);
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    try {
      const prisma = DatabaseClient.getInstance();
      await prisma.$disconnect();
      Logger.info('🔌 Desconectado de la base de datos');
    } catch (error) {
      Logger.error('❌ Error desconectando de la base de datos', {}, error as Error);
      throw error;
    }
  }

  static async healthCheck(): Promise<boolean> {
    try {
      const prisma = DatabaseClient.getInstance();
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      Logger.error('❌ Health check failed', {}, error as Error);
      return false;
    }
  }
}

export const prisma = DatabaseClient.getInstance();
export default DatabaseClient;
