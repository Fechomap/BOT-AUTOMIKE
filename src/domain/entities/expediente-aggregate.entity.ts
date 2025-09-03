import {
  CalificacionExpediente,
  TipoOperacionVersion,
  ProcesadoPor,
} from '../enums/calificacion-expediente.enum';

export interface ExpedienteVersionData {
  id?: string;
  cargaId?: string;
  costoAnterior?: number;
  costoNuevo: number;
  calificacionAnterior?: CalificacionExpediente;
  calificacionNueva: CalificacionExpediente;
  motivoCambio: string;
  tipoOperacion: TipoOperacionVersion;
  procesadoPor: ProcesadoPor;
  createdAt?: Date;
}

export class ExpedienteVersion {
  constructor(
    public readonly id: string,
    public readonly expedienteId: string,
    public readonly cargaId: string | null,
    public readonly costoAnterior: number | null,
    public readonly costoNuevo: number,
    public readonly calificacionAnterior: CalificacionExpediente | null,
    public readonly calificacionNueva: CalificacionExpediente,
    public readonly motivoCambio: string,
    public readonly tipoOperacion: TipoOperacionVersion,
    public readonly procesadoPor: ProcesadoPor,
    public readonly createdAt: Date
  ) {}

  static create(expedienteId: string, data: ExpedienteVersionData): ExpedienteVersion {
    return new ExpedienteVersion(
      data.id || crypto.randomUUID(),
      expedienteId,
      data.cargaId || null,
      data.costoAnterior || null,
      data.costoNuevo,
      data.calificacionAnterior || null,
      data.calificacionNueva,
      data.motivoCambio,
      data.tipoOperacion,
      data.procesadoPor,
      data.createdAt || new Date()
    );
  }

  isCreacion(): boolean {
    return this.tipoOperacion === TipoOperacionVersion.CREACION;
  }

  isCambioCosto(): boolean {
    return this.tipoOperacion === TipoOperacionVersion.ACTUALIZACION_COSTO;
  }

  isReevaluacionCronJob(): boolean {
    return this.tipoOperacion === TipoOperacionVersion.REEVALUACION_CRONJOB;
  }
}

export class ExpedienteAggregate {
  private _versiones: ExpedienteVersion[] = [];

  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly numero: string,
    private _costo: number,
    private _calificacion: CalificacionExpediente,
    private _motivoCalificacion: string | null,
    public readonly fechaPrimeraVersion: Date,
    private _fechaUltimaActualizacion: Date,
    versiones: ExpedienteVersion[] = []
  ) {
    this._versiones = versiones;
  }

  static create(
    tenantId: string,
    numero: string,
    costo: number,
    calificacion: CalificacionExpediente,
    motivoCalificacion: string,
    cargaId?: string,
    procesadoPor: ProcesadoPor = ProcesadoPor.CARGA_MANUAL
  ): ExpedienteAggregate {
    const id = crypto.randomUUID();
    const now = new Date();

    const aggregate = new ExpedienteAggregate(
      id,
      tenantId,
      numero,
      costo,
      calificacion,
      motivoCalificacion,
      now,
      now
    );

    const versionInicial = ExpedienteVersion.create(id, {
      cargaId,
      costoNuevo: costo,
      calificacionNueva: calificacion,
      motivoCambio: 'Creación inicial del expediente',
      tipoOperacion: TipoOperacionVersion.CREACION,
      procesadoPor,
    });

    aggregate._versiones.push(versionInicial);
    return aggregate;
  }

  get costo(): number {
    return this._costo;
  }

  get calificacion(): CalificacionExpediente {
    return this._calificacion;
  }

  get motivoCalificacion(): string | null {
    return this._motivoCalificacion;
  }

  get fechaUltimaActualizacion(): Date {
    return this._fechaUltimaActualizacion;
  }

  get versiones(): ExpedienteVersion[] {
    return [...this._versiones];
  }

  get versionActual(): ExpedienteVersion | null {
    return this._versiones.length > 0 ? this._versiones[this._versiones.length - 1] : null;
  }

  actualizarCosto(
    nuevoCosto: number,
    nuevaCalificacion: CalificacionExpediente,
    motivoCambio: string,
    cargaId?: string,
    procesadoPor: ProcesadoPor = ProcesadoPor.CARGA_MANUAL
  ): void {
    if (this._costo === nuevoCosto && this._calificacion === nuevaCalificacion) {
      throw new Error('No hay cambios para actualizar');
    }

    const nuevaVersion = ExpedienteVersion.create(this.id, {
      cargaId,
      costoAnterior: this._costo,
      costoNuevo: nuevoCosto,
      calificacionAnterior: this._calificacion,
      calificacionNueva: nuevaCalificacion,
      motivoCambio,
      tipoOperacion:
        this._costo !== nuevoCosto
          ? TipoOperacionVersion.ACTUALIZACION_COSTO
          : TipoOperacionVersion.REEVALUACION_CRONJOB,
      procesadoPor,
    });

    this._versiones.push(nuevaVersion);
    this._costo = nuevoCosto;
    this._calificacion = nuevaCalificacion;
    this._motivoCalificacion = motivoCambio;
    this._fechaUltimaActualizacion = new Date();
  }

  reevaluar(
    nuevaCalificacion: CalificacionExpediente,
    motivoCambio: string,
    procesadoPor: ProcesadoPor = ProcesadoPor.CRONJOB
  ): boolean {
    if (this._calificacion === nuevaCalificacion) {
      return false;
    }

    if (this._calificacion === CalificacionExpediente.APROBADO) {
      throw new Error('Los expedientes APROBADO no pueden ser reevaluados');
    }

    const nuevaVersion = ExpedienteVersion.create(this.id, {
      costoAnterior: this._costo,
      costoNuevo: this._costo,
      calificacionAnterior: this._calificacion,
      calificacionNueva: nuevaCalificacion,
      motivoCambio,
      tipoOperacion: TipoOperacionVersion.REEVALUACION_CRONJOB,
      procesadoPor,
    });

    this._versiones.push(nuevaVersion);
    this._calificacion = nuevaCalificacion;
    this._motivoCalificacion = motivoCambio;
    this._fechaUltimaActualizacion = new Date();

    return true;
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

  puedeSerReevaluado(): boolean {
    return !this.esAprobado();
  }

  getNumeroVersiones(): number {
    return this._versiones.length;
  }

  tieneCambioDeCosto(): boolean {
    return this._versiones.some((v) => v.isCambioCosto());
  }
}
