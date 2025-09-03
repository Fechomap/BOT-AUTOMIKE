import { CalificacionExpediente } from '../enums/calificacion-expediente.enum';

export interface MotivoCalificacion {
  codigo: string;
  descripcion: string;
  detalles?: string;
}

export class EstadoCalificacion {
  private readonly _calificacion: CalificacionExpediente;
  private readonly _motivo: MotivoCalificacion;

  constructor(calificacion: CalificacionExpediente, motivo: MotivoCalificacion) {
    this._calificacion = calificacion;
    this._motivo = motivo;
    this.validar();
  }

  private validar(): void {
    if (!Object.values(CalificacionExpediente).includes(this._calificacion)) {
      throw new Error(`Calificación inválida: ${this._calificacion}`);
    }

    if (!this._motivo || !this._motivo.codigo || !this._motivo.descripcion) {
      throw new Error('El motivo de calificación es requerido');
    }
  }

  get calificacion(): CalificacionExpediente {
    return this._calificacion;
  }

  get motivo(): MotivoCalificacion {
    return { ...this._motivo };
  }

  get motivoTexto(): string {
    return this._motivo.detalles
      ? `${this._motivo.descripcion}: ${this._motivo.detalles}`
      : this._motivo.descripcion;
  }

  esAprobado(): boolean {
    return this._calificacion === CalificacionExpediente.APROBADO;
  }

  esNoAprobado(): boolean {
    return this._calificacion === CalificacionExpediente.NO_APROBADO;
  }

  esNoEncontrado(): boolean {
    return this._calificacion === CalificacionExpediente.NO_ENCONTRADO;
  }

  esPendienteEstado(): boolean {
    return this._calificacion === CalificacionExpediente.PENDIENTE;
  }

  esPendiente(): boolean {
    return this.esPendienteEstado() || this.esNoAprobado() || this.esNoEncontrado();
  }

  puedeSerReevaluado(): boolean {
    return !this.esAprobado();
  }

  equals(otro: EstadoCalificacion): boolean {
    return this._calificacion === otro._calificacion && this._motivo.codigo === otro._motivo.codigo;
  }

  toString(): string {
    return `${this._calificacion}: ${this.motivoTexto}`;
  }

  static aprobado(detalles?: string): EstadoCalificacion {
    return new EstadoCalificacion(CalificacionExpediente.APROBADO, {
      codigo: 'APROBADO',
      descripcion: 'Expediente cumple con las reglas de validación',
      detalles,
    });
  }

  static noAprobado(motivo: string, detalles?: string): EstadoCalificacion {
    return new EstadoCalificacion(CalificacionExpediente.NO_APROBADO, {
      codigo: 'NO_APROBADO',
      descripcion: motivo,
      detalles,
    });
  }

  static pendiente(detalles?: string): EstadoCalificacion {
    return new EstadoCalificacion(CalificacionExpediente.PENDIENTE, {
      codigo: 'PENDIENTE',
      descripcion: 'Expediente requiere validación manual',
      detalles,
    });
  }

  static noEncontrado(detalles?: string): EstadoCalificacion {
    return new EstadoCalificacion(CalificacionExpediente.NO_ENCONTRADO, {
      codigo: 'NO_ENCONTRADO',
      descripcion: 'Expediente no encontrado en el sistema',
      detalles,
    });
  }

  static costoIncorrecto(costoGuardado: number, costoSistema: number): EstadoCalificacion {
    return EstadoCalificacion.noAprobado(
      'Costo no coincide con el sistema',
      `Guardado: ${costoGuardado}, Sistema: ${costoSistema}`
    );
  }

  static margenExcedido(
    costoGuardado: number,
    costoSistema: number,
    margenPorcentaje: number
  ): EstadoCalificacion {
    const diferencia = Math.abs(costoGuardado - costoSistema);
    const porcentaje = ((diferencia / costoSistema) * 100).toFixed(1);

    return EstadoCalificacion.noAprobado(
      `Margen excedido (${porcentaje}% > ${margenPorcentaje}%)`,
      `Guardado: ${costoGuardado}, Sistema: ${costoSistema}`
    );
  }

  static logicaCumplida(numeroLogica: number, descripcionLogica: string): EstadoCalificacion {
    return EstadoCalificacion.aprobado(`Cumple lógica ${numeroLogica}: ${descripcionLogica}`);
  }
}
