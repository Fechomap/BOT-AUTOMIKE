import { CalificacionExpediente } from '../enums/calificacion-expediente.enum';
import { CostoExpediente } from '../value-objects/costo-expediente.vo';
import { EstadoCalificacion } from '../value-objects/estado-calificacion.vo';

export interface LogicasValidacion {
  costoExacto: boolean;
  margen10Porciento: boolean;
  costoSuperior: boolean;
}

export interface ResultadoValidacion {
  calificacion: CalificacionExpediente;
  motivo: string;
  logicaUsada?: number;
  debeLiberarse: boolean;
}

export interface DatosSistema {
  encontrado: boolean;
  costoSistema: number;
}

export class ExpedienteValidationService {
  static validar(
    numeroExpediente: string,
    costoGuardado: number,
    datosSistema: DatosSistema,
    logicasActivas: LogicasValidacion
  ): ResultadoValidacion {
    if (!datosSistema.encontrado) {
      return {
        calificacion: CalificacionExpediente.NO_ENCONTRADO,
        motivo: 'Expediente no encontrado en el sistema',
        debeLiberarse: false,
      };
    }

    const costoGuardadoVO = CostoExpediente.create(costoGuardado);
    const costoSistemaVO = CostoExpediente.create(datosSistema.costoSistema);

    // Lógica 1: Costo exacto (siempre activa)
    if (logicasActivas.costoExacto && costoGuardadoVO.equals(costoSistemaVO)) {
      return {
        calificacion: CalificacionExpediente.APROBADO,
        motivo: 'Costo exacto coincide con el sistema',
        logicaUsada: 1,
        debeLiberarse: true,
      };
    }

    // Lógica 2: Margen 10%
    if (logicasActivas.margen10Porciento) {
      const variancia = costoGuardadoVO.calcularVariancia(costoSistemaVO);
      if (variancia <= 10) {
        return {
          calificacion: CalificacionExpediente.APROBADO,
          motivo: `Costo dentro del margen del 10% (diferencia: ${variancia.toFixed(1)}%)`,
          logicaUsada: 2,
          debeLiberarse: true,
        };
      }
    }

    // Lógica 3: Costo superior
    if (logicasActivas.costoSuperior && costoGuardadoVO.esMayorQue(costoSistemaVO)) {
      return {
        calificacion: CalificacionExpediente.APROBADO,
        motivo: 'Costo guardado es superior al del sistema',
        logicaUsada: 3,
        debeLiberarse: true,
      };
    }

    // No cumple ninguna lógica - PENDIENTE para revisión manual
    const diferencia = costoGuardadoVO.calcularVariancia(costoSistemaVO);
    return {
      calificacion: CalificacionExpediente.PENDIENTE,
      motivo: `Expediente encontrado pero costo requiere validación manual (diferencia: ${diferencia.toFixed(1)}%)`,
      debeLiberarse: false,
    };
  }

  static crearEstadoCalificacion(resultado: ResultadoValidacion): EstadoCalificacion {
    switch (resultado.calificacion) {
      case CalificacionExpediente.APROBADO:
        return EstadoCalificacion.aprobado(resultado.motivo);

      case CalificacionExpediente.PENDIENTE:
        return EstadoCalificacion.pendiente(resultado.motivo);

      case CalificacionExpediente.NO_APROBADO:
        return EstadoCalificacion.noAprobado('Validación fallida', resultado.motivo);

      case CalificacionExpediente.NO_ENCONTRADO:
        return EstadoCalificacion.noEncontrado(resultado.motivo);

      default:
        throw new Error(`Calificación no reconocida: ${resultado.calificacion}`);
    }
  }

  static evaluarCambioCalificacion(
    calificacionAnterior: CalificacionExpediente,
    calificacionNueva: CalificacionExpediente
  ): {
    hayCambio: boolean;
    esMejora: boolean;
    esRegresion: boolean;
    descripcion: string;
  } {
    if (calificacionAnterior === calificacionNueva) {
      return {
        hayCambio: false,
        esMejora: false,
        esRegresion: false,
        descripcion: 'Sin cambios en la calificación',
      };
    }

    const jerarquia = {
      [CalificacionExpediente.APROBADO]: 4,
      [CalificacionExpediente.PENDIENTE]: 3,
      [CalificacionExpediente.NO_APROBADO]: 2,
      [CalificacionExpediente.NO_ENCONTRADO]: 1,
    };

    const puntuacionAnterior = jerarquia[calificacionAnterior];
    const puntuacionNueva = jerarquia[calificacionNueva];

    if (!puntuacionAnterior || !puntuacionNueva) {
      throw new Error(`Calificación no reconocida: ${calificacionAnterior} → ${calificacionNueva}`);
    }

    const esMejora = puntuacionNueva > puntuacionAnterior;
    const esRegresion = puntuacionNueva < puntuacionAnterior;

    let descripcion = `${calificacionAnterior} → ${calificacionNueva}`;
    if (esMejora) {
      descripcion += ' (Mejora)';
    } else if (esRegresion) {
      descripcion += ' (Regresión)';
    }

    return {
      hayCambio: true,
      esMejora,
      esRegresion,
      descripcion,
    };
  }

  static puedeSerReevaluado(calificacion: CalificacionExpediente): boolean {
    return calificacion !== CalificacionExpediente.APROBADO;
  }

  static obtenerLogicasActivasPorDefecto(): LogicasValidacion {
    return {
      costoExacto: true,
      margen10Porciento: false,
      costoSuperior: false,
    };
  }
}
