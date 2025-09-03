import { ExpedienteAggregate } from '../../domain/entities/expediente-aggregate.entity';
import { CargaExpedientes } from '../../domain/entities/carga-expedientes.entity';
import {
  CalificacionExpediente,
  ProcesadoPor,
} from '../../domain/enums/calificacion-expediente.enum';
import { NumeroExpediente } from '../../domain/value-objects/numero-expediente.vo';
import { CostoExpediente } from '../../domain/value-objects/costo-expediente.vo';
import {
  ExpedienteValidationService,
  LogicasValidacion,
} from '../../domain/services/expediente-validation.service';
import { SistemaExpedientesService } from '../../domain/interfaces/sistema-expedientes.interface';
import { ExpedienteRepository } from '../../infrastructure/repositories/expediente.repository';
import { ExcelRepository } from './process-excel.use-case';

export interface CargaExpedientesDTO {
  tenantId: string;
  expedientes: ExpedienteExcelData[];
  nombreArchivo: string;
  logicasActivas?: LogicasValidacion;
  procesadoPor: string;
  progressCallback?: (current: number, total: number, currentItem: string) => Promise<void>;
}

export interface ExpedienteExcelData {
  expediente: string;
  costo: number | string;
}

export interface ResultadoCargaDTO {
  cargaId: string;
  totalExpedientes: number;
  nuevosExpedientes: number;
  actualizados: number;
  duplicadosSinCambio: number;
  errores: number;
  aprobados: number;
  pendientes: number;
  noAprobados: number;
  noEncontrados: number;
  esBaseline: boolean;
  tasaAprobacion: number;
  tasaExito: number;
  expedientesConError: string[];
  resumenTexto: string;
  excelPath?: string;
}

export class CargaExpedientesUseCase {
  constructor(
    private readonly expedienteRepository: ExpedienteRepository,
    private readonly sistemaService: SistemaExpedientesService,
    private readonly excelRepository?: ExcelRepository
  ) {}

