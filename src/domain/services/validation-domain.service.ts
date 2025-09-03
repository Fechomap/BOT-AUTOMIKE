import { ValidationResult, LogicaValidacion, ResultadoValidacion } from '../value-objects/validation-result.vo';

export interface LogicasConfig {
  costoExacto: boolean;
  margen10Porciento: boolean;
  costoSuperior: boolean;
}

export class ValidationDomainService {
  /**
   * Valida un expediente aplicando las lógicas de negocio configuradas
   */
  static validate(
    expediente: string,
    costoGuardado: number,
    costoSistema: number,
    logicasActivas?: LogicasConfig
  ): ValidationResult {
    
    // Por defecto todas las lógicas están activas para mantener compatibilidad
    const config = logicasActivas || {
      costoExacto: true,
      margen10Porciento: true,
      costoSuperior: true
    };
    
    // Lógica 1: Costo Exacto (siempre activa cuando está habilitada)
    if (config.costoExacto && this.isCostoExacto(costoGuardado, costoSistema)) {
      return new ValidationResult(
        expediente,
        costoGuardado,
        costoSistema,
        LogicaValidacion.COSTO_EXACTO,
        ResultadoValidacion.ACEPTADO,
        `Liberado - Costo exacto ($${costoSistema.toFixed(2)})`,
        true
      );
    }
    
    // Lógica 2: Margen ±10%
    if (config.margen10Porciento && this.isWithinMargin(costoGuardado, costoSistema)) {
      const margenInf = costoGuardado * 0.9;
      const margenSup = costoGuardado * 1.1;
      return new ValidationResult(
        expediente,
        costoGuardado,
        costoSistema,
        LogicaValidacion.MARGEN_10_PORCIENTO,
        ResultadoValidacion.ACEPTADO,
        `Liberado - Margen ±10% ($${margenInf.toFixed(2)} - $${margenSup.toFixed(2)})`,
        true
      );
    }
    
    // Lógica 3: Costo Superior
    if (config.costoSuperior && this.isCostoSuperior(costoGuardado, costoSistema)) {
      return new ValidationResult(
        expediente,
        costoGuardado,
        costoSistema,
        LogicaValidacion.COSTO_SUPERIOR,
        ResultadoValidacion.ACEPTADO,
        `Liberado - Costo superior ($${costoSistema.toFixed(2)} > $${costoGuardado.toFixed(2)})`,
        true
      );
    }
    
    // No cumple ninguna lógica
    return new ValidationResult(
      expediente,
      costoGuardado,
      costoSistema,
      0,
      ResultadoValidacion.PENDIENTE,
      'Requiere revisión manual - No cumple lógicas de liberación',
      false
    );
  }
  
  private static isCostoExacto(costoGuardado: number, costoSistema: number): boolean {
    return Math.abs(costoGuardado - costoSistema) < 0.01; // Tolerancia 1 centavo
  }
  
  private static isWithinMargin(costoGuardado: number, costoSistema: number): boolean {
    const margenInf = costoGuardado * 0.9;
    const margenSup = costoGuardado * 1.1;
    return costoSistema >= margenInf && costoSistema <= margenSup;
  }
  
  private static isCostoSuperior(costoGuardado: number, costoSistema: number): boolean {
    return costoSistema > costoGuardado;
  }
}