import { Validation, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma/client';
import { Logger } from '../../utils/logger';
import { ValidationData, LogicaValidacion, ResultadoValidacion } from '../../types';

export class ValidationRepository {
  private db: PrismaClient;

  constructor() {
    this.db = prisma;
  }

  async create(data: {
    expedienteId: string;
    tenantId: string;
    logicaUsada: LogicaValidacion;
    resultado: ResultadoValidacion;
    costoAnterior?: number;
    costoNuevo?: number;
  }): Promise<ValidationData> {
    try {
      const validation = await this.db.validation.create({
        data: {
          expedienteId: data.expedienteId,
          tenantId: data.tenantId,
          logicaUsada: data.logicaUsada,
          resultado: data.resultado,
          costoAnterior: data.costoAnterior,
          costoNuevo: data.costoNuevo,
        },
      });

      Logger.database('Validación creada', {
        tenantId: data.tenantId,
        expedienteId: data.expedienteId,
        metadata: { logica: data.logicaUsada, resultado: data.resultado },
      });

      return this.mapToValidationData(validation);
    } catch (error) {
      Logger.error(
        'Error creando validación',
        {
          tenantId: data.tenantId,
          expedienteId: data.expedienteId,
        },
        error as Error
      );
      throw error;
    }
  }

  async findByExpediente(expedienteId: string): Promise<ValidationData[]> {
    try {
      const validations = await this.db.validation.findMany({
        where: { expedienteId },
        orderBy: { fechaValidacion: 'desc' },
      });

      return validations.map(this.mapToValidationData);
    } catch (error) {
      Logger.error(
        'Error obteniendo validaciones por expediente',
        {
          expedienteId,
        },
        error as Error
      );
      throw error;
    }
  }

  async findByTenant(
    tenantId: string,
    limit?: number,
    offset?: number,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ValidationData[]> {
    try {
      const whereClause: any = { tenantId };

      if (dateFrom || dateTo) {
        whereClause.fechaValidacion = {};
        if (dateFrom) whereClause.fechaValidacion.gte = dateFrom;
        if (dateTo) whereClause.fechaValidacion.lte = dateTo;
      }

      const validations = await this.db.validation.findMany({
        where: whereClause,
        orderBy: { fechaValidacion: 'desc' },
        take: limit,
        skip: offset,
      });

      return validations.map(this.mapToValidationData);
    } catch (error) {
      Logger.error(
        'Error obteniendo validaciones por tenant',
        {
          tenantId,
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
        whereClause.fechaValidacion = {};
        if (dateFrom) whereClause.fechaValidacion.gte = dateFrom;
        if (dateTo) whereClause.fechaValidacion.lte = dateTo;
      }

      // Estadísticas por resultado
      const [aceptados, pendientes, noEncontrados] = await Promise.all([
        this.db.validation.count({
          where: { ...whereClause, resultado: ResultadoValidacion.ACEPTADO },
        }),
        this.db.validation.count({
          where: { ...whereClause, resultado: ResultadoValidacion.PENDIENTE },
        }),
        this.db.validation.count({
          where: { ...whereClause, resultado: ResultadoValidacion.NO_ENCONTRADO },
        }),
      ]);

      // Estadísticas por lógica
      const statsByLogic = await this.db.validation.groupBy({
        by: ['logicaUsada', 'resultado'],
        where: whereClause,
        _count: {
          logicaUsada: true,
        },
      });

      const porLogica = {
        logica1: { total: 0, aceptados: 0 },
        logica2: { total: 0, aceptados: 0 },
        logica3: { total: 0, aceptados: 0 },
      };

      for (const stat of statsByLogic) {
        const count = stat._count.logicaUsada;
        const isAcepted = stat.resultado === ResultadoValidacion.ACEPTADO;

        switch (stat.logicaUsada) {
          case LogicaValidacion.COSTO_EXACTO:
            porLogica.logica1.total += count;
            if (isAcepted) porLogica.logica1.aceptados += count;
            break;
          case LogicaValidacion.MARGEN_10_PORCIENTO:
            porLogica.logica2.total += count;
            if (isAcepted) porLogica.logica2.aceptados += count;
            break;
          case LogicaValidacion.COSTO_SUPERIOR:
            porLogica.logica3.total += count;
            if (isAcepted) porLogica.logica3.aceptados += count;
            break;
        }
      }

      const total = aceptados + pendientes + noEncontrados;

      return {
        total,
        aceptados,
        pendientes,
        noEncontrados,
        porLogica,
        tasaAceptacion: total > 0 ? (aceptados / total) * 100 : 0,
      };
    } catch (error) {
      Logger.error(
        'Error obteniendo estadísticas de validaciones',
        {
          tenantId,
        },
        error as Error
      );
      throw error;
    }
  }

  async getLatestByExpediente(expedienteId: string): Promise<ValidationData | null> {
    try {
      const validation = await this.db.validation.findFirst({
        where: { expedienteId },
        orderBy: { fechaValidacion: 'desc' },
      });

      return validation ? this.mapToValidationData(validation) : null;
    } catch (error) {
      Logger.error(
        'Error obteniendo última validación',
        {
          expedienteId,
        },
        error as Error
      );
      throw error;
    }
  }

  async getTrendsByTenant(tenantId: string, days: number = 30) {
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);

      const trends = await this.db.validation.findMany({
        where: {
          tenantId,
          fechaValidacion: {
            gte: dateFrom,
          },
        },
        select: {
          fechaValidacion: true,
          resultado: true,
          logicaUsada: true,
        },
        orderBy: { fechaValidacion: 'asc' },
      });

      // Agrupar por día
      const trendsByDay: Record<
        string,
        {
          date: string;
          total: number;
          aceptados: number;
          pendientes: number;
          noEncontrados: number;
          porLogica: { logica1: number; logica2: number; logica3: number };
        }
      > = {};

      for (const trend of trends) {
        const dateKey = trend.fechaValidacion.toISOString().split('T')[0];

        if (!trendsByDay[dateKey]) {
          trendsByDay[dateKey] = {
            date: dateKey,
            total: 0,
            aceptados: 0,
            pendientes: 0,
            noEncontrados: 0,
            porLogica: { logica1: 0, logica2: 0, logica3: 0 },
          };
        }

        const dayData = trendsByDay[dateKey];
        dayData.total++;

        switch (trend.resultado) {
          case ResultadoValidacion.ACEPTADO:
            dayData.aceptados++;
            break;
          case ResultadoValidacion.PENDIENTE:
            dayData.pendientes++;
            break;
          case ResultadoValidacion.NO_ENCONTRADO:
            dayData.noEncontrados++;
            break;
        }

        switch (trend.logicaUsada) {
          case LogicaValidacion.COSTO_EXACTO:
            dayData.porLogica.logica1++;
            break;
          case LogicaValidacion.MARGEN_10_PORCIENTO:
            dayData.porLogica.logica2++;
            break;
          case LogicaValidacion.COSTO_SUPERIOR:
            dayData.porLogica.logica3++;
            break;
        }
      }

      return Object.values(trendsByDay);
    } catch (error) {
      Logger.error('Error obteniendo tendencias', { tenantId }, error as Error);
      throw error;
    }
  }

  async deleteByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.db.validation.deleteMany({
        where: { tenantId },
      });

      Logger.database('Validaciones eliminadas por tenant', {
        tenantId,
        metadata: { count: result.count },
      });

      return result.count;
    } catch (error) {
      Logger.error(
        'Error eliminando validaciones por tenant',
        {
          tenantId,
        },
        error as Error
      );
      throw error;
    }
  }

  async createBatch(
    validations: Array<{
      expedienteId: string;
      tenantId: string;
      logicaUsada: LogicaValidacion;
      resultado: ResultadoValidacion;
      costoAnterior?: number;
      costoNuevo?: number;
    }>
  ): Promise<number> {
    try {
      const result = await this.db.validation.createMany({
        data: validations,
      });

      Logger.database('Validaciones creadas en lote', {
        metadata: { count: result.count },
      });

      return result.count;
    } catch (error) {
      Logger.error('Error creando validaciones en lote', {}, error as Error);
      throw error;
    }
  }

  private mapToValidationData(validation: Validation): ValidationData {
    return {
      id: validation.id,
      expedienteId: validation.expedienteId,
      logicaUsada: validation.logicaUsada as LogicaValidacion,
      resultado: validation.resultado as ResultadoValidacion,
      costoAnterior: validation.costoAnterior ? Number(validation.costoAnterior) : undefined,
      costoNuevo: validation.costoNuevo ? Number(validation.costoNuevo) : undefined,
      fechaValidacion: validation.fechaValidacion,
    };
  }
}

export default ValidationRepository;
