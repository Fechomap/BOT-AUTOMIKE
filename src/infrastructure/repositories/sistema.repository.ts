import { SistemaRepository } from '../../application/use-cases/process-excel.use-case';

export class SistemaRepositoryImpl implements SistemaRepository {
  
  async searchExpediente(expediente: string, costoGuardado: number): Promise<{
    encontrado: boolean;
    costoSistema: number;
  }> {
    console.log(`🔍 Buscando expediente ${expediente} en sistema...`);
    
    // Simular tiempo de búsqueda
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const random = Math.random();
    
    // 5% no encontrado
    if (random < 0.05) {
      console.log(`❌ Expediente ${expediente} no encontrado`);
      return { encontrado: false, costoSistema: 0 };
    }
    
    // Generar costo del sistema basado en escenarios realistas
    let costoSistema: number;
    
    if (random < 0.25) {
      // 20% - Costo exacto (Lógica 1)
      costoSistema = costoGuardado;
    } else if (random < 0.50) {
      // 25% - Margen ±10% (Lógica 2)  
      const variation = (Math.random() - 0.5) * 0.2;
      costoSistema = Math.round(costoGuardado * (1 + variation) * 100) / 100;
    } else if (random < 0.70) {
      // 20% - Costo superior (Lógica 3)
      const increase = Math.random() * 0.5 + 0.1;
      costoSistema = Math.round(costoGuardado * (1 + increase) * 100) / 100;
    } else {
      // 30% - Fuera de rangos (Pendiente)
      const factor = Math.random() < 0.5 
        ? Math.random() * 0.8 
        : Math.random() * 2 + 1.6;
      costoSistema = Math.round(costoGuardado * factor * 100) / 100;
    }
    
    console.log(`✅ ${expediente} encontrado - Costo: $${costoSistema}`);
    
    return { encontrado: true, costoSistema };
  }
}