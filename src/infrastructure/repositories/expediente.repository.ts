import { PrismaClient } from '@prisma/client';
import {
  ExpedienteAggregate,
  ExpedienteVersion,
} from '../../domain/entities/expediente-aggregate.entity';
import { CargaExpedientes } from '../../domain/entities/carga-expedientes.entity';
import { CronJobExecution } from '../../domain/entities/cronjob-execution.entity';
import { CalificacionExpediente } from '../../domain/enums/calificacion-expediente.enum';
import { NumeroExpediente } from '../../domain/value-objects/numero-expediente.vo';

export interface ExpedienteRepository {
  findByTenantAndNumero(tenantId: string, numero: string): Promise<ExpedienteAggregate | null>;
  findByTenantAndCalificaciones(
    tenantId: string,
    calificaciones: CalificacionExpediente[]
  ): Promise<ExpedienteAggregate[]>;
  findByTenant(tenantId: string, offset?: number, limit?: number): Promise<ExpedienteAggregate[]>;
  countByTenantAndCalificacion(
    tenantId: string,
    calificacion?: CalificacionExpediente
  ): Promise<number>;
  save(expediente: ExpedienteAggregate): Promise<void>;
  saveAll(expedientes: ExpedienteAggregate[]): Promise<void>;

  // Cargas
  saveCarga(carga: CargaExpedientes): Promise<void>;
  findCargasByTenant(tenantId: string, limit?: number): Promise<CargaExpedientes[]>;
  isFirstCargaForTenant(tenantId: string): Promise<boolean>;

  // CronJob executions
  saveCronJobExecution(execution: CronJobExecution): Promise<void>;
  findCronJobExecutions(tenantId?: string, limit?: number): Promise<CronJobExecution[]>;

  // Estadísticas
  getExpedienteStats(tenantId: string): Promise<{
    total: number;
    aprobados: number;
    pendientes: number;
    noAprobados: number;
    noEncontrados: number;
    tasaAprobacion: number;
  }>;
}

