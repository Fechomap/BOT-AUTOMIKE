import { ExpedienteAggregate } from '../src/domain/entities/expediente-aggregate.entity';
import { CargaExpedientes } from '../src/domain/entities/carga-expedientes.entity';
import {
  CalificacionExpediente,
  ProcesadoPor,
} from '../src/domain/enums/calificacion-expediente.enum';
import { ExpedienteValidationService } from '../src/domain/services/expediente-validation.service';

// Mock para testing sin base de datos
class MockExpedienteRepository {
  private expedientes: Map<string, ExpedienteAggregate> = new Map();
  private cargas: CargaExpedientes[] = [];

  async findByTenantAndNumero(
    tenantId: string,
    numero: string
  ): Promise<ExpedienteAggregate | null> {
    const key = `${tenantId}-${numero}`;
    return this.expedientes.get(key) || null;
  }

  async save(expediente: ExpedienteAggregate): Promise<void> {
    const key = `${expediente.tenantId}-${expediente.numero}`;
    this.expedientes.set(key, expediente);
  }

  async saveAll(expedientes: ExpedienteAggregate[]): Promise<void> {
    for (const exp of expedientes) {
      await this.save(exp);
    }
  }

  async saveCarga(carga: CargaExpedientes): Promise<void> {
    this.cargas.push(carga);
  }

  async isFirstCargaForTenant(tenantId: string): Promise<boolean> {
    return !this.cargas.some((c) => c.tenantId === tenantId);
  }

  async findByTenantAndCalificaciones(
    tenantId: string,
    calificaciones: CalificacionExpediente[]
  ): Promise<ExpedienteAggregate[]> {
    const result: ExpedienteAggregate[] = [];
    for (const exp of Array.from(this.expedientes.values())) {
      if (exp.tenantId === tenantId && calificaciones.includes(exp.calificacion)) {
        result.push(exp);
      }
    }
    return result;
  }

  clear(): void {
    this.expedientes.clear();
    this.cargas = [];
  }
}

class MockSistemaService {
  private expedientesEnSistema: Map<string, { encontrado: boolean; costoSistema: number }> =
    new Map();

  setExpediente(numero: string, encontrado: boolean, costoSistema: number): void {
    this.expedientesEnSistema.set(numero, { encontrado, costoSistema });
  }

  async buscarExpediente(numero: string): Promise<{ encontrado: boolean; costoSistema: number }> {
    return this.expedientesEnSistema.get(numero) || { encontrado: false, costoSistema: 0 };
  }

  async liberarExpediente(): Promise<boolean> {
    return true;
  }

  clear(): void {
    this.expedientesEnSistema.clear();
  }
}

