import { Request, Response } from 'express';
import { CronJobScheduleService } from '../../infrastructure/services/cronjob-schedule.service';
import { RevalidacionCronJobUseCase } from '../../application/use-cases/revalidacion-cronjob.use-case';

export class CronJobController {
  constructor(
    private readonly cronJobService: CronJobScheduleService,
    private readonly revalidacionUseCase: RevalidacionCronJobUseCase
  ) {}

  async crearSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId, cronExpression, descripcion, activo } = req.body;

      if (!cronExpression || !descripcion) {
        res.status(400).json({
          error: 'Se requieren cronExpression y descripcion',
        });
        return;
      }

      const scheduleId = await this.cronJobService.createSchedule({
        tenantId,
        cronExpression,
        descripcion,
        activo,
      });

      res.status(201).json({
        success: true,
        data: {
          id: scheduleId,
          message: 'CronJob schedule creado exitosamente',
        },
      });
    } catch (error) {
      console.error('Error creando schedule:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async obtenerSchedules(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.query;

      const schedules = await this.cronJobService.getSchedules(tenantId as string);

      const schedulesWithDetails = await Promise.all(
        schedules.map(async (schedule) => {
          try {
            const nextExecutions = await this.cronJobService.getNextExecutionTimes(
              schedule.cronExpression,
              3
            );

            return {
              ...schedule,
              task: undefined, // No enviar la referencia de la tarea
              nextExecutions,
              isRunning: !!schedule.task,
            };
          } catch (error) {
            return {
              ...schedule,
              task: undefined,
              nextExecutions: [],
              isRunning: false,
              error: 'Error calculando próximas ejecuciones',
            };
          }
        })
      );

      res.status(200).json({
        success: true,
        data: schedulesWithDetails,
      });
    } catch (error) {
      console.error('Error obteniendo schedules:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async actualizarSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { cronExpression, descripcion, activo } = req.body;

      await this.cronJobService.updateSchedule(id, {
        cronExpression,
        descripcion,
        activo,
      });

      res.status(200).json({
        success: true,
        data: {
          message: 'CronJob schedule actualizado exitosamente',
        },
      });
    } catch (error) {
      console.error('Error actualizando schedule:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async eliminarSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await this.cronJobService.deleteSchedule(id);

      res.status(200).json({
        success: true,
        data: {
          message: 'CronJob schedule eliminado exitosamente',
        },
      });
    } catch (error) {
      console.error('Error eliminando schedule:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async toggleSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const newStatus = await this.cronJobService.toggleSchedule(id);

      res.status(200).json({
        success: true,
        data: {
          activo: newStatus,
          message: `CronJob ${newStatus ? 'activado' : 'desactivado'} exitosamente`,
        },
      });
    } catch (error) {
      console.error('Error toggling schedule:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async ejecutarScheduleAhora(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await this.cronJobService.executeScheduleNow(id);

      res.status(200).json({
        success: true,
        data: {
          message: 'CronJob ejecutado exitosamente',
        },
      });
    } catch (error) {
      console.error('Error ejecutando schedule:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async ejecutarRevalidacionManual(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId, maxBatchSize, notifyOnChanges } = req.body;

      const resultado = await this.revalidacionUseCase.execute({
        tenantId,
        maxBatchSize: maxBatchSize || 1000,
        notifyOnChanges: notifyOnChanges || false,
      });

      res.status(200).json({
        success: true,
        data: resultado,
      });
    } catch (error) {
      console.error('Error ejecutando revalidación manual:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async obtenerHistorialEjecuciones(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId, limit = 10 } = req.query;

      const executions = await this.revalidacionUseCase.getRevalidacionHistory(
        tenantId as string,
        Number(limit)
      );

      res.status(200).json({
        success: true,
        data: executions.map((execution) => ({
          id: execution.id,
          tenantId: execution.tenantId,
          totalProcesados: execution.totalProcesados,
          cambiosAprobado: execution.cambiosAprobado,
          permanecenNoAprobado: execution.permanecenNoAprobado,
          permanecenNoEncontrado: execution.permanecenNoEncontrado,
          cambiosCosto: execution.cambiosCosto,
          duracionMs: execution.duracionMs,
          fechaInicio: execution.fechaInicio,
          fechaFin: execution.fechaFin,
          duracionFormateada: execution.getDuracionFormateada(),
          resumen: execution.getResumenTexto(),
          hayCambios: execution.hayCambios(),
          debeNotificar: execution.debeNotificar(),
          tasaProcesamientoPorSegundo: execution.getTasaProcesamientoPorSegundo(),
        })),
      });
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async validarCronExpression(req: Request, res: Response): Promise<void> {
    try {
      const { cronExpression } = req.body;

      if (!cronExpression) {
        res.status(400).json({
          error: 'Se requiere cronExpression',
        });
        return;
      }

      const nextExecutions = await this.cronJobService.getNextExecutionTimes(cronExpression, 5);

      res.status(200).json({
        success: true,
        data: {
          valid: true,
          cronExpression,
          nextExecutions,
          description: this.describeCronExpression(cronExpression),
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Expresión cron inválida',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async crearSchedulesPorDefecto(req: Request, res: Response): Promise<void> {
    try {
      await this.cronJobService.createDefaultSchedules();

      res.status(200).json({
        success: true,
        data: {
          message: 'CronJob schedules por defecto creados exitosamente',
        },
      });
    } catch (error) {
      console.error('Error creando schedules por defecto:', error);
      res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private describeCronExpression(cronExpression: string): string {
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      return 'Expresión cron no estándar';
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const descriptions: string[] = [];

    // Minutos
    if (minute === '0') {
      descriptions.push('al inicio de la hora');
    } else if (minute.includes('/')) {
      descriptions.push(`cada ${minute.split('/')[1]} minutos`);
    } else if (minute !== '*') {
      descriptions.push(`en el minuto ${minute}`);
    }

    // Horas
    if (hour.includes('/')) {
      descriptions.push(`cada ${hour.split('/')[1]} horas`);
    } else if (hour.includes(',')) {
      descriptions.push(`a las ${hour.replace(/,/g, ', ')} horas`);
    } else if (hour !== '*') {
      descriptions.push(`a las ${hour}:00`);
    }

    // Día del mes
    if (dayOfMonth !== '*') {
      descriptions.push(`el día ${dayOfMonth} del mes`);
    }

    // Mes
    if (month !== '*') {
      descriptions.push(`en el mes ${month}`);
    }

    // Día de la semana
    if (dayOfWeek !== '*') {
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const dayNames = dayOfWeek.split(',').map((d) => days[parseInt(d)] || d);
      descriptions.push(`los ${dayNames.join(', ')}`);
    }

    return descriptions.join(' ') || 'Cada minuto';
  }
}
