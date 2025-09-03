import { SistemaExpedientesService } from '../../domain/interfaces/sistema-expedientes.interface';
import { DatosSistema } from '../../domain/services/expediente-validation.service';
import { SistemaRepositoryImpl } from '../repositories/sistema.repository';
import { TenantService } from '../services/tenant.service';

export class SistemaServiceAdapter implements SistemaExpedientesService {
  private credentialsCache = new Map<
    string,
    {
      configured: boolean;
      timestamp: number;
    }
  >();
  private tenantService: TenantService;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(private sistemaRepo: SistemaRepositoryImpl) {
    this.tenantService = new TenantService();
  }

  async configurarCredenciales(tenantId: string): Promise<void> {
    const cached = this.credentialsCache.get(tenantId);
    const now = Date.now();

    if (cached && cached.configured && now - cached.timestamp < this.CACHE_TTL) {
      return;
    }

    try {
      const credentials = await this.tenantService.getCredentialsByTenantId(tenantId);

      if (!credentials) {
        throw new Error(`No se encontraron credenciales para tenant: ${tenantId}`);
      }

      console.log(`🔐 Configurando credenciales IKE para tenant: ${tenantId.substring(0, 8)}...`);

      this.sistemaRepo.setCredentials({
        username: credentials.username,
        password: credentials.password,
        headless: credentials.headless,
      });

      this.credentialsCache.set(tenantId, {
        configured: true,
        timestamp: now,
      });
    } catch (error) {
      console.error(`❌ Error configurando credenciales para tenant ${tenantId}:`, error);
      this.credentialsCache.delete(tenantId);
      throw error;
    }
  }

  async buscarExpediente(numero: string, costoGuardado: number): Promise<DatosSistema> {
    try {
      const resultado = await this.sistemaRepo.searchExpediente(numero, costoGuardado);
      return {
        encontrado: resultado.encontrado,
        costoSistema: resultado.costoSistema,
      };
    } catch (error) {
      console.error(`❌ Error buscando expediente ${numero}:`, error);
      throw error;
    }
  }

  async liberarExpediente(numero: string, costo: number): Promise<boolean> {
    try {
      console.log(`💰 Intentando liberar expediente ${numero} con costo ${costo}`);
      return false;
    } catch (error) {
      console.error(`❌ Error liberando expediente ${numero}:`, error);
      return false;
    }
  }

  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.credentialsCache.delete(tenantId);
    } else {
      this.credentialsCache.clear();
    }
  }
}
