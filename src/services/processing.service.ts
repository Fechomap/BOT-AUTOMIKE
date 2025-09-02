import { ExcelService, ExcelData } from '../core/excel/excel.service';
import {
  ValidationService,
  ValidationContext,
  ValidationOptions,
} from '../core/validation/validation.service';
import { ExpedienteRepository } from '../database/repositories/expediente.repository';
import { ValidationRepository } from '../database/repositories/validation.repository';
import { Logger } from '../utils/logger';
import {
  ExcelProcessingResult,
  ProcessingProgress,
  ExpedienteEstado,
  ResultadoValidacion,
  LogicaValidacion,
} from '../types';

export interface ProcessingRequest {
  tenantId: string;
  filePath: string;
  options: ValidationOptions;
  progressCallback?: (_progress: ProcessingProgress) => Promise<void>;
}

export interface ProcessedExpediente extends ExcelData {
  costoSistema?: number;
  validacion: string;
  notas: string;
  fechaRegistro?: string;
  servicio?: string;
  subservicio?: string;
  logica: number;
  fechaValidacion: string;
}

export class ProcessingService {
  private excelService: ExcelService;
  private expedienteRepo: ExpedienteRepository;
  private validationRepo: ValidationRepository;

  constructor() {
    this.excelService = new ExcelService();
    this.expedienteRepo = new ExpedienteRepository();
    this.validationRepo = new ValidationRepository();
  }

  /**
   * Procesa un archivo Excel completo
   */
  async processExcelFile(request: ProcessingRequest): Promise<ExcelProcessingResult> {
    const { tenantId, filePath, options, progressCallback } = request;

    Logger.info(`Iniciando procesamiento de archivo para tenant ${tenantId}`);

    try {
      // 1. Leer Excel
      const excelData = await this.excelService.readExcelFile(filePath);

      if (excelData.length === 0) {
        throw new Error('No se encontraron datos válidos en el archivo');
      }

      Logger.info(`${excelData.length} expedientes encontrados en Excel`, { tenantId });

      // 2. Procesar expedientes
      const result = await this.processBatch(tenantId, excelData, options, progressCallback);

      Logger.info(`Procesamiento completado`, {
        tenantId,
        metadata: {
          total: result.totalRows,
          aceptados: result.aceptados,
          pendientes: result.pendientes,
          noEncontrados: result.noEncontrados,
        },
      });

      return result;
    } catch (error) {
      Logger.error('Error procesando archivo Excel', { tenantId }, error as Error);
      throw error;
    }
  }

  /**
   * Procesa un lote de expedientes
   */
  private async processBatch(
    tenantId: string,
    excelData: ExcelData[],
    options: ValidationOptions,
    progressCallback?: (_progress: ProcessingProgress) => Promise<void>
  ): Promise<ExcelProcessingResult> {
    const result: ExcelProcessingResult = {
      totalRows: excelData.length,
      processedRows: 0,
      aceptados: 0,
      pendientes: 0,
      noEncontrados: 0,
      errors: [],
    };

    const processedExpedientes: ProcessedExpediente[] = [];

    for (let i = 0; i < excelData.length; i++) {
      const expedienteData = excelData[i];

      try {
        // Reportar progreso
        if (progressCallback) {
          await progressCallback({
            current: i + 1,
            total: excelData.length,
            percentage: Math.round(((i + 1) / excelData.length) * 100),
            currentExpediente: expedienteData.expediente,
            errors: result.errors.length,
          });
        }

        // Procesar expediente individual
        const processed = await this.processExpedienteIndividual(tenantId, expedienteData, options);

        processedExpedientes.push(processed);
        result.processedRows++;

        // Actualizar contadores
        switch (processed.validacion) {
          case ResultadoValidacion.ACEPTADO:
            result.aceptados++;
            break;
          case ResultadoValidacion.PENDIENTE:
            result.pendientes++;
            break;
          case ResultadoValidacion.NO_ENCONTRADO:
            result.noEncontrados++;
            break;
        }
      } catch (error) {
        const errorMsg = `Expediente ${expedienteData.expediente}: ${(error as Error).message}`;
        result.errors.push(errorMsg);
        Logger.warn(errorMsg, { tenantId });

        // Agregar expediente con error
        processedExpedientes.push({
          ...expedienteData,
          validacion: ResultadoValidacion.NO_ENCONTRADO,
          notas: errorMsg,
          logica: 0,
          fechaValidacion: new Date().toLocaleString('es-ES'),
        });

        result.noEncontrados++;
        result.processedRows++;
      }
    }

    // Generar archivo de resultados
    const resultFileName = ExcelService.generateResultFileName(`results_${tenantId}`);
    result.filePath = await this.excelService.generateResultsExcel(
      excelData,
      result,
      resultFileName,
      processedExpedientes
    );

    return result;
  }

