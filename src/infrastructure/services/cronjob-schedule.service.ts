import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { RevalidacionCronJobUseCase } from '../../application/use-cases/revalidacion-cronjob.use-case';
import { ExpedienteValidationService } from '../../domain/services/expediente-validation.service';

export interface CronJobScheduleData {
  tenantId?: string;
  cronExpression: string;
  descripcion: string;
  activo?: boolean;
}

export interface CronJobConfig {
  id: string;
  tenantId?: string;
  cronExpression: string;
  descripcion: string;
  activo: boolean;
  task?: cron.ScheduledTask;
}

export class CronJobScheduleService {
  private activeTasks: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly revalidacionUseCase: RevalidacionCronJobUseCase
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🕐 CronJobScheduleService ya está inicializado');
      return;
    }

    console.log('🚀 Inicializando CronJobScheduleService...');

    try {
      await this.loadAndStartSchedules();
      this.isInitialized = true;
      console.log('✅ CronJobScheduleService inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando CronJobScheduleService:', error);
      throw error;
    }
  }

  async createSchedule(data: CronJobScheduleData): Promise<string> {
    if (!this.isValidCronExpression(data.cronExpression)) {
      throw new Error(`Expresión cron inválida: ${data.cronExpression}`);
    }

    const schedule = await this.prisma.cronJobSchedule.create({
      data: {
        tenantId: data.tenantId,
        cronExpression: data.cronExpression,
        descripcion: data.descripcion,
        activo: data.activo ?? true,
      },
    });

    if (schedule.activo) {
      await this.startSchedule(schedule.id);
    }

    console.log(`📅 CronJob creado: ${schedule.id} - ${data.descripcion}`);
    return schedule.id;
  }

  async updateSchedule(id: string, data: Partial<CronJobScheduleData>): Promise<void> {
    if (data.cronExpression && !this.isValidCronExpression(data.cronExpression)) {
      throw new Error(`Expresión cron inválida: ${data.cronExpression}`);
    }

    const schedule = await this.prisma.cronJobSchedule.update({
      where: { id },
      data: {
        ...(data.cronExpression && { cronExpression: data.cronExpression }),
        ...(data.descripcion && { descripcion: data.descripcion }),
        ...(data.activo !== undefined && { activo: data.activo }),
      },
    });

    await this.stopSchedule(id);

    if (schedule.activo) {
      await this.startSchedule(id);
    }

    console.log(`🔄 CronJob actualizado: ${id}`);
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.stopSchedule(id);

    await this.prisma.cronJobSchedule.delete({
      where: { id },
    });

    console.log(`🗑️ CronJob eliminado: ${id}`);
  }

  async getSchedules(tenantId?: string): Promise<CronJobConfig[]> {
    const schedules = await this.prisma.cronJobSchedule.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
    });

    return schedules.map((s) => ({
      id: s.id,
      tenantId: s.tenantId || undefined,
      cronExpression: s.cronExpression,
      descripcion: s.descripcion,
      activo: s.activo,
      task: this.activeTasks.get(s.id),
    }));
  }

  async toggleSchedule(id: string): Promise<boolean> {
    const schedule = await this.prisma.cronJobSchedule.findUnique({
      where: { id },
    });

    if (!schedule) {
      throw new Error(`CronJob no encontrado: ${id}`);
    }

    const newStatus = !schedule.activo;

    await this.prisma.cronJobSchedule.update({
      where: { id },
      data: { activo: newStatus },
    });

    if (newStatus) {
      await this.startSchedule(id);
    } else {
      await this.stopSchedule(id);
    }

    console.log(`🔄 CronJob ${id} ${newStatus ? 'activado' : 'desactivado'}`);
    return newStatus;
  }

  async executeScheduleNow(id: string): Promise<void> {
    const schedule = await this.prisma.cronJobSchedule.findUnique({
      where: { id },
    });

    if (!schedule) {
      throw new Error(`CronJob no encontrado: ${id}`);
    }

    console.log(`🚀 Ejecutando CronJob manualmente: ${id} - ${schedule.descripcion}`);

    await this.executeCronJob(schedule.tenantId || undefined);
  }

  private async loadAndStartSchedules(): Promise<void> {
    const activeSchedules = await this.prisma.cronJobSchedule.findMany({
      where: { activo: true },
    });

    console.log(`📊 Cargando ${activeSchedules.length} CronJobs activos...`);

    for (const schedule of activeSchedules) {
      try {
        await this.startSchedule(schedule.id);
        console.log(`✅ CronJob iniciado: ${schedule.id} - ${schedule.descripcion}`);
      } catch (error) {
        console.error(`❌ Error iniciando CronJob ${schedule.id}:`, error);
      }
    }
  }

  private async startSchedule(id: string): Promise<void> {
    const schedule = await this.prisma.cronJobSchedule.findUnique({
      where: { id },
    });

    if (!schedule || !schedule.activo) {
      return;
    }

    if (this.activeTasks.has(id)) {
      this.activeTasks.get(id)?.stop();
    }

    const task = cron.schedule(
      schedule.cronExpression,
      async () => {
        try {
          console.log(`⏰ Ejecutando CronJob programado: ${id} - ${schedule.descripcion}`);
          await this.executeCronJob(schedule.tenantId || undefined);
        } catch (error) {
          console.error(`❌ Error en CronJob ${id}:`, error);
        }
      },
      {
        scheduled: false,
        timezone: 'Europe/Madrid',
      }
    );

    task.start();
    this.activeTasks.set(id, task);
  }

  private async stopSchedule(id: string): Promise<void> {
    const task = this.activeTasks.get(id);
    if (task) {
      task.stop();
      this.activeTasks.delete(id);
    }
  }

  private async executeCronJob(tenantId?: string): Promise<void> {
    try {
      const resultado = await this.revalidacionUseCase.execute({
        tenantId,
        maxBatchSize: 1000,
        logicasActivas: ExpedienteValidationService.obtenerLogicasActivasPorDefecto(),
        notifyOnChanges: true,
      });

      console.log(`✅ CronJob completado: ${resultado.resumenTexto}`);

      if (resultado.debeNotificar) {
        console.log(
          `📢 CronJob requiere notificación: ${resultado.cambiosAprobado} cambios importantes`
        );
      }
    } catch (error) {
      console.error(`❌ Error ejecutando CronJob para tenant ${tenantId}:`, error);
    }
  }

  private isValidCronExpression(expression: string): boolean {
    return cron.validate(expression);
  }

  async getNextExecutionTimes(cronExpression: string, count: number = 5): Promise<Date[]> {
    if (!this.isValidCronExpression(cronExpression)) {
      throw new Error(`Expresión cron inválida: ${cronExpression}`);
    }

    const times: Date[] = [];

    let current = new Date();
    for (let i = 0; i < count; i++) {
      const next = this.getNextExecution(cronExpression, current);
      if (next) {
        times.push(next);
        current = new Date(next.getTime() + 1000);
      }
    }

    return times;
  }

  private getNextExecution(cronExpression: string, from: Date): Date | null {
    try {
      cron.schedule(cronExpression, () => {}, { scheduled: false });
      // Simulación simple para testing - en producción usar librería de cron parsing
      return new Date(from.getTime() + 3600000); // +1 hora como ejemplo
    } catch {
      return null;
    }
  }

  async createDefaultSchedules(): Promise<void> {
    console.log('📅 Creando CronJobs por defecto...');

    const defaultSchedules = [
      {
        cronExpression: '0 */4 * * *', // Cada 4 horas
        descripcion: 'Revalidación automática cada 4 horas',
        activo: true,
      },
      {
        cronExpression: '0 8,14,20 * * *', // A las 8:00, 14:00 y 20:00
        descripcion: 'Revalidación en horarios pico',
        activo: false,
      },
      {
        cronExpression: '0 2 * * *', // A las 2:00 AM todos los días
        descripcion: 'Revalidación nocturna diaria',
        activo: false,
      },
    ];

    for (const schedule of defaultSchedules) {
      try {
        await this.createSchedule(schedule);
      } catch (error) {
        console.error(`❌ Error creando CronJob por defecto:`, error);
      }
    }
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Deteniendo todos los CronJobs...');

    for (const [id, task] of this.activeTasks) {
      task.stop();
      console.log(`⏹️ CronJob detenido: ${id}`);
    }

    this.activeTasks.clear();
    this.isInitialized = false;
    console.log('✅ Todos los CronJobs han sido detenidos');
  }
}
