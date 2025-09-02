import { User, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma/client';
import { Logger } from '../../utils/logger';
import { UserData } from '../../types';

export class UserRepository {
  private db: PrismaClient;

  constructor() {
    this.db = prisma;
  }

  async create(
    telegramId: string,
    tenantId?: string,
    userData?: Partial<UserData>
  ): Promise<UserData> {
    try {
      const user = await this.db.user.create({
        data: {
          telegramId,
          tenantId,
          username: userData?.username,
          firstName: userData?.firstName,
          lastName: userData?.lastName,
        },
      });

      Logger.database('Usuario creado', {
        userId: user.id,
        tenantId,
        metadata: { telegramId, username: userData?.username },
      });

      return this.mapToUserData(user);
    } catch (error) {
      Logger.error(
        'Error creando usuario',
        {
          tenantId,
          metadata: { telegramId },
        },
        error as Error
      );
      throw error;
    }
  }

  async findByTelegramId(telegramId: string): Promise<UserData | null> {
    try {
      const user = await this.db.user.findUnique({
        where: { telegramId },
      });

      return user ? this.mapToUserData(user) : null;
    } catch (error) {
      Logger.error(
        'Error buscando usuario por Telegram ID',
        {
          metadata: { telegramId },
        },
        error as Error
      );
      throw error;
    }
  }

  async findById(id: string): Promise<UserData | null> {
    try {
      const user = await this.db.user.findUnique({
        where: { id },
      });

      return user ? this.mapToUserData(user) : null;
    } catch (error) {
      Logger.error('Error buscando usuario por ID', { userId: id }, error as Error);
      throw error;
    }
  }

  async linkToTenant(userId: string, tenantId: string): Promise<UserData> {
    try {
      const user = await this.db.user.update({
        where: { id: userId },
        data: { tenantId },
      });

      Logger.database('Usuario vinculado a tenant', { userId, tenantId });
      return this.mapToUserData(user);
    } catch (error) {
      Logger.error('Error vinculando usuario a tenant', { userId, tenantId }, error as Error);
      throw error;
    }
  }

  async unlinkFromTenant(userId: string): Promise<UserData> {
    try {
      const user = await this.db.user.update({
        where: { id: userId },
        data: { tenantId: null },
      });

      Logger.database('Usuario desvinculado de tenant', { userId });
      return this.mapToUserData(user);
    } catch (error) {
      Logger.error('Error desvinculando usuario de tenant', { userId }, error as Error);
      throw error;
    }
  }

  async updateProfile(userId: string, data: Partial<UserData>): Promise<UserData> {
    try {
      const user = await this.db.user.update({
        where: { id: userId },
        data: {
          username: data.username,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });

      Logger.database('Perfil de usuario actualizado', { userId });
      return this.mapToUserData(user);
    } catch (error) {
      Logger.error('Error actualizando perfil de usuario', { userId }, error as Error);
      throw error;
    }
  }

  async deactivate(userId: string): Promise<void> {
    try {
      await this.db.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      Logger.database('Usuario desactivado', { userId });
    } catch (error) {
      Logger.error('Error desactivando usuario', { userId }, error as Error);
      throw error;
    }
  }

  async findByTenantId(tenantId: string): Promise<UserData[]> {
    try {
      const users = await this.db.user.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return users.map(this.mapToUserData);
    } catch (error) {
      Logger.error('Error obteniendo usuarios por tenant', { tenantId }, error as Error);
      throw error;
    }
  }

  async getOrCreateUser(telegramId: string, userData?: Partial<UserData>): Promise<UserData> {
    try {
      let user = await this.findByTelegramId(telegramId);

      if (!user) {
        user = await this.create(telegramId, undefined, userData);
      } else {
        // Actualizar datos si es necesario
        if (
          userData &&
          (userData.username !== user.username ||
            userData.firstName !== user.firstName ||
            userData.lastName !== user.lastName)
        ) {
          user = await this.updateProfile(user.id, userData);
        }
      }

      return user;
    } catch (error) {
      Logger.error(
        'Error obteniendo o creando usuario',
        {
          metadata: { telegramId },
        },
        error as Error
      );
      throw error;
    }
  }

  private mapToUserData(user: User): UserData {
    return {
      id: user.id,
      telegramId: user.telegramId,
      tenantId: user.tenantId || undefined,
      username: user.username || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      isActive: user.isActive,
    };
  }
}

export default UserRepository;
