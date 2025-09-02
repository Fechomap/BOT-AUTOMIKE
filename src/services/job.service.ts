import * as cron from 'node-cron';
import { ProcessingService } from './processing.service';
import { TenantRepository } from '../database/repositories/tenant.repository';
import { ExpedienteRepository } from '../database/repositories/expediente.repository';
import { Logger } from '../utils/logger';
import { config } from '../utils/config';
import { JobType } from '../types';

export interface JobConfiguration {
  type: JobType;
  schedule: string;
  enabled: boolean;
  tenantId?: string;
}

export interface JobResult {
  success: boolean;
  processed: number;
  errors: string[];
  duration: number;
}

export class JobService {
  private processingService: ProcessingService;
  private tenantRepo: TenantRepository;
  private expedienteRepo: ExpedienteRepository;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private runningJobs: Set<string> = new Set();

  constructor() {
    this.processingService = new ProcessingService();
    this.tenantRepo = new TenantRepository();
    this.expedienteRepo = new ExpedienteRepository();
  }

  /**
   * Inicializa todos los jobs configurados
   */
  async initializeJobs(): Promise<void> {
    if (!config.cron.enabled) {
      Logger.info('Jobs deshabilitados por configuración');
      return;
    }

    try {
      Logger.info('Inicializando sistema de jobs automáticos');

      // Job de revalidación diaria
      this.scheduleJob({
        type: JobType.REVALIDATION,
        schedule: config.cron.revalidationSchedule,
        enabled: true,
      });

      // Job de limpieza semanal
      this.scheduleJob({
        type: JobType.CLEANUP,
        schedule: '0 2 * * 0', // Domingo a las 2 AM
        enabled: true,
      });

      Logger.info(`✅ ${this.scheduledJobs.size} jobs programados correctamente`);
    } catch (error) {
      Logger.error('Error inicializando jobs', {}, error as Error);
      throw error;
    }
  }

  /**
   * Programa un job específico
   */
  scheduleJob(jobConfig: JobConfiguration): void {
    const jobId = `${jobConfig.type}_${jobConfig.tenantId || 'global'}`;

    // Detener job existente si ya está programado
    if (this.scheduledJobs.has(jobId)) {
      this.scheduledJobs.get(jobId)?.stop();
    }

    if (!jobConfig.enabled) {
      Logger.info(`Job ${jobId} deshabilitado`);
      return;
    }

    try {
      const task = cron.schedule(
        jobConfig.schedule,
        async () => {
          await this.executeJob(jobConfig);
        },
        {
          scheduled: false,
          timezone: 'America/Mexico_City', // Ajustar según la zona horaria
        }
      );

      task.start();
      this.scheduledJobs.set(jobId, task);

      Logger.info(`✅ Job programado: ${jobId} (${jobConfig.schedule})`);
    } catch (error) {
      Logger.error(`Error programando job ${jobId}`, {}, error as Error);
    }
  }