  /**
   * Procesa un expediente individual
   */
  private async processExpedienteIndividual(
    tenantId: string,
    excelData: ExcelData,
    options: ValidationOptions
  ): Promise<ProcessedExpediente> {
    const { expediente, costoGuardado } = excelData;

    Logger.processing(`Procesando expediente ${expediente}`, expediente, tenantId);

    // Simular búsqueda en sistema (aquí iría la integración con Puppeteer)
    const sistemaData = await this.buscarEnSistema(expediente);

    if (!sistemaData.encontrado) {
      // Guardar en BD como no encontrado
      await this.expedienteRepo.upsert({
        tenantId,
        expedienteNum: expediente,
        costoGuardado,
        estado: ExpedienteEstado.NO_ENCONTRADO,
        notas: 'Expediente no encontrado en el sistema',
      });

      return {
        expediente,
        costoGuardado,
        validacion: ResultadoValidacion.NO_ENCONTRADO,
        notas: 'Expediente no encontrado en el sistema',
        logica: 0,
        fechaValidacion: new Date().toLocaleString('es-ES'),
      };
    }

    // Si no hay costo guardado, no se puede validar
    if (!costoGuardado) {
      await this.expedienteRepo.upsert({
        tenantId,
        expedienteNum: expediente,
        costoSistema: sistemaData.costo,
        estado: ExpedienteEstado.PENDIENTE,
        fechaRegistro: sistemaData.fechaRegistro,
        servicio: sistemaData.servicio,
        subservicio: sistemaData.subservicio,
        notas: 'Sin costo de referencia para validar',
      });

      return {
        expediente,
        costoSistema: sistemaData.costo,
        validacion: ResultadoValidacion.PENDIENTE,
        notas: 'Sin costo de referencia para validar',
        fechaRegistro: sistemaData.fechaRegistro?.toISOString().split('T')[0],
        servicio: sistemaData.servicio,
        subservicio: sistemaData.subservicio,
        logica: 0,
        fechaValidacion: new Date().toLocaleString('es-ES'),
      };
    }

    // Ejecutar validación
    const validationContext: ValidationContext = {
      expedienteNum: expediente,
      costoGuardado,
      costoSistema: sistemaData.costo!,
      tenantId,
    };

    const validationResult = ValidationService.validateExpediente(validationContext, options);

    // Guardar expediente en BD
    const expedienteRecord = await this.expedienteRepo.upsert({
      tenantId,
      expedienteNum: expediente,
      costoGuardado,
      costoSistema: sistemaData.costo,
      estado: validationResult.estado,
      fechaRegistro: sistemaData.fechaRegistro,
      servicio: sistemaData.servicio,
      subservicio: sistemaData.subservicio,
      notas: validationResult.mensaje,
    });

    // Guardar validación si se aplicó una lógica
    if (validationResult.logicaUsada > 0) {
      await this.validationRepo.create({
        expedienteId: expedienteRecord.id,
        tenantId,
        logicaUsada: validationResult.logicaUsada as LogicaValidacion,
        resultado: validationResult.resultado,
        costoAnterior: costoGuardado,
        costoNuevo: sistemaData.costo,
      });
    }

    // Si debe liberarse automáticamente, ejecutar liberación
    if (validationResult.debeLiberarse) {
      await this.liberarExpediente(expediente, sistemaData.costo!);
    }

    return {
      expediente,
      costoGuardado,
      costoSistema: sistemaData.costo,
      validacion: validationResult.resultado,
      notas: validationResult.mensaje,
      fechaRegistro: sistemaData.fechaRegistro?.toISOString().split('T')[0],
      servicio: sistemaData.servicio,
      subservicio: sistemaData.subservicio,
      logica: validationResult.logicaUsada as number,
      fechaValidacion: new Date().toLocaleString('es-ES'),
    };
  }

  /**
   * Busca un expediente en el sistema IKE
   * TODO: Integrar con AutomationService/Puppeteer
   */
  private async buscarEnSistema(expediente: string): Promise<{
    encontrado: boolean;
    costo?: number;
    fechaRegistro?: Date;
    servicio?: string;
    subservicio?: string;
  }> {
    // Por ahora simulamos la búsqueda
    // En la implementación real, aquí se llamaría al AutomationService

    Logger.automation(`Simulando búsqueda de expediente ${expediente}`, {
      expedienteNum: expediente,
      action: 'search_simulation',
    });

    // Simular delay de búsqueda
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simular diferentes escenarios
    const random = Math.random();

    if (random < 0.1) {
      // 10% no encontrado
      return { encontrado: false };
    }

    // 90% encontrado con datos simulados
    return {
      encontrado: true,
      costo: Math.round((Math.random() * 10000 + 1000) * 100) / 100,
      fechaRegistro: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      servicio: `Servicio ${Math.floor(Math.random() * 5) + 1}`,
      subservicio: `Subservicio ${Math.floor(Math.random() * 10) + 1}`,
    };
  }

