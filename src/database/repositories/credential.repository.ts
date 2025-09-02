import { Credential, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma/client';
import { Logger } from '../../utils/logger';
import { CredentialData } from '../../types';
import { EncryptionUtils } from '../../utils/encryption';

export class CredentialRepository {
  private db: PrismaClient;

  constructor() {
    this.db = prisma;
  }

  async create(tenantId: string, username: string, password: string): Promise<CredentialData> {
    try {
      // Encriptar contraseña antes de guardar
      const encryptedPassword = EncryptionUtils.encryptCredentials(password);

      // Desactivar credenciales existentes
      await this.deactivateExisting(tenantId);

      const credential = await this.db.credential.create({
        data: {
          tenantId,
          username: EncryptionUtils.sanitizeInput(username),
          password: encryptedPassword,
        },
      });

      Logger.database('Credencial creada', {
        tenantId,
        metadata: { username },
      });

      return this.mapToCredentialData(credential);
    } catch (error) {
      Logger.error('Error creando credencial', { tenantId }, error as Error);
      throw error;
    }
  }

  async findActiveByTenant(tenantId: string): Promise<CredentialData | null> {
    try {
      const credential = await this.db.credential.findFirst({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return credential ? this.mapToCredentialData(credential) : null;
    } catch (error) {
      Logger.error('Error buscando credencial activa', { tenantId }, error as Error);
      throw error;
    }
  }

  async update(id: string, username: string, password: string): Promise<CredentialData> {
    try {
      const encryptedPassword = EncryptionUtils.encryptCredentials(password);

      const credential = await this.db.credential.update({
        where: { id },
        data: {
          username: EncryptionUtils.sanitizeInput(username),
          password: encryptedPassword,
        },
      });

      Logger.database('Credencial actualizada', {
        credentialId: id,
        metadata: { username },
      });

      return this.mapToCredentialData(credential);
    } catch (error) {
      Logger.error('Error actualizando credencial', { credentialId: id }, error as Error);
      throw error;
    }
  }

  async deactivate(id: string): Promise<void> {
    try {
      await this.db.credential.update({
        where: { id },
        data: { isActive: false },
      });

      Logger.database('Credencial desactivada', { credentialId: id });
    } catch (error) {
      Logger.error('Error desactivando credencial', { credentialId: id }, error as Error);
      throw error;
    }
  }

  async deactivateByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.db.credential.updateMany({
        where: {
          tenantId,
          isActive: true,
        },
        data: { isActive: false },
      });

      Logger.database('Credenciales desactivadas por tenant', {
        tenantId,
        metadata: { count: result.count },
      });

      return result.count;
    } catch (error) {
      Logger.error('Error desactivando credenciales por tenant', { tenantId }, error as Error);
      throw error;
    }
  }

  async findAllByTenant(tenantId: string): Promise<CredentialData[]> {
    try {
      const credentials = await this.db.credential.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      return credentials.map(this.mapToCredentialData);
    } catch (error) {
      Logger.error('Error obteniendo credenciales por tenant', { tenantId }, error as Error);
      throw error;
    }
  }

  async deleteByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.db.credential.deleteMany({
        where: { tenantId },
      });

      Logger.database('Credenciales eliminadas por tenant', {
        tenantId,
        metadata: { count: result.count },
      });

      return result.count;
    } catch (error) {
      Logger.error('Error eliminando credenciales por tenant', { tenantId }, error as Error);
      throw error;
    }
  }

  async upsert(tenantId: string, username: string, password: string): Promise<CredentialData> {
    try {
      const existingCredential = await this.findActiveByTenant(tenantId);

      if (existingCredential) {
        return await this.update(existingCredential.id, username, password);
      } else {
        return await this.create(tenantId, username, password);
      }
    } catch (error) {
      Logger.error('Error en upsert de credencial', { tenantId }, error as Error);
      throw error;
    }
  }

  async validateCredentials(
    tenantId: string
  ): Promise<{ username: string; password: string } | null> {
    try {
      const credential = await this.findActiveByTenant(tenantId);

      if (!credential) {
        return null;
      }

      // Desencriptar contraseña
      const decryptedPassword = EncryptionUtils.decryptCredentials(credential.password);

      return {
        username: credential.username,
        password: decryptedPassword,
      };
    } catch (error) {
      Logger.error('Error validando credenciales', { tenantId }, error as Error);
      throw error;
    }
  }

  async testCredentials(tenantId: string, username: string, password: string): Promise<boolean> {
    // Implementación para probar las credenciales contra el portal IKE
    // Por ahora, solo validamos que no estén vacías
    const isValid = username.trim().length > 0 && password.trim().length > 0;

    Logger.database('Credenciales probadas', {
      tenantId,
      metadata: { username, isValid },
    });

    return isValid;
  }

  private async deactivateExisting(tenantId: string): Promise<void> {
    await this.db.credential.updateMany({
      where: {
        tenantId,
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  private mapToCredentialData(credential: Credential): CredentialData {
    return {
      id: credential.id,
      tenantId: credential.tenantId,
      username: credential.username,
      password: credential.password, // Mantener encriptado
      isActive: credential.isActive,
    };
  }
}

export default CredentialRepository;