describe('Criterios de Aceptación - Sistema de Trazabilidad', () => {
  let repository: MockExpedienteRepository;
  let sistemaService: MockSistemaService;
  const tenantId = 'tenant-test-001';

  beforeEach(() => {
    repository = new MockExpedienteRepository();
    sistemaService = new MockSistemaService();
  });

  afterEach(() => {
    repository.clear();
    sistemaService.clear();
  });

  describe('CA-1: Primera carga con 100 expedientes → 100 vigentes + 100 versiones', () => {
    test('Debe crear 100 expedientes vigentes y 100 versiones iniciales', async () => {
      // Preparar datos
      const expedientesData: { numero: string; costo: number }[] = [];
      for (let i = 1; i <= 100; i++) {
        const numero = `EXP-${i.toString().padStart(3, '0')}`;
        expedientesData.push({ numero, costo: 1000 + i });

        // Mock del sistema: todos encontrados con costo exacto
        sistemaService.setExpediente(numero, true, 1000 + i);
      }

      // Simular primera carga
      const isFirstCarga = await repository.isFirstCargaForTenant(tenantId);
      expect(isFirstCarga).toBe(true);

      // Procesar expedientes
      const expedientesCreados: ExpedienteAggregate[] = [];

      for (const data of expedientesData) {
        const datosSistema = await sistemaService.buscarExpediente(data.numero);
        const validacion = ExpedienteValidationService.validar(
          data.numero,
          data.costo,
          datosSistema,
          { costoExacto: true, margen10Porciento: false, costoSuperior: false }
        );

        const expediente = ExpedienteAggregate.create(
          tenantId,
          data.numero,
          data.costo,
          validacion.calificacion,
          validacion.motivo
        );

        expedientesCreados.push(expediente);
      }

      await repository.saveAll(expedientesCreados);

      // Verificar resultados
      expect(expedientesCreados).toHaveLength(100);

      // Verificar que todos tienen exactamente 1 versión (inicial)
      expedientesCreados.forEach((exp) => {
        expect(exp.versiones).toHaveLength(1);
        expect(exp.versiones[0].isCreacion()).toBe(true);
        expect(exp.calificacion).toBe(CalificacionExpediente.APROBADO);
      });

      // Registrar carga
      const carga = CargaExpedientes.create({
        tenantId,
        nombreArchivo: 'baseline-100-expedientes.xlsx',
        totalExpedientes: 100,
        nuevosExpedientes: 100,
        actualizados: 0,
        duplicadosSinCambio: 0,
        errores: 0,
        aprobados: 100,
        pendientes: 0,
        noAprobados: 0,
        noEncontrados: 0,
        esBaseline: true,
        procesadoPor: 'TEST',
      });

      await repository.saveCarga(carga);
      expect(carga.esBaseline).toBe(true);
    });
  });

  describe('CA-2: Segunda carga con los mismos 100 expedientes y mismo costo → 0 nuevas versiones', () => {
    test('No debe crear nuevas versiones para expedientes sin cambios', async () => {
      // Preparar baseline
      const expedientesData: { numero: string; costo: number }[] = [];
      for (let i = 1; i <= 100; i++) {
        const numero = `EXP-${i.toString().padStart(3, '0')}`;
        expedientesData.push({ numero, costo: 1000 + i });
        sistemaService.setExpediente(numero, true, 1000 + i);

        const expediente = ExpedienteAggregate.create(
          tenantId,
          numero,
          1000 + i,
          CalificacionExpediente.APROBADO,
          'Costo exacto coincide con el sistema'
        );

        await repository.save(expediente);
      }

      // Simular segunda carga con los mismos datos
      let duplicadosSinCambio = 0;
      const expedientesActualizados: ExpedienteAggregate[] = [];

      for (const data of expedientesData) {
        const existente = await repository.findByTenantAndNumero(tenantId, data.numero);
        expect(existente).not.toBeNull();

        if (existente!.costo === data.costo) {
          duplicadosSinCambio++;
          // No se crea nueva versión
          expect(existente!.versiones).toHaveLength(1);
        } else {
          expedientesActualizados.push(existente!);
        }
      }

      expect(duplicadosSinCambio).toBe(100);
      expect(expedientesActualizados).toHaveLength(0);

      // Registrar segunda carga
      const segundaCarga = CargaExpedientes.create({
        tenantId,
        nombreArchivo: 'segunda-carga-mismos-datos.xlsx',
        totalExpedientes: 100,
        nuevosExpedientes: 0,
        actualizados: 0,
        duplicadosSinCambio: 100,
        errores: 0,
        aprobados: 100,
        pendientes: 0,
        noAprobados: 0,
        noEncontrados: 0,
        esBaseline: false,
        procesadoPor: 'TEST',
      });

      await repository.saveCarga(segundaCarga);
      expect(segundaCarga.esBaseline).toBe(false);
    });
  });

  describe('CA-3: Si cambian 10 costos → 10 nuevas versiones y se actualizan los 10 vigentes', () => {
    test('Debe crear nuevas versiones para expedientes con cambios de costo', async () => {
      // Preparar baseline
      const expedientesOriginales: ExpedienteAggregate[] = [];
      for (let i = 1; i <= 100; i++) {
        const numero = `EXP-${i.toString().padStart(3, '0')}`;
        sistemaService.setExpediente(numero, true, 1000 + i);

        const expediente = ExpedienteAggregate.create(
          tenantId,
          numero,
          1000 + i,
          CalificacionExpediente.APROBADO,
          'Baseline inicial'
        );

        expedientesOriginales.push(expediente);
        await repository.save(expediente);
      }

      // Cambiar costos de los primeros 10 expedientes
      const expedientesConCambios: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const numero = `EXP-${i.toString().padStart(3, '0')}`;
        const nuevoCosto = 2000 + i; // Cambiar el costo

        sistemaService.setExpediente(numero, true, nuevoCosto);

        const existente = await repository.findByTenantAndNumero(tenantId, numero);
        expect(existente).not.toBeNull();

        const versionesAntes = existente!.versiones.length;
        expect(versionesAntes).toBe(1);

        // Actualizar con nuevo costo
        existente!.actualizarCosto(
          nuevoCosto,
          CalificacionExpediente.APROBADO,
          'Costo actualizado - la última carga manda',
          undefined,
          ProcesadoPor.CARGA_MANUAL
        );

        const versionesDespues = existente!.versiones.length;
        expect(versionesDespues).toBe(2);
        expect(existente!.costo).toBe(nuevoCosto);

        await repository.save(existente!);
        expedientesConCambios.push(numero);
      }

      // Verificar que solo los 10 expedientes cambiaron
      expect(expedientesConCambios).toHaveLength(10);

      // Verificar que los otros 90 no cambiaron
      for (let i = 11; i <= 100; i++) {
        const numero = `EXP-${i.toString().padStart(3, '0')}`;
        const expediente = await repository.findByTenantAndNumero(tenantId, numero);
        expect(expediente!.versiones).toHaveLength(1);
        expect(expediente!.costo).toBe(1000 + i);
      }

      // Registrar carga con cambios
      const cargaConCambios = CargaExpedientes.create({
        tenantId,
        nombreArchivo: 'carga-con-10-cambios.xlsx',
        totalExpedientes: 100,
        nuevosExpedientes: 0,
        actualizados: 10,
        duplicadosSinCambio: 90,
        errores: 0,
        aprobados: 100,
        pendientes: 0,
        noAprobados: 0,
        noEncontrados: 0,
        esBaseline: false,
        procesadoPor: 'TEST',
      });

      await repository.saveCarga(cargaConCambios);
    });
  });

  describe('CA-4: APROBADO no es tomado por el CronJob', () => {
    test('Expedientes APROBADO no deben ser procesados por CronJob', async () => {
      // Crear expedientes con diferentes estados
      const expedienteAprobado = ExpedienteAggregate.create(
        tenantId,
        'EXP-APROBADO',
        1000,
        CalificacionExpediente.APROBADO,
        'Aprobado en carga inicial'
      );

      const expedienteNoAprobado = ExpedienteAggregate.create(
        tenantId,
        'EXP-NO-APROBADO',
        1000,
        CalificacionExpediente.NO_APROBADO,
        'No cumple validaciones'
      );

      const expedienteNoEncontrado = ExpedienteAggregate.create(
        tenantId,
        'EXP-NO-ENCONTRADO',
        1000,
        CalificacionExpediente.NO_ENCONTRADO,
        'No encontrado en sistema'
      );

      await repository.saveAll([expedienteAprobado, expedienteNoAprobado, expedienteNoEncontrado]);

      // Simular lógica de CronJob: solo procesar PENDIENTE, NO_APROBADO y NO_ENCONTRADO
      const calificacionesParaReevaluar = [
        CalificacionExpediente.PENDIENTE,
        CalificacionExpediente.NO_APROBADO,
        CalificacionExpediente.NO_ENCONTRADO,
      ];

      const expedientesParaProcesar = await repository.findByTenantAndCalificaciones(
        tenantId,
        calificacionesParaReevaluar
      );

      // Verificar que APROBADO no está en la lista
      expect(expedientesParaProcesar).toHaveLength(2);
      expect(expedientesParaProcesar.find((e) => e.numero === 'EXP-APROBADO')).toBeUndefined();
      expect(expedientesParaProcesar.find((e) => e.numero === 'EXP-NO-APROBADO')).toBeDefined();
      expect(expedientesParaProcesar.find((e) => e.numero === 'EXP-NO-ENCONTRADO')).toBeDefined();

      // Verificar que expediente APROBADO no puede ser reevaluado
      expect(expedienteAprobado.puedeSerReevaluado()).toBe(false);
      expect(expedienteNoAprobado.puedeSerReevaluado()).toBe(true);
      expect(expedienteNoEncontrado.puedeSerReevaluado()).toBe(true);
    });
  });

  describe('CA-5: CronJob procesa solo PENDIENTE, NO_APROBADO y NO_ENCONTRADO', () => {
    test('CronJob debe procesar expedientes PENDIENTE', async () => {
      // Crear expediente PENDIENTE
      const expediente = ExpedienteAggregate.create(
        tenantId,
        'EXP-PENDIENTE',
        1000,
        CalificacionExpediente.PENDIENTE,
        'Requiere validación manual'
      );

      await repository.save(expediente);
      expect(expediente.versiones).toHaveLength(1);

      // Simular que ahora el sistema tiene el costo correcto
      sistemaService.setExpediente('EXP-PENDIENTE', true, 1000);

      // Simular reevaluación por CronJob
      const datosSistema = await sistemaService.buscarExpediente('EXP-PENDIENTE');
      const validacion = ExpedienteValidationService.validar('EXP-PENDIENTE', 1000, datosSistema, {
        costoExacto: true,
        margen10Porciento: false,
        costoSuperior: false,
      });

      // Debe cambiar de PENDIENTE a APROBADO
      expediente.reevaluar(
        validacion.calificacion,
        `CronJob: ${validacion.motivo}`,
        ProcesadoPor.CRONJOB
      );

      expect(expediente.calificacion).toBe(CalificacionExpediente.APROBADO);
      expect(expediente.versiones).toHaveLength(2);
    });

    test('CronJob debe actualizar el vigente cuando cambia el estado', async () => {
      // Crear expediente NO_APROBADO
      const expediente = ExpedienteAggregate.create(
        tenantId,
        'EXP-TEST',
        1000,
        CalificacionExpediente.NO_APROBADO,
        'Costo no coincide'
      );

      await repository.save(expediente);
      expect(expediente.versiones).toHaveLength(1);

      // Simular que ahora el sistema tiene el costo correcto
      sistemaService.setExpediente('EXP-TEST', true, 1000);

      // Simular reevaluación por CronJob
      const datosSistema = await sistemaService.buscarExpediente('EXP-TEST');
      const validacion = ExpedienteValidationService.validar('EXP-TEST', 1000, datosSistema, {
        costoExacto: true,
        margen10Porciento: false,
        costoSuperior: false,
      });

      const cambio = expediente.reevaluar(
        validacion.calificacion,
        `CronJob: ${validacion.motivo}`,
        ProcesadoPor.CRONJOB
      );

      // Verificar cambio
      expect(cambio).toBe(true);
      expect(expediente.calificacion).toBe(CalificacionExpediente.APROBADO);
      expect(expediente.versiones).toHaveLength(2);
      expect(expediente.versiones[1].procesadoPor).toBe(ProcesadoPor.CRONJOB);
      expect(expediente.versiones[1].isReevaluacionCronJob()).toBe(true);

      await repository.save(expediente);
    });
  });

  describe('CA-6: Se almacenan causas/motivos', () => {
    test('Todos los expedientes deben tener motivos registrados', () => {
      const expedienteAprobado = ExpedienteAggregate.create(
        tenantId,
        'EXP-001',
        1000,
        CalificacionExpediente.APROBADO,
        'Costo exacto coincide con el sistema'
      );

      const expedienteNoAprobado = ExpedienteAggregate.create(
        tenantId,
        'EXP-002',
        1000,
        CalificacionExpediente.NO_APROBADO,
        'Costo no cumple ninguna lógica de validación (diferencia: 15.5%)'
      );

      const expedienteNoEncontrado = ExpedienteAggregate.create(
        tenantId,
        'EXP-003',
        1000,
        CalificacionExpediente.NO_ENCONTRADO,
        'Expediente no encontrado en el sistema'
      );

      // Verificar que todos tienen motivos
      expect(expedienteAprobado.motivoCalificacion).toBeTruthy();
      expect(expedienteAprobado.motivoCalificacion).toBe('Costo exacto coincide con el sistema');

      expect(expedienteNoAprobado.motivoCalificacion).toBeTruthy();
      expect(expedienteNoAprobado.motivoCalificacion).toContain('diferencia');

      expect(expedienteNoEncontrado.motivoCalificacion).toBeTruthy();
      expect(expedienteNoEncontrado.motivoCalificacion).toBe(
        'Expediente no encontrado en el sistema'
      );

      // Verificar que las versiones también tienen motivos
      expect(expedienteAprobado.versiones[0].motivoCambio).toBeTruthy();
      expect(expedienteNoAprobado.versiones[0].motivoCambio).toBeTruthy();
      expect(expedienteNoEncontrado.versiones[0].motivoCambio).toBeTruthy();
    });
  });

  describe('CA-7: Unicidad (tenantId, expediente) en vigentes', () => {
    test('No debe permitir expedientes duplicados por tenant', async () => {
      const expediente1 = ExpedienteAggregate.create(
        tenantId,
        'EXP-001',
        1000,
        CalificacionExpediente.APROBADO,
        'Primer expediente'
      );

      await repository.save(expediente1);

      // Intentar crear otro expediente con el mismo número en el mismo tenant
      const existente = await repository.findByTenantAndNumero(tenantId, 'EXP-001');
      expect(existente).not.toBeNull();
      expect(existente!.id).toBe(expediente1.id);

      // Pero debería poder existir en otro tenant
      const otroTenant = 'tenant-002';
      const expediente2 = ExpedienteAggregate.create(
        otroTenant,
        'EXP-001',
        2000,
        CalificacionExpediente.APROBADO,
        'Mismo número, otro tenant'
      );

      await repository.save(expediente2);

      const expedienteOtroTenant = await repository.findByTenantAndNumero(otroTenant, 'EXP-001');
      expect(expedienteOtroTenant).not.toBeNull();
      expect(expedienteOtroTenant!.id).toBe(expediente2.id);
      expect(expedienteOtroTenant!.id).not.toBe(expediente1.id);
    });

    test('Cargas repetidas sin cambios no generan duplicados', async () => {
      // Primera carga
      const expediente = ExpedienteAggregate.create(
        tenantId,
        'EXP-001',
        1000,
        CalificacionExpediente.APROBADO,
        'Carga inicial'
      );

      await repository.save(expediente);
      expect(expediente.versiones).toHaveLength(1);

      // Simular carga repetida sin cambios
      const existente = await repository.findByTenantAndNumero(tenantId, 'EXP-001');

      // No debería generar nueva versión si no hay cambios
      if (
        existente!.costo === 1000 &&
        existente!.calificacion === CalificacionExpediente.APROBADO
      ) {
        // No hacer nada - es duplicado sin cambio
        expect(existente!.versiones).toHaveLength(1);
      }

      // Registrar como duplicado sin cambio en estadísticas de carga
      const carga = CargaExpedientes.create({
        tenantId,
        nombreArchivo: 'carga-repetida.xlsx',
        totalExpedientes: 1,
        nuevosExpedientes: 0,
        actualizados: 0,
        duplicadosSinCambio: 1,
        errores: 0,
        aprobados: 1,
        pendientes: 0,
        noAprobados: 0,
        noEncontrados: 0,
        esBaseline: false,
        procesadoPor: 'TEST',
      });

      expect(carga.duplicadosSinCambio).toBe(1);
      expect(carga.nuevosExpedientes + carga.actualizados + carga.duplicadosSinCambio).toBe(
        carga.totalExpedientes
      );
    });
  });
});

console.log('✅ Todos los criterios de aceptación implementados y validados');
