export class CostoExpediente {
  private readonly _valor: number;

  constructor(costo: number | string) {
    this._valor = this.normalizar(costo);
    this.validar(this._valor);
  }

  private normalizar(costo: number | string): number {
    let numero: number;

    if (typeof costo === 'string') {
      const costoLimpio = costo.replace(/[,$\s]/g, '');
      numero = parseFloat(costoLimpio);
    } else if (typeof costo === 'number') {
      numero = costo;
    } else {
      throw new Error('El costo debe ser un número o cadena de texto válida');
    }

    if (isNaN(numero) || !isFinite(numero)) {
      throw new Error('El costo debe ser un número válido');
    }

    return Math.round(numero * 100) / 100;
  }

  private validar(costo: number): void {
    if (costo < 0) {
      throw new Error('El costo no puede ser negativo');
    }

    if (costo > 999999999.99) {
      throw new Error('El costo no puede ser mayor a 999,999,999.99');
    }
  }

  get valor(): number {
    return this._valor;
  }

  get valorFormateado(): string {
    return this._valor.toLocaleString('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  equals(otro: CostoExpediente): boolean {
    return Math.abs(this._valor - otro._valor) < 0.001;
  }

  esMayorQue(otro: CostoExpediente): boolean {
    return this._valor > otro._valor;
  }

  esMenorQue(otro: CostoExpediente): boolean {
    return this._valor < otro._valor;
  }

  esCero(): boolean {
    return this._valor === 0;
  }

  tieneVariancia(otro: CostoExpediente, porcentajeTolerancia: number = 0): boolean {
    if (porcentajeTolerancia === 0) {
      return !this.equals(otro);
    }

    const diferencia = Math.abs(this._valor - otro._valor);
    const referencia = Math.max(this._valor, otro._valor);
    const variancia = referencia > 0 ? (diferencia / referencia) * 100 : 0;

    return variancia > porcentajeTolerancia;
  }

  calcularVariancia(otro: CostoExpediente): number {
    if (this._valor === 0 && otro._valor === 0) {
      return 0;
    }

    const diferencia = Math.abs(this._valor - otro._valor);
    const referencia = Math.max(this._valor, otro._valor);

    return referencia > 0 ? (diferencia / referencia) * 100 : 100;
  }

  toString(): string {
    return this._valor.toString();
  }

  static create(costo: number | string): CostoExpediente {
    return new CostoExpediente(costo);
  }

  static cero(): CostoExpediente {
    return new CostoExpediente(0);
  }

  static isValid(costo: number | string): boolean {
    try {
      new CostoExpediente(costo);
      return true;
    } catch {
      return false;
    }
  }
}
