import { DatosSistema } from '../services/expediente-validation.service';

export interface SistemaExpedientesService {
  buscarExpediente(numero: string, costoGuardado: number): Promise<DatosSistema>;
  liberarExpediente(numero: string, costo: number): Promise<boolean>;
  configurarCredenciales?(tenantId: string): Promise<void>;
}
