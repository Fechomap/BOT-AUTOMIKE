import { Tenant, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma/client';
import { Logger } from '../../utils/logger';
import { TenantData } from '../../types';
import { EncryptionUtils } from '../../utils/encryption';

export class TenantRepository {
  private db: PrismaClient;

  constructor() {
    this.db = prisma;
  }

  async create(email: string, businessName: string, password: string): Promise<TenantData> {
    try {
      // Verificar si el email ya existe
      const existingTenant = await this.findByEmail(email);
      if (existingTenant) {
        throw new Error('El email ya está registrado');
      }

      // Hash de la contraseña
      const hashedPassword = await EncryptionUtils.hashPassword(password);

      // Crear el tenant
      const tenant = await this.db.tenant.create({
        data: {
          email: EncryptionUtils.sanitizeInput(email),
          businessName: EncryptionUtils.sanitizeInput(businessName),
          password: hashedPassword,
        },
      });

      Logger.database('Tenant creado', {
        tenantId: tenant.id,
        metadata: { email, businessName },
      });

      return this.mapToTenantData(tenant);
    } catch (error) {
      Logger.error('Error creando tenant', { metadata: { email, businessName } }, error as Error);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<TenantData | null> {
    try {
      const tenant = await this.db.tenant.findUnique({
        where: { email: EncryptionUtils.sanitizeInput(email) },
      });

      return tenant ? this.mapToTenantData(tenant) : null;
    } catch (error) {
      Logger.error('Error buscando tenant por email', { metadata: { email } }, error as Error);
      throw error;
    }
  }

  async findById(id: string): Promise<TenantData | null> {
    try {
      const tenant = await this.db.tenant.findUnique({
        where: { id },
      });

      return tenant ? this.mapToTenantData(tenant) : null;
    } catch (error) {
      Logger.error('Error buscando tenant por ID', { tenantId: id }, error as Error);
      throw error;
    }
  }

  async validateCredentials(email: string, password: string): Promise<TenantData | null> {
    try {
      const tenant = await this.db.tenant.findUnique({
        where: {
          email: EncryptionUtils.sanitizeInput(email),
          isActive: true,
        },
      });

      if (!tenant) {
        Logger.security('Intento de login con email inexistente', {
          metadata: { email },
        });
        return null;
      }

      const isValidPassword = await EncryptionUtils.comparePassword(password, tenant.password);
      if (!isValidPassword) {
        Logger.security('Intento de login con contraseña incorrecta', {
          tenantId: tenant.id,
          metadata: { email },
        });
        return null;
      }

      Logger.database('Login exitoso', { tenantId: tenant.id });
      return this.mapToTenantData(tenant);
    } catch (error) {
      Logger.error('Error validando credenciales', { metadata: { email } }, error as Error);
      throw error;
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    try {
      await this.db.tenant.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      Logger.database('Last login actualizado', { tenantId: id });
    } catch (error) {
      Logger.error('Error actualizando last login', { tenantId: id }, error as Error);
      throw error;
    }
  }

  async deactivate(id: string): Promise<void> {
    try {
      await this.db.tenant.update({
        where: { id },
        data: { isActive: false },
      });

      Logger.database('Tenant desactivado', { tenantId: id });
    } catch (error) {
      Logger.error('Error desactivando tenant', { tenantId: id }, error as Error);
      throw error;
    }
  }

  async getAllActive(): Promise<TenantData[]> {
    try {
      const tenants = await this.db.tenant.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      return tenants.map(this.mapToTenantData);
    } catch (error) {
      Logger.error('Error obteniendo tenants activos', {}, error as Error);
      throw error;
    }
  }

  // Método para crear configuraciones por defecto
  async createDefaultSettings(tenantId: string): Promise<void> {
    try {
      const defaultSettings = [
        { key: 'enable_logica_2', value: 'false' },
        { key: 'enable_logica_3', value: 'false' },
        { key: 'notifications_enabled', value: 'true' },
        { key: 'auto_revalidation', value: 'true' },
      ];

      for (const setting of defaultSettings) {
        await this.db.tenantSetting.upsert({
          where: {
            tenantId_key: {
              tenantId,
              key: setting.key,
            },
          },
          update: { value: setting.value },
          create: {
            tenantId,
            key: setting.key,
            value: setting.value,
          },
        });
      }

      Logger.database('Configuraciones por defecto creadas', { tenantId });
    } catch (error) {
      Logger.error('Error creando configuraciones por defecto', { tenantId }, error as Error);
      throw error;
    }
  }

  private mapToTenantData(tenant: Tenant): TenantData {
    return {
      id: tenant.id,
      email: tenant.email,
      businessName: tenant.businessName,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
    };
  }
}

export default TenantRepository;
