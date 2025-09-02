import { SistemaRepository } from '../../application/use-cases/process-excel.use-case';
import { IkePortalService, IkePortalConfig } from '../services/ike-portal.service';

export class SistemaRepositoryImpl implements SistemaRepository {
  private portalService: IkePortalService | null = null;
  private credentials: IkePortalConfig | null = null;

  /**
   * Establece las credenciales sin inicializar el navegador
   */
  setCredentials(config: IkePortalConfig): void {
    this.credentials = config;
  }

  /**
   * Configura el servicio para usar automatización real
   */
  async configureRealAutomation(config: IkePortalConfig): Promise<void> {
    this.portalService = new IkePortalService(config);
    await this.portalService.initialize();
    console.log('✅ Automatización real configurada');
  }

  /**
   * Inicializa la automatización bajo demanda
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.portalService && this.credentials) {
      console.log('🔐 Inicializando Portal IKE por primera vez...');
      await this.configureRealAutomation(this.credentials);
    }
  }

  async searchExpediente(expediente: string, costoGuardado: number): Promise<{
    encontrado: boolean;
    costoSistema: number;
  }> {
    // Inicializar navegador bajo demanda
    await this.ensureInitialized();
    
    if (!this.portalService || !this.portalService.isReady()) {
      throw new Error('Portal IKE no configurado. Configure las credenciales IKE_USERNAME y IKE_PASSWORD en .env');
    }

    return await this.searchWithRealAutomation(expediente);
  }

  /**
   * Búsqueda con automatización real del Portal IKE
   */
  private async searchWithRealAutomation(expediente: string): Promise<{
    encontrado: boolean;
    costoSistema: number;
  }> {
    const result = await this.portalService!.searchExpediente(expediente);
    return {
      encontrado: result.encontrado,
      costoSistema: result.costoSistema
    };
  }

  /**
   * Limpia recursos
   */
  async cleanup(): Promise<void> {
    if (this.portalService) {
      await this.portalService.close();
      this.portalService = null;
    }
  }
}