import { TenantRepository } from '../database/repositories/tenant.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { TenantData, UserData } from '../types';
import { EncryptionUtils } from '../utils/encryption';
import { Logger } from '../utils/logger';

export interface RegisterData {
  email: string;
  businessName: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  tenant?: TenantData;
  user?: UserData;
  error?: string;
}

export class AuthService {
  private tenantRepo: TenantRepository;
  private userRepo: UserRepository;

  constructor() {
    this.tenantRepo = new TenantRepository();
    this.userRepo = new UserRepository();
  }

  async register(telegramId: string, data: RegisterData): Promise<AuthResult> {
    try {
      // Validar datos
      const validation = this.validateRegisterData(data);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Crear tenant
      const tenant = await this.tenantRepo.create(
        data.email.toLowerCase(),
        data.businessName,
        data.password
      );

      // Obtener o crear usuario
      const user = await this.userRepo.getOrCreateUser(telegramId);

      // Vincular usuario al tenant
      const linkedUser = await this.userRepo.linkToTenant(user.id, tenant.id);

      // Crear configuraciones por defecto
      await this.tenantRepo.createDefaultSettings(tenant.id);

      Logger.info('Registro exitoso', {
        tenantId: tenant.id,
        userId: linkedUser.id,
        metadata: { email: data.email, businessName: data.businessName },
      });

      return {
        success: true,
        tenant,
        user: linkedUser,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

      Logger.error(
        'Error en registro',
        {
          metadata: { telegramId, email: data.email },
        },
        error as Error
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async login(telegramId: string, data: LoginData): Promise<AuthResult> {
    try {
      // Validar credenciales
      const tenant = await this.tenantRepo.validateCredentials(
        data.email.toLowerCase(),
        data.password
      );

      if (!tenant) {
        return {
          success: false,
          error: 'Email o contraseña incorrectos',
        };
      }

      // Obtener o crear usuario
      const user = await this.userRepo.getOrCreateUser(telegramId);

      // Vincular usuario al tenant si no está vinculado
      let linkedUser = user;
      if (user.tenantId !== tenant.id) {
        linkedUser = await this.userRepo.linkToTenant(user.id, tenant.id);
      }

      // Actualizar último login
      await this.tenantRepo.updateLastLogin(tenant.id);

      Logger.info('Login exitoso', {
        tenantId: tenant.id,
        userId: linkedUser.id,
        metadata: { email: data.email },
      });

      return {
        success: true,
        tenant,
        user: linkedUser,
      };
    } catch (error) {
      Logger.error(
        'Error en login',
        {
          metadata: { telegramId, email: data.email },
        },
        error as Error
      );

      return {
        success: false,
        error: 'Error interno del servidor',
      };
    }
  }

  async logout(userId: string): Promise<void> {
    try {
      await this.userRepo.unlinkFromTenant(userId);

      Logger.info('Logout exitoso', { userId });
    } catch (error) {
      Logger.error('Error en logout', { userId }, error as Error);
      throw error;
    }
  }

  async getCurrentSession(
    telegramId: string
  ): Promise<{ tenant: TenantData | null; user: UserData | null }> {
    try {
      const user = await this.userRepo.findByTelegramId(telegramId);

      if (!user || !user.tenantId) {
        return { tenant: null, user };
      }

      const tenant = await this.tenantRepo.findById(user.tenantId);

      return { tenant, user };
    } catch (error) {
      Logger.error(
        'Error obteniendo sesión actual',
        {
          metadata: { telegramId },
        },
        error as Error
      );

      return { tenant: null, user: null };
    }
  }

  async isUserAuthenticated(telegramId: string): Promise<boolean> {
    try {
      const { tenant, user } = await this.getCurrentSession(telegramId);
      return !!(tenant && user && tenant.isActive);
    } catch (error) {
      return false;
    }
  }

  private validateRegisterData(data: RegisterData): { isValid: boolean; error?: string } {
    if (!data.email || !EncryptionUtils.isValidEmail(data.email)) {
      return { isValid: false, error: 'Email inválido' };
    }

    if (!data.businessName || data.businessName.trim().length < 2) {
      return { isValid: false, error: 'Nombre comercial debe tener al menos 2 caracteres' };
    }

    if (!data.password || !EncryptionUtils.isValidPassword(data.password)) {
      return { isValid: false, error: 'La contraseña debe tener al menos 8 caracteres' };
    }

    return { isValid: true };
  }
}

export default AuthService;
