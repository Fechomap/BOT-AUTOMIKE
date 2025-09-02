import {
  LogicaValidacion,
  ResultadoValidacion,
  ExpedienteEstado,
  ExpedienteData,
} from '../../types';
import { Logger } from '../../utils/logger';

export interface ValidationOptions {
  enableLogica2: boolean; // Margen ±10%
  enableLogica3: boolean; // Costo superior
}

export interface ValidationContext {
  expedienteNum: string;
  costoGuardado: number;
  costoSistema: number;
  tenantId: string;
}

export interface ValidationResult {
  expedienteNum: string;
  logicaUsada: LogicaValidacion | 0; // 0 para casos sin lógica aplicada
  resultado: ResultadoValidacion;
  estado: ExpedienteEstado;
  debeLiberarse: boolean;
  mensaje: string;
}

export class ValidationService {
  /**
   * Ejecuta todas las lógicas de validación configuradas
   */
  static validateExpediente(
    context: ValidationContext,
    options: ValidationOptions
  ): ValidationResult {
    const { expedienteNum, costoGuardado, costoSistema } = context;

    Logger.processing(
      `Iniciando validación - Guardado: ${costoGuardado}, Sistema: ${costoSistema}`,
      expedienteNum,
      context.tenantId
    );

    // Lógica 1: Costo Exacto (Siempre activa)
    const logica1Result = this.aplicarLogica1(costoGuardado, costoSistema);
    if (logica1Result.debeLiberarse) {
      Logger.processing(`✅ Aprobado por Lógica 1 (Costo Exacto)`, expedienteNum, context.tenantId);
      return {
        expedienteNum,
        ...logica1Result,
        logicaUsada: LogicaValidacion.COSTO_EXACTO,
      };
    }

    // Lógica 2: Margen ±10% (Si está habilitada)
    if (options.enableLogica2) {
      const logica2Result = this.aplicarLogica2(costoGuardado, costoSistema);
      if (logica2Result.debeLiberarse) {
        Logger.processing(
          `✅ Aprobado por Lógica 2 (Margen ±10%)`,
          expedienteNum,
          context.tenantId
        );
        return {
          expedienteNum,
          ...logica2Result,
          logicaUsada: LogicaValidacion.MARGEN_10_PORCIENTO,
        };
      }
    }

    // Lógica 3: Costo Superior (Si está habilitada)
    if (options.enableLogica3) {
      const logica3Result = this.aplicarLogica3(costoGuardado, costoSistema);
      if (logica3Result.debeLiberarse) {
        Logger.processing(
          `✅ Aprobado por Lógica 3 (Costo Superior)`,
          expedienteNum,
          context.tenantId
        );
        return {
          expedienteNum,
          ...logica3Result,
          logicaUsada: LogicaValidacion.COSTO_SUPERIOR,
        };
      }
    }

    // Si ninguna lógica aprueba, queda pendiente
    Logger.processing(
      `⏳ Queda pendiente - No cumple ninguna lógica`,
      expedienteNum,
      context.tenantId
    );

    return {
      expedienteNum,
      logicaUsada: 0,
      resultado: ResultadoValidacion.PENDIENTE,
      estado: ExpedienteEstado.PENDIENTE,
      debeLiberarse: false,
      mensaje: 'Requiere revisión manual - No cumple lógicas de liberación automática',
    };
  }

  /**
   * Lógica 1: Costo Exacto
   * El costo del sistema debe ser exactamente igual al costo guardado
   */
  private static aplicarLogica1(costoGuardado: number, costoSistema: number) {
    const esExacto = Math.abs(costoGuardado - costoSistema) < 0.01; // Tolerancia de 1 centavo

    return {
      resultado: esExacto ? ResultadoValidacion.ACEPTADO : ResultadoValidacion.PENDIENTE,
      estado: esExacto ? ExpedienteEstado.LIBERADO : ExpedienteEstado.PENDIENTE,
      debeLiberarse: esExacto,
      mensaje: esExacto
        ? `Liberado automáticamente - Costo exacto ($${costoSistema.toFixed(2)})`
        : `Costo no coincide - Guardado: $${costoGuardado.toFixed(2)}, Sistema: $${costoSistema.toFixed(2)}`,
    };
  }

  /**
   * Lógica 2: Margen ±10%
   * El costo del sistema debe estar dentro del rango ±10% del costo guardado
   */
  private static aplicarLogica2(costoGuardado: number, costoSistema: number) {
    const margenInferior = costoGuardado * 0.9;
    const margenSuperior = costoGuardado * 1.1;
    const estaDentroDelMargen = costoSistema >= margenInferior && costoSistema <= margenSuperior;

    return {
      resultado: estaDentroDelMargen ? ResultadoValidacion.ACEPTADO : ResultadoValidacion.PENDIENTE,
      estado: estaDentroDelMargen ? ExpedienteEstado.LIBERADO : ExpedienteEstado.PENDIENTE,
      debeLiberarse: estaDentroDelMargen,
      mensaje: estaDentroDelMargen
        ? `Liberado por margen ±10% - Rango: $${margenInferior.toFixed(2)} - $${margenSuperior.toFixed(2)}`
        : `Fuera del margen ±10% - Actual: $${costoSistema.toFixed(2)}, Rango: $${margenInferior.toFixed(2)} - $${margenSuperior.toFixed(2)}`,
    };
  }