  async execute(dto: CargaExpedientesDTO): Promise<ResultadoCargaDTO> {
    // Configurar credenciales IKE para el tenant
    if (this.sistemaService.configurarCredenciales) {
      try {
        await this.sistemaService.configurarCredenciales(dto.tenantId);
        console.log(
          `✅ Credenciales IKE configuradas para tenant ${dto.tenantId.substring(0, 8)}...`
        );
      } catch (error) {
        console.error(`❌ Error configurando credenciales IKE:`, error);
        throw new Error(`No se pudieron configurar las credenciales IKE para el tenant`);
      }
    }

    const logicasActivas =
      dto.logicasActivas || ExpedienteValidationService.obtenerLogicasActivasPorDefecto();
    const esBaseline = await this.expedienteRepository.isFirstCargaForTenant(dto.tenantId);

    console.log(
      `🔄 Iniciando carga de ${dto.expedientes.length} expedientes para tenant ${dto.tenantId}`
    );
    console.log(`📊 Es baseline: ${esBaseline ? 'Sí' : 'No'}`);
    console.log(`🔧 Lógicas activas:`, logicasActivas);

    const resultados = {
      nuevos: 0,
      actualizados: 0,
      duplicados: 0,
      errores: 0,
      aprobados: 0,
      pendientes: 0,
      noAprobados: 0,
      noEncontrados: 0,
      expedientesConError: [] as string[],
    };

    const expedientesParaGuardar: ExpedienteAggregate[] = [];
    const expedientesConDatosSistema: Array<{
      expediente: ExpedienteAggregate;
      costoSistema: number;
    }> = [];
    const expedientesNormalizados = this.normalizarExpedientes(dto.expedientes);

    for (let i = 0; i < expedientesNormalizados.length; i++) {
      const { expediente: numero, costo: costoRaw } = expedientesNormalizados[i];
      const costo = typeof costoRaw === 'string' ? parseFloat(costoRaw) : costoRaw;

      if (dto.progressCallback) {
        try {
          await dto.progressCallback(i, expedientesNormalizados.length, numero);
        } catch (error) {
          console.error('Error en callback de progreso:', error);
        }
      }

      try {
        const resultado = await this.procesarExpediente(
          dto.tenantId,
          numero,
          costo,
          logicasActivas,
          dto.procesadoPor
        );

        switch (resultado.tipoOperacion) {
          case 'nuevo':
            resultados.nuevos++;
            console.log(`✨ Expediente nuevo: ${numero} - ${resultado.expediente.calificacion}`);
            break;
          case 'actualizado':
            resultados.actualizados++;
            console.log(
              `🔄 Expediente actualizado: ${numero} - ${resultado.expediente.calificacion}`
            );
            break;
          case 'duplicado':
            resultados.duplicados++;
            console.log(
              `🔁 Expediente duplicado: ${numero} - ${resultado.expediente.calificacion} (ya existe igual)`
            );
            // Los duplicados también deben contar para estadísticas de calificación
            break;
        }

        switch (resultado.expediente.calificacion) {
          case CalificacionExpediente.APROBADO:
            resultados.aprobados++;
            if (resultado.debeLiberarse) {
              await this.intentarLiberacion(numero, costo, resultado.expediente);
            }
            break;
          case CalificacionExpediente.PENDIENTE:
            resultados.pendientes++;
            break;
          case CalificacionExpediente.NO_APROBADO:
            resultados.noAprobados++;
            break;
          case CalificacionExpediente.NO_ENCONTRADO:
            resultados.noEncontrados++;
            break;
        }

        expedientesParaGuardar.push(resultado.expediente);
        expedientesConDatosSistema.push({
          expediente: resultado.expediente,
          costoSistema: resultado.costoSistema,
        });
      } catch (error) {
        console.error(`❌ Error procesando expediente ${numero}:`, error);
        resultados.errores++;
        resultados.expedientesConError.push(numero);
      }
    }

    if (dto.progressCallback) {
      await dto.progressCallback(
        expedientesNormalizados.length,
        expedientesNormalizados.length,
        'Guardando en base de datos...'
      );
    }

    await this.expedienteRepository.saveAll(expedientesParaGuardar);

    const carga = CargaExpedientes.create({
      tenantId: dto.tenantId,
      nombreArchivo: dto.nombreArchivo,
      totalExpedientes: dto.expedientes.length,
      nuevosExpedientes: resultados.nuevos,
      actualizados: resultados.actualizados,
      duplicadosSinCambio: resultados.duplicados,
      errores: resultados.errores,
      aprobados: resultados.aprobados,
      pendientes: resultados.pendientes,
      noAprobados: resultados.noAprobados,
      noEncontrados: resultados.noEncontrados,
      esBaseline,
      procesadoPor: dto.procesadoPor,
    });

    await this.expedienteRepository.saveCarga(carga);

    const stats = carga.getEstadisticas();

    console.log(`✅ Carga completada: ${carga.getResumenTexto()}`);

    // Generar Excel de resultados si el repositorio está disponible
    let excelPath: string | undefined;
    if (this.excelRepository) {
      try {
        console.log('📊 Generando Excel de resultados...');
        const excelData = expedientesConDatosSistema.map((item) => ({
          Expediente: item.expediente.numero,
          'Costo Excel': item.expediente.costo,
          'Costo Sistema': item.costoSistema,
          Estado: item.expediente.calificacion,
          Motivo: item.expediente.motivoCalificacion,
        }));

        const fileName = `resultados_${dto.tenantId.substring(0, 8)}_${Date.now()}.xlsx`;
        excelPath = await this.excelRepository.writeResults(excelData, fileName);
        console.log(`📁 Excel generado: ${excelPath}`);
      } catch (error) {
        console.error('⚠️ Error generando Excel (proceso continúa):', error);
      }
    }

    return {
      cargaId: carga.id,
      totalExpedientes: stats.total,
      nuevosExpedientes: stats.nuevos,
      actualizados: stats.actualizados,
      duplicadosSinCambio: stats.duplicados,
      errores: stats.errores,
      aprobados: stats.aprobados,
      pendientes: stats.pendientes,
      noAprobados: stats.noAprobados,
      noEncontrados: stats.noEncontrados,
      esBaseline,
      tasaAprobacion: stats.tasaAprobacion,
      tasaExito: stats.tasaExito,
      expedientesConError: resultados.expedientesConError,
      resumenTexto: carga.getResumenTexto(),
      excelPath,
    };
  }

