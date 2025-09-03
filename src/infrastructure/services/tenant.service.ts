import { PrismaClient } from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { Tenant } from '../../domain/entities/tenant.entity';

export interface CreateTenantDTO {
  telegramId: bigint;
  companyName: string;
  ikeUsername: string;
  ikePassword: string;
  headless?: boolean;
}

export class TenantService {
  private prisma: PrismaClient;
  private encryptionKey: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-not-secure';
  }

  /**
   * Crear un nuevo tenant
   */
  async createTenant(dto: CreateTenantDTO): Promise<Tenant> {
    console.log(`👤 Registrando nuevo tenant: ${dto.companyName}`);

    // Encriptar contraseña
    const encryptedPassword = this.encryptPassword(dto.ikePassword);

    const tenantData = await this.prisma.tenant.create({
      data: {
        telegramId: dto.telegramId,
        companyName: dto.companyName,
        ikeUsername: dto.ikeUsername,
        ikePassword: encryptedPassword,
        headless: dto.headless ?? true,
      },
    });

    return new Tenant(
      tenantData.id,
      tenantData.telegramId,
      tenantData.companyName,
      tenantData.ikeUsername,
      tenantData.ikePassword,
      tenantData.headless,
      tenantData.isActive,
      tenantData.createdAt,
      tenantData.updatedAt
    );
  }

  /**
   * Obtener tenant por Telegram ID
   */
  async getTenantByTelegramId(telegramId: bigint): Promise<Tenant | null> {
    const tenantData = await this.prisma.tenant.findUnique({
      where: { telegramId },
    });

    if (!tenantData) return null;

    return new Tenant(
      tenantData.id,
      tenantData.telegramId,
      tenantData.companyName,
      tenantData.ikeUsername,
      tenantData.ikePassword,
      tenantData.headless,
      tenantData.isActive,
      tenantData.createdAt,
      tenantData.updatedAt
    );
  }

  /**
   * Obtener credenciales desencriptadas para un tenant por Telegram ID
   */
  async getCredentials(telegramId: bigint): Promise<{
    username: string;
    password: string;
    headless: boolean;
  } | null> {
    const tenant = await this.getTenantByTelegramId(telegramId);

    if (!tenant) return null;

    return {
      username: tenant.ikeUsername,
      password: this.decryptPassword(tenant.ikePassword),
      headless: tenant.headless,
    };
  }

  /**
   * Obtener credenciales desencriptadas para un tenant por ID
   */
  async getCredentialsByTenantId(tenantId: string): Promise<{
    username: string;
    password: string;
    headless: boolean;
  } | null> {
    const tenantData = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenantData) return null;

    return {
      username: tenantData.ikeUsername,
      password: this.decryptPassword(tenantData.ikePassword),
      headless: tenantData.headless,
    };
  }

  /**
   * Verificar si un tenant existe
   */
  async tenantExists(telegramId: bigint): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { telegramId },
      select: { id: true },
    });

    return tenant !== null;
  }

  /**
   * Actualizar credenciales de un tenant
   */
  async updateCredentials(
    telegramId: bigint,
    updates: {
      companyName?: string;
      ikeUsername?: string;
      ikePassword?: string;
      headless?: boolean;
    }
  ): Promise<Tenant> {
    const updateData: any = {};

    if (updates.companyName) updateData.companyName = updates.companyName;
    if (updates.ikeUsername) updateData.ikeUsername = updates.ikeUsername;
    if (updates.ikePassword) updateData.ikePassword = this.encryptPassword(updates.ikePassword);
    if (updates.headless !== undefined) updateData.headless = updates.headless;

    const tenantData = await this.prisma.tenant.update({
      where: { telegramId },
      data: updateData,
    });

    return new Tenant(
      tenantData.id,
      tenantData.telegramId,
      tenantData.companyName,
      tenantData.ikeUsername,
      tenantData.ikePassword,
      tenantData.headless,
      tenantData.isActive,
      tenantData.createdAt,
      tenantData.updatedAt
    );
  }

  /**
   * Registrar historial de procesamiento
   */
  async addProcessingHistory(
    telegramId: bigint,
    data: {
      total: number;
      aceptados: number;
      pendientes: number;
      tasaLiberacion: number;
      logicasUsadas: any;
      fileName?: string;
    }
  ): Promise<void> {
    const tenant = await this.getTenantByTelegramId(telegramId);
    if (!tenant) throw new Error('Tenant no encontrado');

    await this.prisma.processingHistory.create({
      data: {
        tenantId: tenant.id,
        total: data.total,
        aceptados: data.aceptados,
        pendientes: data.pendientes,
        tasaLiberacion: data.tasaLiberacion,
        logicasUsadas: data.logicasUsadas,
        fileName: data.fileName,
      },
    });

    console.log(
      `📊 Historial guardado para ${tenant.companyName}: ${data.aceptados}/${data.total} liberados`
    );
  }

  /**
   * Encriptar contraseña
   */
  private encryptPassword(password: string): string {
    return CryptoJS.AES.encrypt(password, this.encryptionKey).toString();
  }

  /**
   * Desencriptar contraseña
   */
  decryptPassword(encryptedPassword: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedPassword, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Cerrar conexión de Prisma
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