  /**
   * Lógica 3: Costo Superior
   * El costo del sistema debe ser mayor al costo guardado
   */
  private static aplicarLogica3(costoGuardado: number, costoSistema: number) {
    const esSuperior = costoSistema > costoGuardado;

    return {
      resultado: esSuperior ? ResultadoValidacion.ACEPTADO : ResultadoValidacion.PENDIENTE,
      estado: esSuperior ? ExpedienteEstado.LIBERADO : ExpedienteEstado.PENDIENTE,
      debeLiberarse: esSuperior,
      mensaje: esSuperior
        ? `Liberado por costo superior - Sistema: $${costoSistema.toFixed(2)} > Guardado: $${costoGuardado.toFixed(2)}`
        : `Costo no superior - Sistema: $${costoSistema.toFixed(2)} ≤ Guardado: $${costoGuardado.toFixed(2)}`,
    };
  }

  /**
   * Valida un lote de expedientes
   */
  static validateBatch(
    expedientes: ValidationContext[],
    options: ValidationOptions
  ): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const expediente of expedientes) {
      try {
        const result = this.validateExpediente(expediente, options);
        results.push(result);
      } catch (error) {
        Logger.error(
          'Error validando expediente individual',
          {
            expedienteNum: expediente.expedienteNum,
            tenantId: expediente.tenantId,
          },
          error as Error
        );

        // Agregar resultado de error
        results.push({
          expedienteNum: expediente.expedienteNum,
          logicaUsada: 0,
          resultado: ResultadoValidacion.NO_ENCONTRADO,
          estado: ExpedienteEstado.NO_ENCONTRADO,
          debeLiberarse: false,
          mensaje: `Error en validación: ${(error as Error).message}`,
        });
      }
    }

    return results;
  }

  /**
   * Calcula estadísticas de un conjunto de validaciones
   */
  static calculateStats(results: ValidationResult[]) {
    const stats = {
      total: results.length,
      liberados: 0,
      pendientes: 0,
      noEncontrados: 0,
      porLogica: {
        logica1: 0, // Costo exacto
        logica2: 0, // Margen ±10%
        logica3: 0, // Costo superior
      },
      tasaLiberacion: 0,
    };

    for (const result of results) {
      switch (result.estado) {
        case ExpedienteEstado.LIBERADO:
          stats.liberados++;
          break;
        case ExpedienteEstado.PENDIENTE:
          stats.pendientes++;
          break;
        case ExpedienteEstado.NO_ENCONTRADO:
          stats.noEncontrados++;
          break;
      }

      // Contar por lógica
      switch (result.logicaUsada) {
        case LogicaValidacion.COSTO_EXACTO:
          stats.porLogica.logica1++;
          break;
        case LogicaValidacion.MARGEN_10_PORCIENTO:
          stats.porLogica.logica2++;
          break;
        case LogicaValidacion.COSTO_SUPERIOR:
          stats.porLogica.logica3++;
          break;
      }
    }

    stats.tasaLiberacion = stats.total > 0 ? (stats.liberados / stats.total) * 100 : 0;

    return stats;
  }

  /**
   * Explica qué lógicas están activas
   */
  static explainLogics(options: ValidationOptions): string {
    const explanations: string[] = [];

    explanations.push(
      '✅ **Lógica 1 - Costo Exacto** (Siempre activa)\n   Se libera si el costo del sistema es exactamente igual al costo guardado'
    );

    if (options.enableLogica2) {
      explanations.push(
        '✅ **Lógica 2 - Margen ±10%** (Activa)\n   Se libera si el costo del sistema está dentro del ±10% del costo guardado'
      );
    } else {
      explanations.push('❌ **Lógica 2 - Margen ±10%** (Inactiva)');
    }

    if (options.enableLogica3) {
      explanations.push(
        '✅ **Lógica 3 - Costo Superior** (Activa)\n   Se libera si el costo del sistema es mayor al costo guardado'
      );
    } else {
      explanations.push('❌ **Lógica 3 - Costo Superior** (Inactiva)');
    }

    return explanations.join('\n\n');
  }

  /**
   * Revalida expedientes pendientes (para jobs automáticos)
   */
  static revalidatePendientes(
    expedientesPendientes: ExpedienteData[],
    options: ValidationOptions
  ): ValidationResult[] {
    const contexts: ValidationContext[] = expedientesPendientes
      .filter((exp) => exp.costoGuardado && exp.costoSistema)
      .map((exp) => ({
        expedienteNum: exp.expedienteNum,
        costoGuardado: exp.costoGuardado!,
        costoSistema: exp.costoSistema!,
        tenantId: 'revalidation', // Se pasará el tenant real en la implementación
      }));

    Logger.info(`Revalidando ${contexts.length} expedientes pendientes`);

    return this.validateBatch(contexts, options);
  }
}

export default ValidationService;
