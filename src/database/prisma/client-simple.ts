import { PrismaClient } from '@prisma/client';
import { Logger } from '../../utils/logger';

class DatabaseClient {
  private static instance: PrismaClient;

  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new PrismaClient();
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