export class PrismaExpedienteRepository implements ExpedienteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenantAndNumero(
    tenantId: string,
    numero: string
  ): Promise<ExpedienteAggregate | null> {
    const numeroNormalizado = NumeroExpediente.create(numero);

    const expediente = await this.prisma.expediente.findUnique({
      where: {
        tenantId_numero: {
          tenantId,
          numero: numeroNormalizado.valor,
        },
      },
      include: {
        versiones: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!expediente) {
      return null;
    }

    return this.mapToAggregate(expediente);
  }

  async findByTenantAndCalificaciones(
    tenantId: string,
    calificaciones: CalificacionExpediente[]
  ): Promise<ExpedienteAggregate[]> {
    const expedientes = await this.prisma.expediente.findMany({
      where: {
        tenantId,
        calificacion: {
          in: calificaciones,
        },
      },
      include: {
        versiones: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { fechaUltimaActualizacion: 'desc' },
    });

    return expedientes.map((exp) => this.mapToAggregate(exp));
  }

  async findByTenant(
    tenantId: string,
    offset: number = 0,
    limit: number = 100
  ): Promise<ExpedienteAggregate[]> {
    const expedientes = await this.prisma.expediente.findMany({
      where: { tenantId },
      include: {
        versiones: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { fechaUltimaActualizacion: 'desc' },
      skip: offset,
      take: limit,
    });

    return expedientes.map((exp) => this.mapToAggregate(exp));
  }

  async countByTenantAndCalificacion(
    tenantId: string,
    calificacion?: CalificacionExpediente
  ): Promise<number> {
    return this.prisma.expediente.count({
      where: {
        tenantId,
        ...(calificacion && { calificacion }),
      },
    });
  }

  async save(expediente: ExpedienteAggregate): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existingExpediente = await tx.expediente.findUnique({
        where: {
          tenantId_numero: {
            tenantId: expediente.tenantId,
            numero: expediente.numero,
          },
        },
      });

      const versionActual = expediente.versionActual;

      if (existingExpediente) {
        await tx.expediente.update({
          where: { id: existingExpediente.id },
          data: {
            costo: expediente.costo,
            calificacion: expediente.calificacion as any,
            motivoCalificacion: expediente.motivoCalificacion,
            versionActualId: versionActual?.id,
            fechaUltimaActualizacion: expediente.fechaUltimaActualizacion,
          },
        });

        const existingVersionIds = await tx.expedienteVersion.findMany({
          where: { expedienteId: existingExpediente.id },
          select: { id: true },
        });

        const existingIds = new Set(existingVersionIds.map((v) => v.id));
        const nuevasVersiones = expediente.versiones.filter((v) => !existingIds.has(v.id));

        for (const version of nuevasVersiones) {
          await this.saveVersion(tx, existingExpediente.id, version);
        }
      } else {
        const nuevoExpediente = await tx.expediente.create({
          data: {
            id: expediente.id,
            tenantId: expediente.tenantId,
            numero: expediente.numero,
            costo: expediente.costo,
            calificacion: expediente.calificacion as any,
            motivoCalificacion: expediente.motivoCalificacion,
            versionActualId: versionActual?.id,
            fechaPrimeraVersion: expediente.fechaPrimeraVersion,
            fechaUltimaActualizacion: expediente.fechaUltimaActualizacion,
          },
        });

        for (const version of expediente.versiones) {
          await this.saveVersion(tx, nuevoExpediente.id, version);
        }
      }
    });
  }

  async saveAll(expedientes: ExpedienteAggregate[]): Promise<void> {
    const batchSize = 10;
    for (let i = 0; i < expedientes.length; i += batchSize) {
      const batch = expedientes.slice(i, i + batchSize);
      await Promise.all(batch.map((exp) => this.save(exp)));
    }
  }

  private async saveVersion(
    tx: any,
    expedienteId: string,
    version: ExpedienteVersion
  ): Promise<void> {
    await tx.expedienteVersion.create({
      data: {
        id: version.id,
        expedienteId,
        cargaId: version.cargaId,
        costoAnterior: version.costoAnterior,
        costoNuevo: version.costoNuevo,
        calificacionAnterior: version.calificacionAnterior as any,
        calificacionNueva: version.calificacionNueva as any,
        motivoCambio: version.motivoCambio,
        tipoOperacion: version.tipoOperacion as any,
        procesadoPor: version.procesadoPor as any,
        createdAt: version.createdAt,
      },
    });
  }

  async saveCarga(carga: CargaExpedientes): Promise<void> {
    await this.prisma.cargaExpedientes.create({
      data: {
        id: carga.id,
        tenantId: carga.tenantId,
        nombreArchivo: carga.nombreArchivo,
        totalExpedientes: carga.totalExpedientes,
        nuevosExpedientes: carga.nuevosExpedientes,
        actualizados: carga.actualizados,
        duplicadosSinCambio: carga.duplicadosSinCambio,
        errores: carga.errores,
        aprobados: carga.aprobados,
        pendientes: carga.pendientes,
        noAprobados: carga.noAprobados,
        noEncontrados: carga.noEncontrados,
        esBaseline: carga.esBaseline,
        fechaProcesamiento: carga.fechaProcesamiento,
        procesadoPor: carga.procesadoPor,
      },
    });
  }

  async findCargasByTenant(tenantId: string, limit: number = 10): Promise<CargaExpedientes[]> {
    const cargas = await this.prisma.cargaExpedientes.findMany({
      where: { tenantId },
      orderBy: { fechaProcesamiento: 'desc' },
      take: limit,
    });

    return cargas.map(
      (c) =>
        new CargaExpedientes(
          c.id,
          c.tenantId,
          c.nombreArchivo,
          c.totalExpedientes,
          c.nuevosExpedientes,
          c.actualizados,
          c.duplicadosSinCambio,
          c.errores,
          c.aprobados,
          c.pendientes,
          c.noAprobados,
          c.noEncontrados,
          c.esBaseline,
          c.fechaProcesamiento,
          c.procesadoPor
        )
    );
  }

  async isFirstCargaForTenant(tenantId: string): Promise<boolean> {
    const count = await this.prisma.cargaExpedientes.count({
      where: { tenantId },
    });
    return count === 0;
  }

  async saveCronJobExecution(execution: CronJobExecution): Promise<void> {
    await this.prisma.cronJobExecution.create({
      data: {
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
      },
    });
  }

  async findCronJobExecutions(tenantId?: string, limit: number = 10): Promise<CronJobExecution[]> {
    const executions = await this.prisma.cronJobExecution.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { fechaInicio: 'desc' },
      take: limit,
    });

    return executions.map(
      (e) =>
        new CronJobExecution(
          e.id,
          e.tenantId,
          e.totalProcesados,
          e.cambiosAprobado,
          e.permanecenNoAprobado,
          e.permanecenNoEncontrado,
          e.cambiosCosto,
          e.duracionMs,
          e.fechaInicio,
          e.fechaFin
        )
    );
  }

  async getExpedienteStats(tenantId: string): Promise<{
    total: number;
    aprobados: number;
    pendientes: number;
    noAprobados: number;
    noEncontrados: number;
    tasaAprobacion: number;
  }> {
    const stats = await this.prisma.expediente.groupBy({
      by: ['calificacion'],
      where: { tenantId },
      _count: { _all: true },
    });

    const counts = {
      total: 0,
      aprobados: 0,
      pendientes: 0,
      noAprobados: 0,
      noEncontrados: 0,
    };

    stats.forEach((stat) => {
      const count = stat._count._all;
      counts.total += count;

      switch (stat.calificacion) {
        case CalificacionExpediente.APROBADO:
          counts.aprobados = count;
          break;
        case CalificacionExpediente.PENDIENTE:
          counts.pendientes = count;
          break;
        case CalificacionExpediente.NO_APROBADO:
          counts.noAprobados = count;
          break;
        case CalificacionExpediente.NO_ENCONTRADO:
          counts.noEncontrados = count;
          break;
      }
    });

    return {
      ...counts,
      tasaAprobacion: counts.total > 0 ? (counts.aprobados / counts.total) * 100 : 0,
    };
  }

  private mapToAggregate(data: any): ExpedienteAggregate {
    const versiones = data.versiones.map(
      (v: any) =>
        new ExpedienteVersion(
          v.id,
          v.expedienteId,
          v.cargaId,
          v.costoAnterior ? parseFloat(v.costoAnterior.toString()) : null,
          parseFloat(v.costoNuevo.toString()),
          v.calificacionAnterior,
          v.calificacionNueva,
          v.motivoCambio,
          v.tipoOperacion,
          v.procesadoPor,
          v.createdAt
        )
    );

    return new ExpedienteAggregate(
      data.id,
      data.tenantId,
      data.numero,
      parseFloat(data.costo.toString()),
      data.calificacion,
      data.motivoCalificacion,
      data.fechaPrimeraVersion,
      data.fechaUltimaActualizacion,
      versiones
    );
  }
}
