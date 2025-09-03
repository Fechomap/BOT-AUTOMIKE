export interface CronJobExecutionData {
  tenantId?: string;
  totalProcesados: number;
  cambiosAprobado: number;
  permanecenNoAprobado: number;
  permanecenNoEncontrado: number;
  cambiosCosto: number;
  fechaInicio: Date;
  fechaFin: Date;
}

export interface CronJobExecutionEstadisticas {
  totalProcesados: number;
  cambiosAprobado: number;
  permanecenNoAprobado: number;
  permanecenNoEncontrado: number;
  cambiosCosto: number;
  duracionMs: number;
  duracionSegundos: number;
  tasaCambioAprobacion: number;
  hayaCambios: boolean;
}

export class CronJobExecution {
  constructor(
    public readonly id: string,
    public readonly tenantId: string | null,
    public readonly totalProcesados: number,
    public readonly cambiosAprobado: number,
    public readonly permanecenNoAprobado: number,
    public readonly permanecenNoEncontrado: number,
    public readonly cambiosCosto: number,
    public readonly duracionMs: number,
    public readonly fechaInicio: Date,
    public readonly fechaFin: Date
  ) {
    this.validarConsistencia();
  }

  static create(data: CronJobExecutionData): CronJobExecution {
    const duracionMs = data.fechaFin.getTime() - data.fechaInicio.getTime();

    return new CronJobExecution(
      crypto.randomUUID(),
      data.tenantId || null,
      data.totalProcesados,
      data.cambiosAprobado,
      data.permanecenNoAprobado,
      data.permanecenNoEncontrado,
      data.cambiosCosto,
      duracionMs,
      data.fechaInicio,
      data.fechaFin
    );
  }

  static iniciar(_tenantId?: string): { fechaInicio: Date } {
    return {
      fechaInicio: new Date(),
    };
  }

  static finalizar(
    datosInicio: { fechaInicio: Date },
    resultados: Omit<CronJobExecutionData, 'fechaInicio' | 'fechaFin'>,
    _tenantId?: string
  ): CronJobExecution {
    const fechaFin = new Date();

    return CronJobExecution.create({
      ...resultados,
      tenantId: _tenantId,
      fechaInicio: datosInicio.fechaInicio,
      fechaFin,
    });
  }

  private validarConsistencia(): void {
    const sumaResultados =
      this.cambiosAprobado + this.permanecenNoAprobado + this.permanecenNoEncontrado;
    if (sumaResultados > this.totalProcesados) {
      throw new Error(
        `Inconsistencia en estadísticas: suma de resultados (${sumaResultados}) > total procesados (${this.totalProcesados})`
      );
    }

    if (this.duracionMs < 0) {
      throw new Error('La duración no puede ser negativa');
    }

    if (this.fechaFin < this.fechaInicio) {
      throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
    }
  }

  getEstadisticas(): CronJobExecutionEstadisticas {
    return {
      totalProcesados: this.totalProcesados,
      cambiosAprobado: this.cambiosAprobado,
      permanecenNoAprobado: this.permanecenNoAprobado,
      permanecenNoEncontrado: this.permanecenNoEncontrado,
      cambiosCosto: this.cambiosCosto,
      duracionMs: this.duracionMs,
      duracionSegundos: Math.round(this.duracionMs / 1000),
      tasaCambioAprobacion:
        this.totalProcesados > 0 ? (this.cambiosAprobado / this.totalProcesados) * 100 : 0,
      hayaCambios: this.hayCambios(),
    };
  }

  hayCambios(): boolean {
    return this.cambiosAprobado > 0 || this.cambiosCosto > 0;
  }

  hayCambiosSignificativos(): boolean {
    return this.cambiosAprobado > 0;
  }

  esEjecucionGlobal(): boolean {
    return this.tenantId === null;
  }

  esEjecucionTenant(): boolean {
    return this.tenantId !== null;
  }

  getDuracionFormateada(): string {
    const segundos = Math.floor(this.duracionMs / 1000);
    const minutos = Math.floor(segundos / 60);
    const segundosRestantes = segundos % 60;

    if (minutos > 0) {
      return `${minutos}m ${segundosRestantes}s`;
    }
    return `${segundos}s`;
  }

  getTasaProcesamientoPorSegundo(): number {
    const segundos = this.duracionMs / 1000;
    return segundos > 0 ? this.totalProcesados / segundos : 0;
  }

  getResumenTexto(): string {
    const stats = this.getEstadisticas();
    const scope = this.esEjecucionGlobal() ? 'Global' : `Tenant ${this.tenantId}`;

    return `CronJob ${scope}: ${stats.totalProcesados} procesados | ${stats.cambiosAprobado} nuevos aprobados | ${stats.cambiosCosto} cambios de costo | Duración: ${this.getDuracionFormateada()}`;
  }

  debeNotificar(): boolean {
    return this.hayCambiosSignificativos() || this.cambiosCosto > 0;
  }
}
