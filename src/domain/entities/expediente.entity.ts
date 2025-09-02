export class Expediente {
  constructor(
    public readonly numero: string,
    public readonly costoGuardado: number
  ) {
    if (!numero.trim()) {
      throw new Error('Número de expediente es requerido');
    }
    
    if (costoGuardado < 0) {
      throw new Error('Costo guardado no puede ser negativo');
    }
  }
}