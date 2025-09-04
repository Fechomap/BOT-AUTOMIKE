import { ExpedienteAggregate } from '../../domain/entities/expediente-aggregate.entity';
import { CronJobExecution } from '../../domain/entities/cronjob-execution.entity';
import {
  CalificacionExpediente,
  ProcesadoPor,
} from '../../domain/enums/calificacion-expediente.enum';
import {
  ExpedienteValidationService,
  LogicasValidacion,
} from '../../domain/services/expediente-validation.service';
import { SistemaExpedientesService } from '../../domain/interfaces/sistema-expedientes.interface';
import { ExpedienteRepository } from '../../infrastructure/repositories/expediente.repository';

export interface RevalidacionCronJobDTO {
  tenantId?: string;
  maxBatchSize?: number;
  logicasActivas?: LogicasValidacion;
  notifyOnChanges?: boolean;
}

export interface ResultadoRevalidacionDTO {
  executionId: string;
  totalProcesados: number;
  cambiosAprobado: number;
  permanecenNoAprobado: number;
  permanecenNoEncontrado: number;
  cambiosCosto: number;
  duracionMs: number;
  duracionFormateada: string;
  hayaCambios: boolean;
  debeNotificar: boolean;
  resumenTexto: string;
  expedientesCambiados: ExpedienteResumen[];
}

export interface ExpedienteResumen {
  numero: string;
  calificacionAnterior: CalificacionExpediente;
  calificacionNueva: CalificacionExpediente;
  costoAnterior: number;
  costoNuevo: number;
  motivoCambio: string;
}

export interface NotificationService {
  notificarCambiosCronJob(tenantId: string, resultado: ResultadoRevalidacionDTO): Promise<void>;
}

export class RevalidacionCronJobUseCase {
  constructor(
    private readonly expedienteRepository: ExpedienteRepository,
    private readonly sistemaService: SistemaExpedientesService,
    private readonly notificationService?: NotificationService
  ) {}

  async execute(dto: RevalidacionCronJobDTO = {}): Promise<ResultadoRevalidacionDTO> {
    const maxBatchSize = dto.maxBatchSize || 1000;
    const logicasActivas =
      dto.logicasActivas || ExpedienteValidationService.obtenerLogicasActivasPorDefecto();

    console.log(
      `🤖 Iniciando revalidación CronJob - Tenant: ${dto.tenantId || 'GLOBAL'}, Batch: ${maxBatchSize}`
    );

    const inicioEjecucion = CronJobExecution.iniciar();

    // Solo reevaluar expedientes NO_ENCONTRADO (para verificar si ahora están disponibles)
    const calificacionesParaReevaluar = [CalificacionExpediente.NO_ENCONTRADO];

    let expedientesParaProcesar: ExpedienteAggregate[];

    if (dto.tenantId) {
      expedientesParaProcesar = await this.expedienteRepository.findByTenantAndCalificaciones(
        dto.tenantId,
        calificacionesParaReevaluar
      );
    } else {
      expedientesParaProcesar = [];
      console.log('⚠️ Procesamiento global no implementado en esta versión');
    }

    if (expedientesParaProcesar.length > maxBatchSize) {
      expedientesParaProcesar = expedientesParaProcesar.slice(0, maxBatchSize);
      console.log(`📊 Limitando procesamiento a ${maxBatchSize} expedientes`);
    }

    console.log(`📈 Expedientes a procesar: ${expedientesParaProcesar.length}`);

    const resultados = {
      totalProcesados: expedientesParaProcesar.length,
      cambiosAprobado: 0,
      permanecenNoAprobado: 0,
      permanecenNoEncontrado: 0,
      cambiosCosto: 0,
      expedientesCambiados: [] as ExpedienteResumen[],
    };

    const expedientesModificados: ExpedienteAggregate[] = [];

    for (const expediente of expedientesParaProcesar) {
      try {
        const resultado = await this.reevaluarExpediente(expediente, logicasActivas);

        if (resultado.haCambiado) {
          expedientesModificados.push(resultado.expediente);

          const resumen: ExpedienteResumen = {
            numero: expediente.numero,
            calificacionAnterior: resultado.calificacionAnterior,
            calificacionNueva: resultado.expediente.calificacion,
            costoAnterior: resultado.costoAnterior,
            costoNuevo: resultado.expediente.costo,
            motivoCambio: resultado.motivoCambio,
          };

          resultados.expedientesCambiados.push(resumen);

          if (resultado.expediente.calificacion === CalificacionExpediente.APROBADO) {
            resultados.cambiosAprobado++;

            await this.intentarLiberacion(expediente.numero, expediente.costo);
          }

          if (resultado.costoAnterior !== resultado.expediente.costo) {
            resultados.cambiosCosto++;
          }
        }

        // Solo procesamos NO_ENCONTRADO, así que solo contamos los que permanecen así
        if (expediente.calificacion === CalificacionExpediente.NO_ENCONTRADO) {
          resultados.permanecenNoEncontrado++;
        }
      } catch (error) {
        console.error(`❌ Error reevaluando expediente ${expediente.numero}:`, error);
      }
    }

    if (expedientesModificados.length > 0) {
      console.log(`💾 Guardando ${expedientesModificados.length} expedientes modificados...`);
      await this.expedienteRepository.saveAll(expedientesModificados);
    }

    const ejecucion = CronJobExecution.finalizar(inicioEjecucion, resultados, dto.tenantId);

    await this.expedienteRepository.saveCronJobExecution(ejecucion);

    const resultadoFinal: ResultadoRevalidacionDTO = {
      executionId: ejecucion.id,
      totalProcesados: ejecucion.totalProcesados,
      cambiosAprobado: ejecucion.cambiosAprobado,
      permanecenNoAprobado: ejecucion.permanecenNoAprobado,
      permanecenNoEncontrado: ejecucion.permanecenNoEncontrado,
      cambiosCosto: ejecucion.cambiosCosto,
      duracionMs: ejecucion.duracionMs,
      duracionFormateada: ejecucion.getDuracionFormateada(),
      hayaCambios: ejecucion.hayCambios(),
      debeNotificar: ejecucion.debeNotificar(),
      resumenTexto: ejecucion.getResumenTexto(),
      expedientesCambiados: resultados.expedientesCambiados,
    };

    console.log(`✅ CronJob completado: ${ejecucion.getResumenTexto()}`);

    if (
      dto.notifyOnChanges &&
      resultadoFinal.debeNotificar &&
      dto.tenantId &&
      this.notificationService
    ) {
      try {
        await this.notificationService.notificarCambiosCronJob(dto.tenantId, resultadoFinal);
      } catch (error) {
        console.error('❌ Error enviando notificación:', error);
      }
    }

    return resultadoFinal;
  }