  /**
   * Libera un expediente automáticamente
   * TODO: Integrar con AutomationService/Puppeteer
   */
  private async liberarExpediente(expediente: string, costo: number): Promise<void> {
    Logger.automation(`Simulando liberación de expediente ${expediente}`, {
      expedienteNum: expediente,
      action: 'release_simulation',
      metadata: { costo },
    });

    // Simular delay de liberación
    await new Promise((resolve) => setTimeout(resolve, 200));

    // En la implementación real, aquí se ejecutaría la liberación via Puppeteer
    Logger.automation(`✅ Expediente ${expediente} liberado exitosamente`, {
      expedienteNum: expediente,
      action: 'released',
      metadata: { costo },
    });
  }

  /**
   * Revalida expedientes pendientes
   */
  async revalidatePendientes(
    tenantId: string,
    options: ValidationOptions
  ): Promise<ExcelProcessingResult> {
    try {
      Logger.info(`Iniciando revalidación de pendientes para tenant ${tenantId}`);

      // Obtener expedientes pendientes
      const pendientes = await this.expedienteRepo.findPendientesByTenant(tenantId);

      if (pendientes.length === 0) {
        Logger.info('No hay expedientes pendientes para revalidar', { tenantId });
        return {
          totalRows: 0,
          processedRows: 0,
          aceptados: 0,
          pendientes: 0,
          noEncontrados: 0,
          errors: [],
        };
      }

      Logger.info(`${pendientes.length} expedientes pendientes encontrados`, { tenantId });

      const result: ExcelProcessingResult = {
        totalRows: pendientes.length,
        processedRows: 0,
        aceptados: 0,
        pendientes: 0,
        noEncontrados: 0,
        errors: [],
      };

      for (const expediente of pendientes) {
        try {
          if (!expediente.costoGuardado || !expediente.costoSistema) {
            continue;
          }

          const validationContext: ValidationContext = {
            expedienteNum: expediente.expedienteNum,
            costoGuardado: expediente.costoGuardado,
            costoSistema: expediente.costoSistema,
            tenantId,
          };

          const validationResult = ValidationService.validateExpediente(validationContext, options);

          // Solo procesar si cambió el resultado
          if (validationResult.resultado !== ResultadoValidacion.PENDIENTE) {
            // Actualizar expediente
            await this.expedienteRepo.update(expediente.id, {
              estado: validationResult.estado,
              notas: validationResult.mensaje,
            });

            // Crear nueva validación
            await this.validationRepo.create({
              expedienteId: expediente.id,
              tenantId,
              logicaUsada: validationResult.logicaUsada as LogicaValidacion,
              resultado: validationResult.resultado,
              costoAnterior: expediente.costoGuardado,
              costoNuevo: expediente.costoSistema,
            });

            // Liberar si es necesario
            if (validationResult.debeLiberarse) {
              await this.liberarExpediente(expediente.expedienteNum, expediente.costoSistema);
              result.aceptados++;
            }

            Logger.processing(
              `Expediente revalidado: ${expediente.expedienteNum} -> ${validationResult.resultado}`,
              expediente.expedienteNum,
              tenantId
            );
          } else {
            result.pendientes++;
          }

          result.processedRows++;
        } catch (error) {
          const errorMsg = `Error revalidando ${expediente.expedienteNum}: ${(error as Error).message}`;
          result.errors.push(errorMsg);
          Logger.error(errorMsg, { tenantId });
        }
      }

      Logger.info(`Revalidación completada`, {
        tenantId,
        metadata: {
          total: result.totalRows,
          procesados: result.processedRows,
          nuevosAceptados: result.aceptados,
        },
      });

      return result;
    } catch (error) {
      Logger.error('Error en revalidación de pendientes', { tenantId }, error as Error);
      throw error;
    }
  }

  /**
   * Obtiene el progreso actual de un procesamiento
   */
  async getProcessingStatus(_tenantId: string): Promise<ProcessingProgress | null> {
    // En una implementación real, esto podría estar en Redis o similar
    // Por ahora retornamos null (no hay procesamiento activo)
    return null;
  }
}

export default ProcessingService;
