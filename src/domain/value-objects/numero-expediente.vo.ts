export class NumeroExpediente {
  private readonly _valor: string;

  constructor(numero: string) {
    this._valor = this.normalizar(numero);
    this.validar(this._valor);
  }

  private normalizar(numero: string): string {
    if (typeof numero !== 'string') {
      throw new Error('El número de expediente debe ser una cadena de texto');
    }

    return numero
      .trim()
      .toUpperCase()
      .replace(/[^\w-]/g, '');
  }

  private validar(numero: string): void {
    if (!numero || numero.length === 0) {
      throw new Error('El número de expediente no puede estar vacío');
    }

    if (numero.length < 3) {
      throw new Error('El número de expediente debe tener al menos 3 caracteres');
    }

    if (numero.length > 50) {
      throw new Error('El número de expediente no puede tener más de 50 caracteres');
    }

    const patronValido = /^[A-Z0-9-]+$/;
    if (!patronValido.test(numero)) {
      throw new Error('El número de expediente solo puede contener letras, números y guiones');
    }
  }

  get valor(): string {
    return this._valor;
  }

  equals(otro: NumeroExpediente): boolean {
    return this._valor === otro._valor;
  }

  toString(): string {
    return this._valor;
  }

  static create(numero: string): NumeroExpediente {
    return new NumeroExpediente(numero);
  }

  static isValid(numero: string): boolean {
    try {
      new NumeroExpediente(numero);
      return true;
    } catch {
      return false;
    }
  }
}
