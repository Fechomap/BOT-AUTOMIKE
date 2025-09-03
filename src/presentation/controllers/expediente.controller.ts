import { Request, Response } from 'express';
import { CargaExpedientesUseCase } from '../../application/use-cases/carga-expedientes.use-case';
import { RevalidacionCronJobUseCase } from '../../application/use-cases/revalidacion-cronjob.use-case';
import { ExpedienteRepository } from '../../infrastructure/repositories/expediente.repository';
import { CalificacionExpediente } from '../../domain/enums/calificacion-expediente.enum';
import { ExpedienteValidationService } from '../../domain/services/expediente-validation.service';

export class ExpedienteController {
  constructor(
    private readonly cargaUseCase: CargaExpedientesUseCase,
    private readonly revalidacionUseCase: RevalidacionCronJobUseCase,
    private readonly expedienteRepository: ExpedienteRepository
  ) {}

  async cargarExpedientes(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;
      const { expedientes, nombreArchivo, logicasActivas, procesadoPor } = req.body;

      if (!expedientes || !Array.isArray(expedientes) || expedientes.length === 0) {
        res.status(400).json({
          error: 'Se requiere un array de expedientes no vacío',
        });
        return;
      }

      if (!nombreArchivo) {
        res.status(400).json({
          error: 'Se requiere el nombre del archivo',
        });
        return;
      }

      const resultado = await this.cargaUseCase.execute({
        tenantId,
        expedientes,
        nombreArchivo,
        logicasActivas:
          logicasActivas || ExpedienteValidationService.obtenerLogicasActivasPorDefecto(),
        procesadoPor: procesadoPor || 'API',
      });

      res.status(200).json({
        success: true,
        data: resultado,
      });
    } catch (error) {
      console.error('Error en carga de expedientes:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async obtenerExpedientes(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;
      const { page = 1, limit = 50, calificacion, numero } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      if (numero) {
        const expediente = await this.expedienteRepository.findByTenantAndNumero(
          tenantId,
          numero as string
        );

        if (!expediente) {
          res.status(404).json({
            error: 'Expediente no encontrado',
          });
          return;
        }

        res.status(200).json({
          success: true,
          data: {
            expediente: this.mapExpedienteToDTO(expediente),
            versiones: expediente.versiones.map((v) => this.mapVersionToDTO(v)),
          },
        });
        return;
      }

      let expedientes;
      if (calificacion) {
        const calificaciones = Array.isArray(calificacion)
          ? (calificacion as CalificacionExpediente[])
          : [calificacion as CalificacionExpediente];

        expedientes = await this.expedienteRepository.findByTenantAndCalificaciones(
          tenantId,
          calificaciones
        );
      } else {
        expedientes = await this.expedienteRepository.findByTenant(tenantId, offset, Number(limit));
      }

      const total = await this.expedienteRepository.countByTenantAndCalificacion(tenantId);

      res.status(200).json({
        success: true,
        data: {
          expedientes: expedientes.map((exp) => this.mapExpedienteToDTO(exp)),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error('Error obteniendo expedientes:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async obtenerVersionesExpediente(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId, numero } = req.params;

      const expediente = await this.expedienteRepository.findByTenantAndNumero(tenantId, numero);

      if (!expediente) {
        res.status(404).json({
          error: 'Expediente no encontrado',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          expediente: this.mapExpedienteToDTO(expediente),
          versiones: expediente.versiones.map((v) => this.mapVersionToDTO(v)),
        },
      });
    } catch (error) {
      console.error('Error obteniendo versiones:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async obtenerResumenTenant(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;

      const [stats, cargas, cronJobs, pendientes] = await Promise.all([
        this.expedienteRepository.getExpedienteStats(tenantId),
        this.expedienteRepository.findCargasByTenant(tenantId, 5),
        this.expedienteRepository.findCronJobExecutions(tenantId, 5),
        this.revalidacionUseCase.getExpedientesPendientes(tenantId),
      ]);

      res.status(200).json({
        success: true,
        data: {
          estadisticas: stats,
          ultimasCargas: cargas.map((c) => ({
            id: c.id,
            nombreArchivo: c.nombreArchivo,
            totalExpedientes: c.totalExpedientes,
            aprobados: c.aprobados,
            noAprobados: c.noAprobados,
            noEncontrados: c.noEncontrados,
            esBaseline: c.esBaseline,
            fechaProcesamiento: c.fechaProcesamiento,
            tasaAprobacion: c.getPorcentajeAprobacion(),
            resumen: c.getResumenTexto(),
          })),
          ultimosCronJobs: cronJobs.map((cj) => ({
            id: cj.id,
            totalProcesados: cj.totalProcesados,
            cambiosAprobado: cj.cambiosAprobado,
            duracionMs: cj.duracionMs,
            fechaInicio: cj.fechaInicio,
            fechaFin: cj.fechaFin,
            duracionFormateada: cj.getDuracionFormateada(),
            resumen: cj.getResumenTexto(),
          })),
          expedientesPendientes: pendientes,
        },
      });
    } catch (error) {
      console.error('Error obteniendo resumen:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async ejecutarRevalidacion(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;
      const { maxBatchSize, notifyOnChanges } = req.body;

      const resultado = await this.revalidacionUseCase.execute({
        tenantId,
        maxBatchSize: maxBatchSize || 1000,
        logicasActivas: ExpedienteValidationService.obtenerLogicasActivasPorDefecto(),
        notifyOnChanges: notifyOnChanges || false,
      });

      res.status(200).json({
        success: true,
        data: resultado,
      });
    } catch (error) {
      console.error('Error ejecutando revalidación:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private mapExpedienteToDTO(expediente: any) {
    return {
      id: expediente.id,
      tenantId: expediente.tenantId,
      numero: expediente.numero,
      costo: expediente.costo,
      calificacion: expediente.calificacion,
      motivoCalificacion: expediente.motivoCalificacion,
      fechaPrimeraVersion: expediente.fechaPrimeraVersion,
      fechaUltimaActualizacion: expediente.fechaUltimaActualizacion,
      totalVersiones: expediente.versiones.length,
      tieneCambioDeCosto: expediente.tieneCambioDeCosto(),
    };
  }

  private mapVersionToDTO(version: any) {
    return {
      id: version.id,
      costoAnterior: version.costoAnterior,
      costoNuevo: version.costoNuevo,
      calificacionAnterior: version.calificacionAnterior,
      calificacionNueva: version.calificacionNueva,
      motivoCambio: version.motivoCambio,
      tipoOperacion: version.tipoOperacion,
      procesadoPor: version.procesadoPor,
      createdAt: version.createdAt,
      esCreacion: version.isCreacion(),
      esCambioCosto: version.isCambioCosto(),
      esReevaluacion: version.isReevaluacionCronJob(),
    };
  }
}