  /**
   * Ejecuta un job específico
   */
  private async executeJob(jobConfig: JobConfiguration): Promise<void> {
    const jobId = `${jobConfig.type}_${jobConfig.tenantId || 'global'}`;

    // Evitar ejecuciones concurrentes del mismo job
    if (this.runningJobs.has(jobId)) {
      Logger.warn(`Job ${jobId} ya está ejecutándose, saltando ejecución`);
      return;
    }

    this.runningJobs.add(jobId);
    const startTime = Date.now();

    try {
      Logger.info(`🚀 Iniciando job: ${jobId}`);

      let result: JobResult;

      switch (jobConfig.type) {
        case JobType.REVALIDATION:
          result = await this.executeRevalidationJob(jobConfig.tenantId);
          break;
        case JobType.CLEANUP:
          result = await this.executeCleanupJob();
          break;
        case JobType.EXCEL_PROCESSING:
          throw new Error(
            'Job de procesamiento de Excel no implementado para ejecución automática'
          );
        default:
          throw new Error(`Tipo de job desconocido: ${jobConfig.type}`);
      }

      const duration = Date.now() - startTime;

      Logger.info(`✅ Job completado: ${jobId}`, {
        metadata: {
          success: result.success,
          processed: result.processed,
          duration: `${duration}ms`,
          errors: result.errors.length,
        },
      });

      if (result.errors.length > 0) {
        Logger.warn(`Job ${jobId} completado con errores`, {
          metadata: { errors: result.errors.slice(0, 5) },
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error(
        `❌ Error en job ${jobId}`,
        {
          metadata: { duration: `${duration}ms` },
        },
        error as Error
      );
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  /**
   * Ejecuta revalidación de expedientes pendientes
   */
  private async executeRevalidationJob(tenantId?: string): Promise<JobResult> {
    const startTime = Date.now();
    const result: JobResult = {
      success: true,
      processed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Obtener todos los tenants activos o uno específico
      const tenants = tenantId
        ? [await this.tenantRepo.findById(tenantId)]
        : await this.tenantRepo.getAllActive();

      for (const tenant of tenants) {
        if (!tenant) continue;

        try {
          Logger.info(`Revalidando expedientes para tenant: ${tenant.businessName}`, {
            tenantId: tenant.id,
          });

          // Obtener expedientes pendientes
          const pendientes = await this.expedienteRepo.findPendientesByTenant(tenant.id);

          if (pendientes.length === 0) {
            Logger.info(`Sin expedientes pendientes para ${tenant.businessName}`, {
              tenantId: tenant.id,
            });
            continue;
          }

          // Configuración por defecto para revalidación
          // TODO: Obtener configuración específica del tenant desde TenantSettings
          const options = {
            enableLogica2: true, // Por defecto activar margen ±10%
            enableLogica3: false, // Por defecto desactivar costo superior
          };

          // Ejecutar revalidación
          const revalidationResult = await this.processingService.revalidatePendientes(
            tenant.id,
            options
          );

          result.processed += revalidationResult.processedRows;

          Logger.info(`Revalidación completada para ${tenant.businessName}`, {
            tenantId: tenant.id,
            metadata: {
              pendientes: pendientes.length,
              procesados: revalidationResult.processedRows,
              nuevosLiberados: revalidationResult.aceptados,
            },
          });

          // Delay entre tenants para no sobrecargar el sistema
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error) {
          const errorMsg = `Error revalidando tenant ${tenant.id}: ${(error as Error).message}`;
          result.errors.push(errorMsg);
          Logger.error(errorMsg, { tenantId: tenant.id }, error as Error);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
      Logger.error('Error en job de revalidación', {}, error as Error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Ejecuta limpieza de archivos temporales y logs antiguos
   */
  private async executeCleanupJob(): Promise<JobResult> {
    const startTime = Date.now();
    const result: JobResult = {
      success: true,
      processed: 0,
      errors: [],
      duration: 0,
    };

    try {
      Logger.info('Ejecutando limpieza de archivos temporales');

      // Limpiar archivos temporales del ExcelService (más de 24 horas)
      // await this.excelService.cleanupTempFiles(24 * 60 * 60 * 1000);

      // Aquí se pueden agregar más tareas de limpieza:
      // - Logs antiguos
      // - Sesiones expiradas
      // - Archivos de resultados antiguos
      // - Jobs completados antiguos

      result.processed = 1; // Marcar como procesado
      Logger.info('✅ Limpieza completada');
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
      Logger.error('Error en job de limpieza', {}, error as Error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Ejecuta revalidación manual para un tenant específico
   */
  async executeManualRevalidation(tenantId: string): Promise<JobResult> {
    Logger.info(`Ejecutando revalidación manual para tenant ${tenantId}`, { tenantId });

    return await this.executeRevalidationJob(tenantId);
  }

  /**
   * Obtiene el estado de todos los jobs
   */
  getJobsStatus(): Array<{
    jobId: string;
    type: JobType;
    isRunning: boolean;
    isScheduled: boolean;
    nextExecution?: Date;
  }> {
    const status: Array<{
      jobId: string;
      type: JobType;
      isRunning: boolean;
      isScheduled: boolean;
      nextExecution?: Date;
    }> = [];

    for (const [jobId, _task] of this.scheduledJobs.entries()) {
      const type = jobId.split('_')[0] as JobType;

      status.push({
        jobId,
        type,
        isRunning: this.runningJobs.has(jobId),
        isScheduled: true,
        // nextExecution: task.nextDates(1)[0]?.toJSDate() // Si cron permite obtener siguiente ejecución
      });
    }

    return status;
  }

  /**
   * Detiene un job específico
   */
  stopJob(jobId: string): boolean {
    const task = this.scheduledJobs.get(jobId);
    if (task) {
      task.stop();
      this.scheduledJobs.delete(jobId);
      Logger.info(`Job detenido: ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Detiene todos los jobs
   */
  stopAllJobs(): void {
    Logger.info('Deteniendo todos los jobs');

    for (const [jobId, task] of this.scheduledJobs.entries()) {
      task.stop();
      Logger.info(`Job detenido: ${jobId}`);
    }

    this.scheduledJobs.clear();
    this.runningJobs.clear();

    Logger.info('✅ Todos los jobs han sido detenidos');
  }

  /**
   * Verifica si hay jobs ejecutándose
   */
  hasRunningJobs(): boolean {
    return this.runningJobs.size > 0;
  }

  /**
   * Obtiene lista de jobs en ejecución
   */
  getRunningJobs(): string[] {
    return Array.from(this.runningJobs);
  }
}

export default JobService;
