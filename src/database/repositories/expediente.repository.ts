import { Expediente, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma/client';
import { Logger } from '../../utils/logger';
import { ExpedienteData, ExpedienteEstado } from '../../types';

export class ExpedienteRepository {
  private db: PrismaClient;

  constructor() {
    this.db = prisma;
  }

  async create(data: {
    tenantId: string;
    expedienteNum: string;
    costoGuardado?: number;
    costoSistema?: number;
    estado?: ExpedienteEstado;
    fechaRegistro?: Date;
    servicio?: string;
    subservicio?: string;
    notas?: string;
  }): Promise<ExpedienteData> {
    try {
      const expediente = await this.db.expediente.create({
        data: {
          tenantId: data.tenantId,
          expedienteNum: data.expedienteNum,
          costoGuardado: data.costoGuardado,
          costoSistema: data.costoSistema,
          estado: data.estado || ExpedienteEstado.PENDIENTE,
          fechaRegistro: data.fechaRegistro,
          servicio: data.servicio,
          subservicio: data.subservicio,
          notas: data.notas,
        },
      });

      Logger.database('Expediente creado', {
        tenantId: data.tenantId,
        expedienteNum: data.expedienteNum,
        metadata: { estado: expediente.estado },
      });

      return this.mapToExpedienteData(expediente);
    } catch (error) {
      Logger.error(
        'Error creando expediente',
        {
          tenantId: data.tenantId,
          expedienteNum: data.expedienteNum,
        },
        error as Error
      );
      throw error;
    }
  }

  async findByTenantAndNumber(
    tenantId: string,
    expedienteNum: string
  ): Promise<ExpedienteData | null> {
    try {
      const expediente = await this.db.expediente.findUnique({
        where: {
          tenantId_expedienteNum: {
            tenantId,
            expedienteNum,
          },
        },
      });

      return expediente ? this.mapToExpedienteData(expediente) : null;
    } catch (error) {
      Logger.error(
        'Error buscando expediente',
        {
          tenantId,
          expedienteNum,
        },
        error as Error
      );
      throw error;
    }
  }

  async findByTenant(tenantId: string, limit?: number, offset?: number): Promise<ExpedienteData[]> {
    try {
      const expedientes = await this.db.expediente.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      return expedientes.map(this.mapToExpedienteData);
    } catch (error) {
      Logger.error('Error obteniendo expedientes por tenant', { tenantId }, error as Error);
      throw error;
    }
  }

  async findPendientesByTenant(tenantId: string): Promise<ExpedienteData[]> {
    try {
      const expedientes = await this.db.expediente.findMany({
        where: {
          tenantId,
          estado: ExpedienteEstado.PENDIENTE,
          costoSistema: { not: null },
        },
        orderBy: { createdAt: 'asc' },
      });

      return expedientes.map(this.mapToExpedienteData);
    } catch (error) {
      Logger.error('Error obteniendo expedientes pendientes', { tenantId }, error as Error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<{
      costoSistema: number;
      estado: ExpedienteEstado;
      fechaRegistro: Date;
      servicio: string;
      subservicio: string;
      notas: string;
    }>
  ): Promise<ExpedienteData> {
    try {
      const expediente = await this.db.expediente.update({
        where: { id },
        data,
      });

      Logger.database('Expediente actualizado', {
        expedienteId: id,
        metadata: { estado: expediente.estado },
      });

      return this.mapToExpedienteData(expediente);
    } catch (error) {
      Logger.error('Error actualizando expediente', { expedienteId: id }, error as Error);
      throw error;
    }
  }

  async updateBatch(
    updates: Array<{
      tenantId: string;
      expedienteNum: string;
      data: Partial<{
        costoSistema: number;
        estado: ExpedienteEstado;
        fechaRegistro: Date;
        servicio: string;
        subservicio: string;
        notas: string;
      }>;
    }>
  ): Promise<number> {
    try {
      let updatedCount = 0;

      // Usar transacción para actualizaciones en lote
      await this.db.$transaction(async (tx) => {
        for (const update of updates) {
          const result = await tx.expediente.updateMany({
            where: {
              tenantId: update.tenantId,
              expedienteNum: update.expedienteNum,
            },
            data: update.data,
          });
          updatedCount += result.count;
        }
      });

      Logger.database('Expedientes actualizados en lote', {
        metadata: { count: updatedCount },
      });

      return updatedCount;
    } catch (error) {
      Logger.error('Error actualizando expedientes en lote', {}, error as Error);
      throw error;
    }
  }

  async upsert(data: {
    tenantId: string;
    expedienteNum: string;
    costoGuardado?: number;
    costoSistema?: number;
    estado?: ExpedienteEstado;
    fechaRegistro?: Date;
    servicio?: string;
    subservicio?: string;
    notas?: string;
  }): Promise<ExpedienteData> {
    try {
      const expediente = await this.db.expediente.upsert({
        where: {
          tenantId_expedienteNum: {
            tenantId: data.tenantId,
            expedienteNum: data.expedienteNum,
          },
        },
        update: {
          costoGuardado: data.costoGuardado,
          costoSistema: data.costoSistema,
          estado: data.estado || ExpedienteEstado.PENDIENTE,
          fechaRegistro: data.fechaRegistro,
          servicio: data.servicio,
          subservicio: data.subservicio,
          notas: data.notas,
        },
        create: {
          tenantId: data.tenantId,
          expedienteNum: data.expedienteNum,
          costoGuardado: data.costoGuardado,
          costoSistema: data.costoSistema,
          estado: data.estado || ExpedienteEstado.PENDIENTE,
          fechaRegistro: data.fechaRegistro,
          servicio: data.servicio,
          subservicio: data.subservicio,
          notas: data.notas,
        },
      });

      Logger.database('Expediente upsert', {
        tenantId: data.tenantId,
        expedienteNum: data.expedienteNum,
        metadata: { estado: expediente.estado },
      });

      return this.mapToExpedienteData(expediente);
    } catch (error) {
      Logger.error(
        'Error en upsert de expediente',
        {
          tenantId: data.tenantId,
          expedienteNum: data.expedienteNum,
        },
        error as Error
      );
      throw error;
    }
  }

  async getStatsByTenant(tenantId: string, dateFrom?: Date, dateTo?: Date) {
    try {
      const whereClause: any = { tenantId };

      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) whereClause.createdAt.gte = dateFrom;
        if (dateTo) whereClause.createdAt.lte = dateTo;
      }

      const [total, liberados, pendientes, noEncontrados] = await Promise.all([
        this.db.expediente.count({ where: whereClause }),
        this.db.expediente.count({
          where: { ...whereClause, estado: ExpedienteEstado.LIBERADO },
        }),
        this.db.expediente.count({
          where: { ...whereClause, estado: ExpedienteEstado.PENDIENTE },
        }),
        this.db.expediente.count({
          where: { ...whereClause, estado: ExpedienteEstado.NO_ENCONTRADO },
        }),
      ]);

      // Estadísticas por lógica de validación
      const statsByLogic = await this.db.validation.groupBy({
        by: ['logicaUsada'],
        where: {
          tenantId,
          resultado: 'ACEPTADO',
          ...(dateFrom || dateTo
            ? {
                fechaValidacion: {
                  gte: dateFrom,
                  lte: dateTo,
                },
              }
            : {}),
        },
        _count: {
          logicaUsada: true,
        },
      });

      const porLogica = {
        logica1: 0,
        logica2: 0,
        logica3: 0,
      };

      for (const stat of statsByLogic) {
        switch (stat.logicaUsada) {
          case 1:
            porLogica.logica1 = stat._count.logicaUsada;
            break;
          case 2:
            porLogica.logica2 = stat._count.logicaUsada;
            break;
          case 3:
            porLogica.logica3 = stat._count.logicaUsada;
            break;
        }
      }

      return {
        total,
        liberados,
        pendientes,
        noEncontrados,
        porLogica,
        tasaLiberacion: total > 0 ? (liberados / total) * 100 : 0,
      };
    } catch (error) {
      Logger.error('Error obteniendo estadísticas', { tenantId }, error as Error);
      throw error;
    }
  }

  async deleteByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.db.expediente.deleteMany({
        where: { tenantId },
      });

      Logger.database('Expedientes eliminados por tenant', {
        tenantId,
        metadata: { count: result.count },
      });

      return result.count;
    } catch (error) {
      Logger.error('Error eliminando expedientes por tenant', { tenantId }, error as Error);
      throw error;
    }
  }

  async getRecentActivity(tenantId: string, limit: number = 10): Promise<ExpedienteData[]> {
    try {
      const expedientes = await this.db.expediente.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      return expedientes.map(this.mapToExpedienteData);
    } catch (error) {
      Logger.error('Error obteniendo actividad reciente', { tenantId }, error as Error);
      throw error;
    }
  }

  private mapToExpedienteData(expediente: Expediente): ExpedienteData {
    return {
      id: expediente.id,
      expedienteNum: expediente.expedienteNum,
      costoGuardado: expediente.costoGuardado ? Number(expediente.costoGuardado) : undefined,
      costoSistema: expediente.costoSistema ? Number(expediente.costoSistema) : undefined,
      estado: expediente.estado as ExpedienteEstado,
      fechaRegistro: expediente.fechaRegistro || undefined,
      servicio: expediente.servicio || undefined,
      subservicio: expediente.subservicio || undefined,
      notas: expediente.notas || undefined,
    };
  }
}

export default ExpedienteRepository;