  private normalizarExpedientes(expedientes: ExpedienteExcelData[]): ExpedienteExcelData[] {
    const expedientesUnicos = new Map<string, ExpedienteExcelData>();

    for (const exp of expedientes) {
      try {
        const numeroNormalizado = NumeroExpediente.create(exp.expediente);
        const costoNormalizado = CostoExpediente.create(exp.costo);

        const key = numeroNormalizado.valor;
        const existing = expedientesUnicos.get(key);

        if (!existing) {
          expedientesUnicos.set(key, {
            expediente: numeroNormalizado.valor,
            costo: costoNormalizado.valor,
          });
        } else {
          console.log(
            `⚠️ Expediente duplicado ${key}: manteniendo último costo ${costoNormalizado.valor}`
          );
          expedientesUnicos.set(key, {
            expediente: numeroNormalizado.valor,
            costo: costoNormalizado.valor,
          });
        }
      } catch (error) {
        console.error(`❌ Error normalizando expediente ${exp.expediente}:`, error);
        throw error;
      }
    }

    return Array.from(expedientesUnicos.values());
  }

  private async procesarExpediente(
    tenantId: string,
    numero: string,
    costo: number,
    logicasActivas: LogicasValidacion,
    _procesadoPor: string
  ): Promise<{
    expediente: ExpedienteAggregate;
    tipoOperacion: 'nuevo' | 'actualizado' | 'duplicado';
    debeLiberarse: boolean;
    costoSistema: number;
  }> {
    console.log(`🔍 Procesando expediente: ${numero}, costo: ${costo}`);

    const existente = await this.expedienteRepository.findByTenantAndNumero(tenantId, numero);

    const datosSistema = await this.sistemaService.buscarExpediente(numero, costo);
    const validacion = ExpedienteValidationService.validar(
      numero,
      costo,
      datosSistema,
      logicasActivas
    );

    if (existente) {
      if (existente.costo === costo && existente.calificacion === validacion.calificacion) {
        return {
          expediente: existente,
          tipoOperacion: 'duplicado',
          debeLiberarse: false,
          costoSistema: datosSistema.costoSistema,
        };
      }

      existente.actualizarCosto(
        costo,
        validacion.calificacion,
        validacion.motivo,
        undefined,
        ProcesadoPor.CARGA_MANUAL
      );

      console.log(`🔄 Expediente actualizado: ${numero} - ${validacion.calificacion}`);

      return {
        expediente: existente,
        tipoOperacion: 'actualizado',
        debeLiberarse: validacion.debeLiberarse,
        costoSistema: datosSistema.costoSistema,
      };
    } else {
      const nuevoExpediente = ExpedienteAggregate.create(
        tenantId,
        numero,
        costo,
        validacion.calificacion,
        validacion.motivo,
        undefined,
        ProcesadoPor.CARGA_MANUAL
      );

      console.log(`✨ Expediente nuevo: ${numero} - ${validacion.calificacion}`);

      return {
        expediente: nuevoExpediente,
        tipoOperacion: 'nuevo',
        debeLiberarse: validacion.debeLiberarse,
        costoSistema: datosSistema.costoSistema,
      };
    }
  }

  private async intentarLiberacion(
    numero: string,
    costo: number,
    _expediente: ExpedienteAggregate
  ): Promise<void> {
    try {
      console.log(`💰 Intentando liberar expediente ${numero}...`);

      const liberado = await this.sistemaService.liberarExpediente(numero, costo);

      if (liberado) {
        console.log(`✅ Expediente ${numero} liberado exitosamente en el portal`);
      } else {
        console.log(`⚠️ Expediente ${numero} no pudo ser liberado automáticamente`);
      }
    } catch (error) {
      console.error(`❌ Error liberando expediente ${numero}:`, error);
    }
  }
}
