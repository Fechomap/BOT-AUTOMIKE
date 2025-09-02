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
}

export interface ProcessExcelDTO {
  filePath: string;
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
    // 1. Leer Excel
    const expedientes = await this.excelRepo.readFile(dto.filePath);
    
    if (expedientes.length === 0) {
      throw new Error('No se encontraron expedientes válidos');
    }

    // 2. Procesar cada expediente
    const results: ValidationResult[] = [];
    
    for (const expediente of expedientes) {
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

      // Validar
      const validation = ValidationDomainService.validate(
        expediente.numero,
        expediente.costoGuardado,
        sistemaResult.costoSistema
      );

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