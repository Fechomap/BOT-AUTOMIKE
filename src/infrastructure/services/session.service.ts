import { PrismaClient } from '@prisma/client';

export interface UserSession {
  id: string;
  tenantId: string;
  filePath?: string;
  fileName?: string;
  expedientesCount?: number;
  logicasActivas: {
    costoExacto: boolean;
    margen10Porciento: boolean;
    costoSuperior: boolean;
  };
  stage:
    | 'idle'
    | 'registering'
    | 'configuring_logics'
    | 'ready_to_process'
    | 'registration_company'
    | 'registration_username'
    | 'registration_password';
  // Datos temporales del registro
  registrationData?: {
    companyName?: string;
    username?: string;
    password?: string;
  };
}

export class SessionService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Obtener o crear sesión temporal por Telegram ID (para registro)
   */
  async getOrCreateTemporarySession(telegramId: bigint): Promise<UserSession> {
    // Crear una sesión temporal con ID basado en telegramId
    const tempTenantId = `temp_${telegramId.toString()}`;

    let session = await this.prisma.session.findFirst({
      where: { tenantId: tempTenantId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!session) {
      console.log(`📝 Creando sesión temporal para registro: ${telegramId}`);
      session = await this.prisma.session.create({
        data: {
          tenantId: tempTenantId,
          logicasActivas: {
            costoExacto: true,
            margen10Porciento: false,
            costoSuperior: false,
          },
          stage: 'idle',
        },
      });
    }

    return {
      id: session.id,
      tenantId: session.tenantId,
      filePath: session.filePath || undefined,
      fileName: session.fileName || undefined,
      expedientesCount: session.expedientesCount || undefined,
      logicasActivas: session.logicasActivas as any,
      stage: session.stage as any,
      registrationData: {},
    };
  }

  /**
   * Obtener o crear sesión para un tenant
   */
  async getOrCreateSession(tenantId: string): Promise<UserSession> {
    let session = await this.prisma.session.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!session) {
      console.log(`📝 Creando nueva sesión para tenant: ${tenantId}`);
      session = await this.prisma.session.create({
        data: {
          tenantId,
          logicasActivas: {
            costoExacto: true,
            margen10Porciento: false,
            costoSuperior: false,
          },
          stage: 'idle',
        },
      });
    }

    return {
      id: session.id,
      tenantId: session.tenantId,
      filePath: session.filePath || undefined,
      fileName: session.fileName || undefined,
      expedientesCount: session.expedientesCount || undefined,
      logicasActivas: session.logicasActivas as any,
      stage: session.stage as any,
    };
  }

  /**
   * Actualizar sesión temporal por Telegram ID
   */
  async updateTemporarySession(
    telegramId: bigint,
    updates: Partial<Omit<UserSession, 'id' | 'tenantId'>>
  ): Promise<UserSession> {
    const tempTenantId = `temp_${telegramId.toString()}`;

    const updateData: any = {};
    if (updates.filePath !== undefined) updateData.filePath = updates.filePath;
    if (updates.fileName !== undefined) updateData.fileName = updates.fileName;
    if (updates.expedientesCount !== undefined)
      updateData.expedientesCount = updates.expedientesCount;
    if (updates.logicasActivas) updateData.logicasActivas = updates.logicasActivas;
    if (updates.stage) updateData.stage = updates.stage;

    await this.prisma.session.updateMany({
      where: { tenantId: tempTenantId },
      data: updateData,
    });

    // Obtener la sesión actualizada
    const updatedSession = await this.prisma.session.findFirst({
      where: { tenantId: tempTenantId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!updatedSession) throw new Error('Sesión no encontrada');

    return {
      id: updatedSession.id,
      tenantId: updatedSession.tenantId,
      filePath: updatedSession.filePath || undefined,
      fileName: updatedSession.fileName || undefined,
      expedientesCount: updatedSession.expedientesCount || undefined,
      logicasActivas: updatedSession.logicasActivas as any,
      stage: updatedSession.stage as any,
      registrationData: updates.registrationData || {},
    };
  }

  /**
   * Actualizar sesión
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Omit<UserSession, 'id' | 'tenantId'>>
  ): Promise<UserSession> {
    const updateData: any = {};

    if (updates.filePath !== undefined) updateData.filePath = updates.filePath;
    if (updates.fileName !== undefined) updateData.fileName = updates.fileName;
    if (updates.expedientesCount !== undefined)
      updateData.expedientesCount = updates.expedientesCount;
    if (updates.logicasActivas) updateData.logicasActivas = updates.logicasActivas;
    if (updates.stage) updateData.stage = updates.stage;

    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: updateData,
    });

    return {
      id: session.id,
      tenantId: session.tenantId,
      filePath: session.filePath || undefined,
      fileName: session.fileName || undefined,
      expedientesCount: session.expedientesCount || undefined,
      logicasActivas: session.logicasActivas as any,
      stage: session.stage as any,
    };
  }

  /**
   * Limpiar sesión (resetear a estado inicial)
   */
  async cleanupSession(sessionId: string): Promise<UserSession> {
    console.log(`🧹 Limpiando sesión: ${sessionId}`);

    return await this.updateSession(sessionId, {
      filePath: undefined,
      fileName: undefined,
      expedientesCount: undefined,
      stage: 'idle',
      logicasActivas: {
        costoExacto: true,
        margen10Porciento: false,
        costoSuperior: false,
      },
    });
  }

  /**
   * Eliminar sesiones antiguas (más de 24 horas)
   */
  async cleanupOldSessions(): Promise<number> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const result = await this.prisma.session.deleteMany({
      where: {
        updatedAt: {
          lt: oneDayAgo,
        },
        stage: 'idle',
      },
    });

    if (result.count > 0) {
      console.log(`🗑️ Eliminadas ${result.count} sesiones antiguas`);
    }

    return result.count;
  }

  /**
   * Obtener sesión por ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    return {
      id: session.id,
      tenantId: session.tenantId,
      filePath: session.filePath || undefined,
      fileName: session.fileName || undefined,
      expedientesCount: session.expedientesCount || undefined,
      logicasActivas: session.logicasActivas as any,
      stage: session.stage as any,
    };
  }

  /**
   * Cerrar conexión de Prisma
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
