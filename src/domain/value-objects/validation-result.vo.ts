export enum LogicaValidacion {
  COSTO_EXACTO = 1,
  MARGEN_10_PORCIENTO = 2,
  COSTO_SUPERIOR = 3
}

export enum ResultadoValidacion {
  ACEPTADO = 'ACEPTADO',
  PENDIENTE = 'PENDIENTE'
}

export class ValidationResult {
  constructor(
    public readonly expediente: string,
    public readonly costoGuardado: number,
    public readonly costoSistema: number,
    public readonly logicaUsada: LogicaValidacion | 0,
    public readonly resultado: ResultadoValidacion,
    public mensaje: string, // No readonly para permitir modificaciones
    public readonly debeLiberarse: boolean
  ) {}
}