  private async reevaluarExpediente(
    expediente: ExpedienteAggregate,
    logicasActivas: LogicasValidacion
  ): Promise<{
    expediente: ExpedienteAggregate;
    haCambiado: boolean;
    calificacionAnterior: CalificacionExpediente;
    costoAnterior: number;
    motivoCambio: string;
  }> {
    if (!expediente.puedeSerReevaluado()) {
      throw new Error(
        `Expediente ${expediente.numero} no puede ser reevaluado (estado: ${expediente.calificacion})`
      );
    }

    const calificacionAnterior = expediente.calificacion;
    const costoAnterior = expediente.costo;

    console.log(
      `🔄 Reevaluando expediente: ${expediente.numero} (estado actual: ${calificacionAnterior})`
    );

    try {
      const datosSistema = await this.sistemaService.buscarExpediente(
        expediente.numero,
        expediente.costo
      );
      const validacion = ExpedienteValidationService.validar(
        expediente.numero,
        expediente.costo,
        datosSistema,
        logicasActivas
      );

      if (datosSistema.costoSistema !== expediente.costo) {
        expediente.actualizarCosto(
          datosSistema.costoSistema,
          validacion.calificacion,
          `CronJob: Costo actualizado desde sistema. ${validacion.motivo}`,
          undefined,
          ProcesadoPor.CRONJOB
        );

        console.log(
          `💰 Expediente ${expediente.numero}: costo actualizado ${costoAnterior} → ${datosSistema.costoSistema}`
        );
      } else {
        const cambioCalificacion = expediente.reevaluar(
          validacion.calificacion,
          `CronJob: ${validacion.motivo}`,
          ProcesadoPor.CRONJOB
        );

        if (cambioCalificacion) {
          console.log(
            `📊 Expediente ${expediente.numero}: calificación cambiada ${calificacionAnterior} → ${validacion.calificacion}`
          );
        }
      }

      const haCambiado =
        calificacionAnterior !== expediente.calificacion || costoAnterior !== expediente.costo;

      return {
        expediente,
        haCambiado,
        calificacionAnterior,
        costoAnterior,
        motivoCambio: validacion.motivo,
      };
    } catch (error) {
      console.error(`❌ Error consultando sistema para expediente ${expediente.numero}:`, error);

      return {
        expediente,
        haCambiado: false,
        calificacionAnterior,
        costoAnterior,
        motivoCambio: `Error en consulta: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async intentarLiberacion(numero: string, costo: number): Promise<void> {
    try {
      console.log(`💰 CronJob: Intentando liberar expediente ${numero}...`);

      const liberado = await this.sistemaService.liberarExpediente(numero, costo);

      if (liberado) {
        console.log(`✅ CronJob: Expediente ${numero} liberado exitosamente`);
      } else {
        console.log(`⚠️ CronJob: Expediente ${numero} no pudo ser liberado automáticamente`);
      }
    } catch (error) {
      console.error(`❌ CronJob: Error liberando expediente ${numero}:`, error);
    }
  }

  async getRevalidacionHistory(tenantId?: string, limit: number = 10): Promise<CronJobExecution[]> {
    return this.expedienteRepository.findCronJobExecutions(tenantId, limit);
  }

  async getExpedientesPendientes(tenantId: string): Promise<{
    pendientes: number;
    noAprobados: number;
    noEncontrados: number;
    total: number;
  }> {
    const pendientes = await this.expedienteRepository.countByTenantAndCalificacion(
      tenantId,
      CalificacionExpediente.PENDIENTE
    );

    const noAprobados = await this.expedienteRepository.countByTenantAndCalificacion(
      tenantId,
      CalificacionExpediente.NO_APROBADO
    );

    const noEncontrados = await this.expedienteRepository.countByTenantAndCalificacion(
      tenantId,
      CalificacionExpediente.NO_ENCONTRADO
    );

    return {
      pendientes,
      noAprobados,
      noEncontrados,
      total: pendientes + noAprobados + noEncontrados,
    };
  }
}
