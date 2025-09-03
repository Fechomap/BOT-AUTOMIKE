import { Expediente } from '../../domain/entities/expediente.entity';
import { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import { ValidationDomainService } from '../../domain/services/validation-domain.service';

export interface ExcelRepository {
  readFile(filePath: string): Promise<Expediente[]>;
  writeResults(results: any[], fileName: string): Promise<string>;
}

export interface SistemaRepository {
  searchExpediente(expediente: string, costoGuardado: number): Promise<{
    encontrado: boolean;
    costoSistema: number;
  }>;
  acceptCost(): Promise<boolean>;
}

export interface ProcessExcelDTO {
  filePath: string;
  logicasActivas?: {
    costoExacto: boolean;      // Siempre activa
    margen10Porciento: boolean;
    costoSuperior: boolean;
  };
  tenantId?: string; // ID del tenant para obtener credenciales específicas
}

export interface ProcessResultDTO {
  total: number;
  aceptados: number;
  pendientes: number;
  tasaLiberacion: number;
  porLogica: {
    logica1: number;
    logica2: number;
    logica3: number;
  };
  resultFilePath: string;
}

export class ProcessExcelUseCase {
  constructor(
    private readonly excelRepo: ExcelRepository,
    private readonly sistemaRepo: SistemaRepository
  ) {}

  async execute(dto: ProcessExcelDTO): Promise<ProcessResultDTO> {
    // Si se proporciona tenantId, configurar credenciales específicas del tenant
    if (dto.tenantId) {
      const { TenantService } = await import('../../infrastructure/services/tenant.service');
      const tenantService = new TenantService();
      
      try {
        const credentials = await tenantService.getCredentialsByTenantId(dto.tenantId);
        
        if (credentials) {
          console.log(`🔐 Configurando credenciales específicas para tenant: ${dto.tenantId}`);
          // Configurar el sistema repository con las credenciales del tenant
          if ('setCredentials' in this.sistemaRepo) {
            (this.sistemaRepo as any).setCredentials(credentials);
          }
        } else {
          console.warn(`⚠️ No se encontraron credenciales para tenant: ${dto.tenantId}`);
        }
      } catch (error) {
        console.error('❌ Error obteniendo credenciales del tenant:', error);
      } finally {
        await tenantService.disconnect();
      }
    }
    // 1. Leer Excel
    const expedientes = await this.excelRepo.readFile(dto.filePath);
    
    if (expedientes.length === 0) {
      throw new Error('No se encontraron expedientes válidos');
    }

    // 2. Configurar lógicas (por defecto todas activas para mantener compatibilidad)
    const logicasActivas = dto.logicasActivas || {
      costoExacto: true,
      margen10Porciento: true,
      costoSuperior: true
    };

    // 3. Procesar cada expediente
    const results: ValidationResult[] = [];
    
    for (const expediente of expedientes) {
      console.log(`🔍 Procesando expediente: ${expediente.numero}`);
      
      // Buscar en sistema
      const sistemaResult = await this.sistemaRepo.searchExpediente(
        expediente.numero, 
        expediente.costoGuardado
      );
      
      if (!sistemaResult.encontrado) {
        results.push(new ValidationResult(
          expediente.numero,
          expediente.costoGuardado,
          0,
          0,
          'PENDIENTE' as any,
          'No encontrado en sistema',
          false
        ));
        continue;
      }

      // Validar con lógicas configuradas
      const validation = ValidationDomainService.validate(
        expediente.numero,
        expediente.costoGuardado,
        sistemaResult.costoSistema,
        logicasActivas
      );

      // Si debe liberarse, intentar aceptar el costo en el portal
      if (validation.debeLiberarse) {
        console.log(`💰 Expediente ${expediente.numero} cumple lógica, intentando liberar...`);
        
        try {
          const liberado = await this.sistemaRepo.acceptCost();
          if (liberado) {
            console.log(`✅ Expediente ${expediente.numero} liberado exitosamente`);
            validation.mensaje += ' - LIBERADO EN PORTAL';
          } else {
            console.log(`⚠️ Expediente ${expediente.numero} no se pudo liberar en portal`);
            validation.mensaje += ' - ERROR AL LIBERAR';
          }
        } catch (error) {
          console.error(`❌ Error liberando expediente ${expediente.numero}:`, error);
          validation.mensaje += ' - ERROR AL LIBERAR';
        }
      }

      results.push(validation);
    }

    // 3. Generar estadísticas
    const stats = this.calculateStats(results);

    // 4. Generar archivo de resultados
    const resultData = results.map(r => ({
      Expediente: r.expediente,
      'Costo Guardado': r.costoGuardado,
      'Costo Sistema': r.costoSistema,
      'Lógica Usada': r.logicaUsada || 'Ninguna',
      Resultado: r.resultado,
      Mensaje: r.mensaje
    }));

    const resultFilePath = await this.excelRepo.writeResults(
      resultData, 
      `resultados_${Date.now()}.xlsx`
    );

    return {
      total: stats.total,
      aceptados: stats.aceptados,
      pendientes: stats.pendientes,
      tasaLiberacion: stats.tasaLiberacion,
      porLogica: stats.porLogica,
      resultFilePath
    };
  }

  private calculateStats(results: ValidationResult[]) {
    const stats = {
      total: results.length,
      aceptados: 0,
      pendientes: 0,
      porLogica: { logica1: 0, logica2: 0, logica3: 0 },
      tasaLiberacion: 0
    };

    results.forEach(result => {
      if (result.debeLiberarse) {
        stats.aceptados++;
        switch (result.logicaUsada) {
          case 1: stats.porLogica.logica1++; break;
          case 2: stats.porLogica.logica2++; break;
          case 3: stats.porLogica.logica3++; break;
        }
      } else {
        stats.pendientes++;
      }
    });

    stats.tasaLiberacion = stats.total > 0 ? (stats.aceptados / stats.total) * 100 : 0;
    return stats;
  }
}