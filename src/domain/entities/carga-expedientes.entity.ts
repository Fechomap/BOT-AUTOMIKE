export interface CargaExpedientesData {
  tenantId: string;
  nombreArchivo: string;
  totalExpedientes: number;
  nuevosExpedientes: number;
  actualizados: number;
  duplicadosSinCambio: number;
  errores: number;
  aprobados: number;
  pendientes: number;
  noAprobados: number;
  noEncontrados: number;
  esBaseline?: boolean;
  procesadoPor: string;
}

export interface CargaExpedientesEstadisticas {
  total: number;
  nuevos: number;
  actualizados: number;
  duplicados: number;
  errores: number;
  aprobados: number;
  pendientes: number;
  noAprobados: number;
  noEncontrados: number;
  tasaAprobacion: number;
  tasaExito: number;
}

export class CargaExpedientes {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly nombreArchivo: string,
    public readonly totalExpedientes: number,
    public readonly nuevosExpedientes: number,
    public readonly actualizados: number,
    public readonly duplicadosSinCambio: number,
    public readonly errores: number,
    public readonly aprobados: number,
    public readonly pendientes: number,
    public readonly noAprobados: number,
    public readonly noEncontrados: number,
    public readonly esBaseline: boolean,
    public readonly fechaProcesamiento: Date,
    public readonly procesadoPor: string
  ) {
    this.validarConsistencia();
  }

  static create(data: CargaExpedientesData): CargaExpedientes {
    return new CargaExpedientes(
      crypto.randomUUID(),
      data.tenantId,
      data.nombreArchivo,
      data.totalExpedientes,
      data.nuevosExpedientes,
      data.actualizados,
      data.duplicadosSinCambio,
      data.errores,
      data.aprobados,
      data.pendientes,
      data.noAprobados,
      data.noEncontrados,
      data.esBaseline || false,
      new Date(),
      data.procesadoPor
    );
  }

  private validarConsistencia(): void {
    const sumaResultados =
      this.nuevosExpedientes + this.actualizados + this.duplicadosSinCambio + this.errores;
    if (sumaResultados !== this.totalExpedientes) {
      throw new Error(
        `Inconsistencia en estadísticas: total (${this.totalExpedientes}) != suma de resultados (${sumaResultados})`
      );
    }

    const sumaCalificaciones =
      this.aprobados + this.pendientes + this.noAprobados + this.noEncontrados;
    const procesadosExitosos = this.totalExpedientes - this.errores;
    if (sumaCalificaciones !== procesadosExitosos) {
      throw new Error(
        `Inconsistencia en calificaciones: suma (${sumaCalificaciones}) != procesados exitosos (${procesadosExitosos})`
      );
    }
  }

  getEstadisticas(): CargaExpedientesEstadisticas {
    const procesadosExitosos = this.totalExpedientes - this.errores;

    return {
      total: this.totalExpedientes,
      nuevos: this.nuevosExpedientes,
      actualizados: this.actualizados,
      duplicados: this.duplicadosSinCambio,
      errores: this.errores,
      aprobados: this.aprobados,
      pendientes: this.pendientes,
      noAprobados: this.noAprobados,
      noEncontrados: this.noEncontrados,
      tasaAprobacion: procesadosExitosos > 0 ? (this.aprobados / procesadosExitosos) * 100 : 0,
      tasaExito: this.totalExpedientes > 0 ? (procesadosExitosos / this.totalExpedientes) * 100 : 0,
    };
  }

  esExitosa(): boolean {
    return this.errores === 0;
  }

  tieneExpedientesAprobados(): boolean {
    return this.aprobados > 0;
  }

  tieneExpedientesPendientes(): boolean {
    return this.pendientes + this.noAprobados + this.noEncontrados > 0;
  }

  getPorcentajeAprobacion(): number {
    const procesados = this.totalExpedientes - this.errores;
    return procesados > 0 ? (this.aprobados / procesados) * 100 : 0;
  }

  getPorcentajeErrores(): number {
    return this.totalExpedientes > 0 ? (this.errores / this.totalExpedientes) * 100 : 0;
  }

  getResumenTexto(): string {
    const stats = this.getEstadisticas();
    return `Carga: ${stats.total} expedientes | Nuevos: ${stats.nuevos} | Actualizados: ${stats.actualizados} | Duplicados: ${stats.duplicados} | Aprobados: ${stats.aprobados} (${stats.tasaAprobacion.toFixed(1)}%) | Errores: ${stats.errores}`;
  }
}
