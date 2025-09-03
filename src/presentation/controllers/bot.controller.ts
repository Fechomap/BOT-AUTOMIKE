import { Telegraf, Context } from 'telegraf';
import * as fs from 'fs';
import { ProcessExcelUseCase } from '../../application/use-cases/process-excel.use-case';
import { CargaExpedientesUseCase } from '../../application/use-cases/carga-expedientes.use-case';
import { RevalidacionCronJobUseCase } from '../../application/use-cases/revalidacion-cronjob.use-case';
import { TenantService } from '../../infrastructure/services/tenant.service';
import { SessionService, UserSession } from '../../infrastructure/services/session.service';
import { ProgressBarUtil } from '../../infrastructure/utils/progress-bar.util';
import { ExpedienteRepository } from '../../infrastructure/repositories/expediente.repository';
import { CalificacionExpediente } from '../../domain/enums/calificacion-expediente.enum';

interface RegistrationState {
  stage: 'company' | 'username' | 'password';
  data: {
    companyName?: string;
    username?: string;
  };
}

export class BotController {
  private tenantService: TenantService;
  private sessionService: SessionService;
  private registrationStates: Map<string, RegistrationState> = new Map();

  constructor(
    private readonly bot: Telegraf,
    private readonly processExcelUseCase: ProcessExcelUseCase,
    private readonly cargaExpedientesUseCase?: CargaExpedientesUseCase,
    private readonly revalidacionUseCase?: RevalidacionCronJobUseCase,
    private readonly expedienteRepository?: ExpedienteRepository
  ) {
    this.tenantService = new TenantService();
    this.sessionService = new SessionService();
    this.setupHandlers();
    this.setupCleanupTasks();
  }

  private setupHandlers() {
    // Comando start
    this.bot.start(this.handleStart.bind(this));

    // Comando registrar
    this.bot.command('registrar', this.handleRegisterCommand.bind(this));

    // Procesar documentos Excel
    this.bot.on('document', this.handleDocument.bind(this));

    // Manejo de botones inline (callbacks)
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));

    // Manejo de mensajes de texto (para flujo interactivo)
    this.bot.on('text', this.handleTextMessage.bind(this));

    // Comandos adicionales
    this.bot.command('credenciales', this.handleCredentialsCommand.bind(this));
    this.bot.command('estado', this.handleStatusCommand.bind(this));

    // Comandos de trazabilidad
    this.bot.command('resumen', this.handleResumenCommand.bind(this));
    this.bot.command('expediente', this.handleExpedienteCommand.bind(this));
    this.bot.command('historial', this.handleHistorialCommand.bind(this));
    this.bot.command('pendientes', this.handlePendientesCommand.bind(this));
    this.bot.command('revalidar', this.handleRevalidarCommand.bind(this));
    this.bot.command('cargas', this.handleCargasCommand.bind(this));

    this.bot.help(this.handleHelp.bind(this));

    // Error handler
    this.bot.catch(this.handleError.bind(this));
  }

  private setupCleanupTasks() {
    // Limpiar sesiones antiguas cada hora
    setInterval(
      async () => {
        try {
          await this.sessionService.cleanupOldSessions();
        } catch (error) {
          console.error('Error limpiando sesiones:', error);
        }
      },
      60 * 60 * 1000
    ); // 1 hora
  }

  private async handleStart(ctx: Context) {
    if (!ctx.from) return;

    const tenantExists = await this.tenantService.tenantExists(BigInt(ctx.from.id));

    if (!tenantExists) {
      await this.showRegistrationFlow(ctx);
    } else {
      const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
      await this.showMainMenu(ctx, tenant!);
    }
  }

  private async showRegistrationFlow(ctx: Context) {
    await ctx.reply(
      '🏢 **¡Bienvenido al Bot de Expedientes IKE Multitenant!**\n\n' +
        '📝 **Para comenzar, necesito registrar tu empresa.**\n\n' +
        'Usa el comando `/registrar` para iniciar el proceso paso a paso.\n\n' +
        '⚠️ **Importante:**\n' +
        '• Usarás tus credenciales del Portal IKE\n' +
        '• Las contraseñas se almacenan encriptadas\n' +
        '• Solo tu empresa tendrá acceso a estos datos',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleRegisterCommand(ctx: Context) {
    if (!ctx.from) return;

    // Verificar si ya existe el tenant
    const exists = await this.tenantService.tenantExists(BigInt(ctx.from.id));
    if (exists) {
      await ctx.reply(
        '❌ Ya tienes una empresa registrada. Usa `/credenciales` para ver o actualizar tus datos.'
      );
      return;
    }

    // Iniciar flujo interactivo - Paso 1: Pedir nombre de empresa
    const userId = ctx.from.id.toString();
    this.registrationStates.set(userId, {
      stage: 'company',
      data: {},
    });

    await ctx.reply(
      '🏢 **Registro de Nueva Empresa**\n\n' +
        '**Paso 1 de 3:** ¿Cuál es el nombre de tu empresa?\n\n' +
        'Ejemplo: `Constructora ABC S.A.`',
      { parse_mode: 'Markdown' }
    );
  }

  // Método obsoleto - ahora se usa flujo interactivo
  /*
  private parseRegistrationMessage(messageText: string): {
    empresa: string;
    usuario: string;
    password: string;
  } {
    const lines = messageText.split('\n').map(line => line.trim());
    
    let empresa = '';
    let usuario = '';
    let password = '';
    
    for (const line of lines) {
      if (line.toLowerCase().startsWith('empresa:')) {
        empresa = line.substring(8).trim();
      } else if (line.toLowerCase().startsWith('usuario:')) {
        usuario = line.substring(8).trim();
      } else if (line.toLowerCase().startsWith('password:')) {
        password = line.substring(9).trim();
      }
    }
    
    if (!empresa || !usuario || !password) {
      throw new Error('Faltan datos requeridos. Asegúrate de incluir Empresa, Usuario y Password.');
    }
    
    if (!usuario.includes('@')) {
      throw new Error('El usuario debe ser un email válido.');
    }
    
    return { empresa, usuario, password };
  }
  */

  private async showMainMenu(ctx: Context, tenant: any) {
    await ctx.reply(
      `🤖 **Bot de Expedientes IKE v3.0 Multitenant**\n\n` +
        `🏢 **Empresa:** ${tenant.companyName}\n` +
        `👤 **Usuario:** ${tenant.ikeUsername}\n\n` +
        '📎 **¿Listo para procesar expedientes?**\n' +
        'Envía tu archivo Excel y yo me encargo del resto.\n\n' +
        '🔧 **Comandos disponibles:**\n' +
        '• `/credenciales` - Ver/actualizar datos\n' +
        '• `/estado` - Estado de la cuenta\n' +
        '• `/help` - Ayuda completa',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleDocument(ctx: Context) {
    if (!ctx.message || !('document' in ctx.message) || !ctx.from) return;

    // Verificar que el tenant existe
    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    const document = ctx.message.document;
    const fileName = document.file_name;

    console.log(`📎 Archivo recibido de ${tenant.companyName}: ${fileName}`);

    // Validar formato
    if (!fileName?.match(/\.(xlsx|xls)$/i)) {
      await ctx.reply('❌ Solo acepto archivos Excel (.xlsx o .xls)');
      return;
    }

    try {
      const processingMsg = await ctx.reply('⏳ Analizando tu archivo Excel...');

      // Descargar archivo
      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(fileLink.href);
      const buffer = await response.arrayBuffer();

      if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp');
      }

      const tempPath = `temp/${tenant.id}_${fileName}`;
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      // Leer solo para obtener la cantidad de expedientes
      const { ExcelRepositoryImpl } = await import(
        '../../infrastructure/repositories/excel.repository'
      );
      const excelRepo = new ExcelRepositoryImpl();
      const expedientes = await excelRepo.readFile(tempPath);

      // Obtener o crear sesión
      const session = await this.sessionService.getOrCreateSession(tenant.id);
      await this.sessionService.updateSession(session.id, {
        filePath: tempPath,
        fileName: fileName,
        expedientesCount: expedientes.length,
        stage: 'configuring_logics',
      });

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        `📋 **Archivo analizado exitosamente**\n\n` +
          `🏢 **Empresa:** ${tenant.companyName}\n` +
          `📁 **Archivo:** ${fileName}\n` +
          `📊 **Expedientes:** **${expedientes.length}**\n\n` +
          `Ahora configura las lógicas de validación:`
      );

      // Mostrar opciones de configuración
      await this.showLogicConfiguration(ctx, session);
    } catch (error) {
      console.error('❌ Error analizando archivo:', error);
      await ctx.reply(`❌ Error analizando el archivo: ${(error as Error).message}`);
    }
  }

  private async showLogicConfiguration(ctx: Context, session: UserSession) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: session.logicasActivas.margen10Porciento
              ? '✅ Margen ±10%'
              : '➕ Activar Margen ±10%',
            callback_data: `toggle_margen10_${session.id}`,
          },
        ],
        [
          {
            text: session.logicasActivas.costoSuperior
              ? '✅ Costo Superior'
              : '➕ Activar Costo Superior',
            callback_data: `toggle_superior_${session.id}`,
          },
        ],
        [
          {
            text: '📊 Ver Configuración',
            callback_data: `show_preview_${session.id}`,
          },
        ],
      ],
    };

    await ctx.reply(
      `🔧 **CONFIGURACIÓN DE LÓGICAS**\n\n` +
        `✅ **Lógica 1: Costo Exacto** (siempre activa)\n` +
        `${session.logicasActivas.margen10Porciento ? '✅' : '❌'} **Lógica 2: Margen ±10%**\n` +
        `${session.logicasActivas.costoSuperior ? '✅' : '❌'} **Lógica 3: Costo Superior**\n\n` +
        `Selecciona las lógicas adicionales:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }

  private async handleCallbackQuery(ctx: Context) {
    if (!ctx.callbackQuery || !ctx.from || !('data' in ctx.callbackQuery)) return;

    const data = ctx.callbackQuery.data;
    const [action, ...params] = data.split('_');
    const sessionId = params[params.length - 1];

    try {
      // Responder INMEDIATAMENTE al callback para evitar timeout
      await ctx.answerCbQuery();

      const session = await this.sessionService.getSession(sessionId);
      if (!session) {
        await ctx.reply('❌ Sesión expirada. Por favor, sube el archivo nuevamente.');
        return;
      }

      switch (action) {
        case 'toggle':
          await this.handleToggleLogic(ctx, session, params[0]);
          break;
        case 'show':
          await this.showProcessPreview(ctx, session);
          break;
        case 'start':
          // Para procesos largos, usar procesamiento asíncrono sin await
          this.startProcessingAsync(ctx, session).catch((error) => {
            console.error('❌ Error en procesamiento asíncrono:', error);
            ctx.reply(`❌ Error durante el procesamiento: ${error.message}`);
          });
          break;
        case 'back':
          await this.updateLogicConfiguration(ctx, session);
          break;
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      try {
        await ctx.answerCbQuery('❌ Error procesando acción');
      } catch (cbError) {
        // Si el callback ya expiró, solo logear el error
        console.error('❌ Callback ya expirado:', cbError);
      }
    }
  }

  private async handleToggleLogic(ctx: Context, session: UserSession, logic: string) {
    const newLogicas = { ...session.logicasActivas };

    if (logic === 'margen10') {
      newLogicas.margen10Porciento = !newLogicas.margen10Porciento;
    } else if (logic === 'superior') {
      newLogicas.costoSuperior = !newLogicas.costoSuperior;
    }

    const updatedSession = await this.sessionService.updateSession(session.id, {
      logicasActivas: newLogicas,
    });

    await this.updateLogicConfiguration(ctx, updatedSession);
  }

  private async updateLogicConfiguration(ctx: Context, session: UserSession) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: session.logicasActivas.margen10Porciento
              ? '✅ Margen ±10%'
              : '➕ Activar Margen ±10%',
            callback_data: `toggle_margen10_${session.id}`,
          },
        ],
        [
          {
            text: session.logicasActivas.costoSuperior
              ? '✅ Costo Superior'
              : '➕ Activar Costo Superior',
            callback_data: `toggle_superior_${session.id}`,
          },
        ],
        [
          {
            text: '📊 Ver Configuración',
            callback_data: `show_preview_${session.id}`,
          },
        ],
      ],
    };

    if ('message' in ctx.callbackQuery! && ctx.callbackQuery.message) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        ctx.callbackQuery.message.message_id,
        undefined,
        `🔧 **CONFIGURACIÓN DE LÓGICAS**\n\n` +
          `✅ **Lógica 1: Costo Exacto** (siempre activa)\n` +
          `${session.logicasActivas.margen10Porciento ? '✅' : '❌'} **Lógica 2: Margen ±10%**\n` +
          `${session.logicasActivas.costoSuperior ? '✅' : '❌'} **Lógica 3: Costo Superior**\n\n` +
          `Selecciona las lógicas adicionales:`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    }
  }

  private async showProcessPreview(ctx: Context, session: UserSession) {
    const activasCount = Object.values(session.logicasActivas).filter(Boolean).length;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🚀 INICIAR PROCESO',
            callback_data: `start_processing_${session.id}`,
          },
        ],
        [
          {
            text: '⬅️ Volver a Configuración',
            callback_data: `back_to_config_${session.id}`,
          },
        ],
      ],
    };

    const previewMessage =
      `📊 **RESUMEN DE CONFIGURACIÓN**\n\n` +
      `📁 **Archivo:** ${session.fileName}\n` +
      `📋 **Expedientes:** ${session.expedientesCount}\n\n` +
      `🎯 **Lógicas activas (${activasCount}):**\n` +
      `${session.logicasActivas.costoExacto ? '✅' : '❌'} Costo exacto\n` +
      `${session.logicasActivas.margen10Porciento ? '✅' : '❌'} Margen ±10%\n` +
      `${session.logicasActivas.costoSuperior ? '✅' : '❌'} Costo superior\n\n` +
      `⚡ **¿Listo para iniciar?**\n` +
      `Se usarán tus credenciales y se procesarán todos los expedientes.`;

    if ('message' in ctx.callbackQuery! && ctx.callbackQuery.message) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        ctx.callbackQuery.message.message_id,
        undefined,
        previewMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    }
  }

  private async startProcessingAsync(ctx: Context, session: UserSession) {
    if (!session.filePath || !ctx.from) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Error: Tenant no encontrado');
      return;
    }

    try {
      // Mensaje inicial con barra de progreso
      const initialMessage = ProgressBarUtil.createInitialMessage(session.expedientesCount || 0);
      const processingMsg = await ctx.reply(initialMessage, { parse_mode: 'Markdown' });
      const startTime = new Date();

      // Callback de progreso
      const progressCallback = async (current: number, total: number, currentItem: string) => {
        try {
          const progressMessage = ProgressBarUtil.formatProgressBar({
            current,
            total,
            currentItem,
            startTime,
          });

          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            processingMsg.message_id,
            undefined,
            progressMessage,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          // Si no se puede editar el mensaje (muy frecuente), solo loguear sin interrumpir
          console.log('Progreso silencioso:', `${current}/${total} - ${currentItem}`);
        }
      };

      // Procesar con credenciales específicas del tenant usando nuevo sistema de trazabilidad
      if (!this.cargaExpedientesUseCase) {
        throw new Error('Sistema de trazabilidad no configurado');
      }

      // Leer expedientes del Excel
      const { ExcelRepositoryImpl } = await import(
        '../../infrastructure/repositories/excel.repository'
      );
      const excelRepo = new ExcelRepositoryImpl();
      const expedientesExcel = await excelRepo.readFile(session.filePath);

      // Convertir formato para el use case
      const expedientesParaUseCase = expedientesExcel.map((exp) => ({
        expediente: exp.numero,
        costo: parseFloat(exp.costoGuardado.toString()), // Asegurar que sea number
      }));

      // Procesar con nuevo sistema de trazabilidad completa
      const result = await this.cargaExpedientesUseCase.execute({
        tenantId: tenant.id,
        expedientes: expedientesParaUseCase,
        nombreArchivo: session.fileName || 'archivo_telegram.xlsx',
        logicasActivas: session.logicasActivas,
        procesadoPor: 'TELEGRAM_BOT',
        progressCallback,
      });

      // Registrar en historial (adaptando campos del nuevo sistema)
      await this.tenantService.addProcessingHistory(BigInt(ctx.from.id), {
        total: result.totalExpedientes,
        aceptados: result.aprobados,
        pendientes: result.pendientes + result.noAprobados + result.noEncontrados, // PENDIENTE + NO_APROBADO + NO_ENCONTRADO
        tasaLiberacion: result.tasaAprobacion,
        logicasUsadas: session.logicasActivas,
        fileName: session.fileName,
      });

      // Limpiar archivo temporal
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }

      // Limpiar sesión
      await this.sessionService.cleanupSession(session.id);

      // Mensaje final con tiempo total
      const completionMessage = ProgressBarUtil.createCompletionMessage(
        result.totalExpedientes,
        startTime
      );
      const finalMessage =
        `${completionMessage}\n\n` +
        `🏢 **Empresa:** ${tenant.companyName}\n` +
        `📊 **Resultados de Carga:**\n` +
        `• ✅ Aprobados: **${result.aprobados}**\n` +
        `• ⏳ Pendientes: **${result.pendientes}**\n` +
        `• ❌ No Aprobados: **${result.noAprobados}**\n` +
        `• 🔍 No Encontrados: **${result.noEncontrados}**\n` +
        `• 🆕 Nuevos: **${result.nuevosExpedientes}**\n` +
        `• 🔄 Actualizados: **${result.actualizados}**\n\n` +
        `📈 **Tasa de Aprobación:** ${result.tasaAprobacion.toFixed(1)}%\n` +
        `🎯 **${result.esBaseline ? 'Primera carga (Baseline)' : 'Carga incremental'}**`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        finalMessage,
        { parse_mode: 'Markdown' }
      );

      // Los comandos están disponibles siempre, no necesitamos spamear al usuario

      // Enviar Excel de resultados si está disponible
      if (result.excelPath && fs.existsSync(result.excelPath)) {
        try {
          await ctx.replyWithDocument(
            {
              source: result.excelPath,
              filename: `resultados_${tenant.companyName}_${new Date().toISOString().split('T')[0]}.xlsx`,
            },
            {
              caption:
                '📊 Excel de resultados generado automáticamente por el sistema de trazabilidad',
            }
          );

          // Limpiar archivo Excel temporal
          fs.unlinkSync(result.excelPath);
          console.log(`🧹 Excel temporal eliminado: ${result.excelPath}`);
        } catch (error) {
          console.error('❌ Error enviando Excel:', error);
          await ctx.reply(
            '⚠️ Excel generado pero hubo un error al enviarlo. Los datos están guardados en el sistema de trazabilidad.'
          );
        }
      }
    } catch (error) {
      console.error('❌ Error procesando archivo:', error);
      await ctx.reply(`❌ Error: ${(error as Error).message}`);

      // Limpiar en caso de error
      if (session.filePath && fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }
      await this.sessionService.cleanupSession(session.id);
    }
  }

  private async handleCredentialsCommand(ctx: Context) {
    if (!ctx.from) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    await ctx.reply(
      `🏢 **Información de tu empresa:**\n\n` +
        `**Empresa:** ${tenant.companyName}\n` +
        `**Usuario Portal IKE:** ${tenant.ikeUsername}\n` +
        `**Estado:** ${tenant.isActive ? '✅ Activo' : '❌ Inactivo'}\n` +
        `**Modo navegador:** ${tenant.headless ? 'Sin ventana' : 'Con ventana'}\n\n` +
        `Para actualizar tus datos, contacta al administrador.`,
      { parse_mode: 'Markdown' }
    );
  }

  private async handleStatusCommand(ctx: Context) {
    if (!ctx.from) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    await ctx.reply(
      `📊 **Estado de ${tenant.companyName}**\n\n` +
        `🆔 **ID:** ${tenant.id}\n` +
        `📅 **Registrado:** ${tenant.createdAt.toLocaleDateString()}\n` +
        `🔄 **Última actividad:** ${tenant.updatedAt.toLocaleDateString()}\n` +
        `⭐ **Estado:** ${tenant.isActive ? 'Activo' : 'Inactivo'}\n\n` +
        `🤖 **Bot versión:** 3.0 Multitenant`,
      { parse_mode: 'Markdown' }
    );
  }

  private async handleHelp(ctx: Context) {
    await ctx.reply(
      '🆘 **Bot de Expedientes IKE v4.0 Multitenant con Trazabilidad**\n\n' +
        '📋 **Comandos básicos:**\n' +
        '• `/registrar` - Registrar tu empresa\n' +
        '• `/credenciales` - Ver datos de tu empresa\n' +
        '• `/estado` - Estado de tu cuenta\n' +
        '• `/help` - Esta ayuda\n\n' +
        '📊 **Comandos de trazabilidad:**\n' +
        '• `/resumen` - Estadísticas generales\n' +
        '• `/expediente [número]` - Buscar expediente específico\n' +
        '• `/historial` - Historial de cargas y CronJobs\n' +
        '• `/pendientes` - Expedientes NO_APROBADO/NO_ENCONTRADO\n' +
        '• `/revalidar` - Ejecutar revalidación manual\n' +
        '• `/cargas` - Ver últimas cargas\n\n' +
        '📎 **Uso:**\n' +
        '1. Registra tu empresa con `/registrar`\n' +
        '2. Envía un archivo Excel\n' +
        '3. Configura las lógicas de validación\n' +
        '4. Inicia el proceso\n\n' +
        '🎯 **Lógicas disponibles:**\n' +
        '• **Costo exacto**: Siempre activa\n' +
        '• **Margen ±10%**: Opcional\n' +
        '• **Costo superior**: Opcional\n\n' +
        '🔐 **Multitenant:** Cada empresa usa sus propias credenciales del Portal IKE de forma segura.',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleResumenCommand(ctx: Context): Promise<void> {
    if (!ctx.from || !this.expedienteRepository) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    try {
      const [stats, cargas, cronJobs] = await Promise.all([
        this.expedienteRepository.getExpedienteStats(tenant.id),
        this.expedienteRepository.findCargasByTenant(tenant.id, 3),
        this.expedienteRepository.findCronJobExecutions(tenant.id, 3),
      ]);

      // Validar que stats tiene el campo pendientes
      const estadisticas = stats as {
        total: number;
        aprobados: number;
        pendientes: number;
        noAprobados: number;
        noEncontrados: number;
        tasaAprobacion: number;
      };

      const ultimaCarga = cargas.length > 0 ? cargas[0] : null;
      const ultimoCronJob = cronJobs.length > 0 ? cronJobs[0] : null;

      const message =
        `📊 **RESUMEN - ${tenant.companyName}**\n\n` +
        `**📈 Estadísticas generales:**\n` +
        `• Total expedientes: **${estadisticas.total}**\n` +
        `• ✅ Aprobados: **${estadisticas.aprobados}** (${estadisticas.tasaAprobacion.toFixed(1)}%)\n` +
        `• ⏳ Pendientes: **${estadisticas.pendientes}**\n` +
        `• ❌ No aprobados: **${estadisticas.noAprobados}**\n` +
        `• 🔍 No encontrados: **${estadisticas.noEncontrados}**\n\n` +
        `**📁 Última carga:**\n` +
        `${
          ultimaCarga
            ? `• Archivo: ${ultimaCarga.nombreArchivo}\n` +
              `• Fecha: ${ultimaCarga.fechaProcesamiento.toLocaleDateString()}\n` +
              `• Procesados: ${ultimaCarga.totalExpedientes} expedientes\n` +
              `• Tasa aprobación: ${ultimaCarga.getPorcentajeAprobacion().toFixed(1)}%`
            : '• No hay cargas registradas'
        }\n\n` +
        `**🤖 Último CronJob:**\n` +
        `${
          ultimoCronJob
            ? `• Fecha: ${ultimoCronJob.fechaInicio.toLocaleDateString()} ${ultimoCronJob.fechaInicio.toLocaleTimeString()}\n` +
              `• Procesados: ${ultimoCronJob.totalProcesados}\n` +
              `• Cambios a aprobado: ${ultimoCronJob.cambiosAprobado}\n` +
              `• Duración: ${ultimoCronJob.getDuracionFormateada()}`
            : '• No hay ejecuciones recientes'
        }`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error en comando resumen:', error);
      await ctx.reply('❌ Error obteniendo el resumen');
    }
  }

  private async handleExpedienteCommand(ctx: Context): Promise<void> {
    if (!ctx.from || !this.expedienteRepository) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    const command = (ctx.message as any)?.text?.split(' ');
    const numeroExpediente = command?.length > 1 ? command[1] : null;

    if (!numeroExpediente) {
      await ctx.reply(
        '⚠️ **Uso correcto:**\n\n' +
          '`/expediente NUMERO_EXPEDIENTE`\n\n' +
          'Ejemplo: `/expediente EXP-2024-001`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      const expediente = await this.expedienteRepository.findByTenantAndNumero(
        tenant.id,
        numeroExpediente
      );

      if (!expediente) {
        await ctx.reply(
          `❌ **Expediente no encontrado:**\n\n` +
            `• Número: ${numeroExpediente}\n` +
            `• Empresa: ${tenant.companyName}\n\n` +
            `Verifica que el número sea correcto.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const calificacionIcon = {
        [CalificacionExpediente.APROBADO]: '✅',
        [CalificacionExpediente.PENDIENTE]: '⏳',
        [CalificacionExpediente.NO_APROBADO]: '❌',
        [CalificacionExpediente.NO_ENCONTRADO]: '🔍',
      };

      let message =
        `📋 **EXPEDIENTE: ${expediente.numero}**\n\n` +
        `${calificacionIcon[expediente.calificacion]} **Estado:** ${expediente.calificacion}\n` +
        `💰 **Costo actual:** €${expediente.costo}\n` +
        `📝 **Motivo:** ${expediente.motivoCalificacion}\n` +
        `📅 **Primera versión:** ${expediente.fechaPrimeraVersion.toLocaleDateString()}\n` +
        `🔄 **Última actualización:** ${expediente.fechaUltimaActualizacion.toLocaleDateString()}\n` +
        `📊 **Total versiones:** ${expediente.versiones.length}\n\n` +
        `**📈 Historial de cambios:**\n`;

      const versiones = expediente.versiones.slice(-5); // Últimas 5 versiones
      versiones.forEach((version) => {
        const tipoIcon = version.isCreacion() ? '✨' : version.isCambioCosto() ? '💰' : '🔄';
        message += `${tipoIcon} ${version.createdAt.toLocaleDateString()} - ${version.calificacionNueva}`;
        if (version.costoAnterior && version.costoAnterior !== version.costoNuevo) {
          message += ` (€${version.costoAnterior} → €${version.costoNuevo})`;
        }
        message += '\n';
      });

      if (expediente.versiones.length > 5) {
        message += `... y ${expediente.versiones.length - 5} versiones anteriores\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error buscando expediente:', error);
      await ctx.reply('❌ Error buscando el expediente');
    }
  }

  private async handlePendientesCommand(ctx: Context): Promise<void> {
    if (!ctx.from || !this.expedienteRepository || !this.revalidacionUseCase) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    try {
      const pendientes = await this.revalidacionUseCase.getExpedientesPendientes(tenant.id);

      if (pendientes.total === 0) {
        await ctx.reply(
          `🎉 **¡Excelente noticia!**\n\n` +
            `No tienes expedientes pendientes.\n` +
            `Todos tus expedientes están **APROBADOS**. ✅`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Obtener algunos ejemplos de expedientes pendientes
      const expedientesPendientes = await this.expedienteRepository.findByTenantAndCalificaciones(
        tenant.id,
        [CalificacionExpediente.PENDIENTE]
      );

      const expedientesNoAprobados = await this.expedienteRepository.findByTenantAndCalificaciones(
        tenant.id,
        [CalificacionExpediente.NO_APROBADO]
      );

      const expedientesNoEncontrados =
        await this.expedienteRepository.findByTenantAndCalificaciones(tenant.id, [
          CalificacionExpediente.NO_ENCONTRADO,
        ]);

      let message =
        `⚠️ **EXPEDIENTES PENDIENTES**\n\n` +
        `**📊 Resumen:**\n` +
        `• ⏳ Pendientes validación: **${pendientes.pendientes}**\n` +
        `• ❌ No aprobados: **${pendientes.noAprobados}**\n` +
        `• 🔍 No encontrados: **${pendientes.noEncontrados}**\n` +
        `• **Total pendientes: ${pendientes.total}**\n\n`;

      if (expedientesPendientes.length > 0) {
        message += `**⏳ Algunos PENDIENTES:**\n`;
        expedientesPendientes.slice(0, 3).forEach((exp) => {
          message += `• ${exp.numero} - €${exp.costo}\n`;
        });
        if (expedientesPendientes.length > 3) {
          message += `... y ${expedientesPendientes.length - 3} más\n`;
        }
        message += '\n';
      }

      if (expedientesNoAprobados.length > 0) {
        message += `**❌ Algunos NO APROBADOS:**\n`;
        expedientesNoAprobados.slice(0, 3).forEach((exp) => {
          message += `• ${exp.numero} - €${exp.costo}\n`;
        });
        if (expedientesNoAprobados.length > 3) {
          message += `... y ${expedientesNoAprobados.length - 3} más\n`;
        }
        message += '\n';
      }

      if (expedientesNoEncontrados.length > 0) {
        message += `**🔍 Algunos NO ENCONTRADOS:**\n`;
        expedientesNoEncontrados.slice(0, 3).forEach((exp) => {
          message += `• ${exp.numero} - €${exp.costo}\n`;
        });
        if (expedientesNoEncontrados.length > 3) {
          message += `... y ${expedientesNoEncontrados.length - 3} más\n`;
        }
        message += '\n';
      }

      message += `💡 **Tip:** Usa \`/revalidar\` para intentar aprobar algunos expedientes automáticamente.`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error obteniendo pendientes:', error);
      await ctx.reply('❌ Error obteniendo expedientes pendientes');
    }
  }

  private async handleRevalidarCommand(ctx: Context): Promise<void> {
    if (!ctx.from || !this.revalidacionUseCase) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    try {
      const processingMsg = await ctx.reply('🤖 Iniciando revalidación manual...');

      const resultado = await this.revalidacionUseCase.execute({
        tenantId: tenant.id,
        maxBatchSize: 500,
        notifyOnChanges: false,
      });

      let message =
        `🤖 **REVALIDACIÓN COMPLETADA**\n\n` +
        `**📊 Resultados:**\n` +
        `• Total procesados: **${resultado.totalProcesados}**\n` +
        `• Nuevos aprobados: **${resultado.cambiosAprobado}** ✅\n` +
        `• Siguen no aprobados: ${resultado.permanecenNoAprobado}\n` +
        `• Siguen no encontrados: ${resultado.permanecenNoEncontrado}\n` +
        `• Cambios de costo: ${resultado.cambiosCosto}\n` +
        `• Duración: ${resultado.duracionFormateada}\n\n`;

      if (resultado.cambiosAprobado > 0) {
        message += `🎉 **¡${resultado.cambiosAprobado} expedientes fueron aprobados automáticamente!**\n\n`;

        if (resultado.expedientesCambiados.length > 0) {
          message += `**🔄 Cambios principales:**\n`;
          resultado.expedientesCambiados.slice(0, 3).forEach((cambio) => {
            if (cambio.calificacionNueva === CalificacionExpediente.APROBADO) {
              message += `✅ ${cambio.numero} → APROBADO\n`;
            }
          });
          if (resultado.expedientesCambiados.length > 3) {
            message += `... y ${resultado.expedientesCambiados.length - 3} cambios más\n`;
          }
        }
      } else if (resultado.totalProcesados > 0) {
        message += `ℹ️ No se encontraron expedientes que puedan ser aprobados automáticamente en este momento.`;
      } else {
        message += `✅ No hay expedientes pendientes para revalidar.`;
      }

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        message,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error en revalidación manual:', error);
      await ctx.reply('❌ Error ejecutando la revalidación manual');
    }
  }

  private async handleHistorialCommand(ctx: Context): Promise<void> {
    if (!ctx.from || !this.expedienteRepository) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    try {
      const cronJobs = await this.expedienteRepository.findCronJobExecutions(tenant.id, 10);

      if (cronJobs.length === 0) {
        await ctx.reply(
          `📈 **HISTORIAL DE CRONJOBS**\n\n` +
            `No hay ejecuciones de CronJob registradas para tu empresa.\n\n` +
            `Los CronJobs se ejecutan automáticamente para revalidar expedientes pendientes.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = `🤖 **HISTORIAL DE CRONJOBS**\n\n`;

      cronJobs.forEach((cronJob, index) => {
        const icon = cronJob.hayCambios() ? '🎯' : '📊';
        message += `${icon} **${cronJob.fechaInicio.toLocaleDateString()}** - ${cronJob.fechaInicio.toLocaleTimeString()}\n`;
        message += `   • Procesados: ${cronJob.totalProcesados}\n`;
        message += `   • Nuevos aprobados: ${cronJob.cambiosAprobado}\n`;
        message += `   • Duración: ${cronJob.getDuracionFormateada()}\n`;
        if (index < cronJobs.length - 1) message += '\n';
      });

      const totalCambios = cronJobs.reduce((sum, cj) => sum + cj.cambiosAprobado, 0);
      const totalProcesados = cronJobs.reduce((sum, cj) => sum + cj.totalProcesados, 0);

      message += `\n📊 **Estadísticas del historial:**\n`;
      message += `• Total expedientes procesados: ${totalProcesados}\n`;
      message += `• Total aprobaciones automáticas: ${totalCambios}\n`;
      message += `• Ejecuciones registradas: ${cronJobs.length}`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      await ctx.reply('❌ Error obteniendo el historial de CronJobs');
    }
  }

  private async handleCargasCommand(ctx: Context): Promise<void> {
    if (!ctx.from || !this.expedienteRepository) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Primero debes registrar tu empresa con `/registrar`');
      return;
    }

    try {
      const cargas = await this.expedienteRepository.findCargasByTenant(tenant.id, 10);

      if (cargas.length === 0) {
        await ctx.reply(
          `📁 **HISTORIAL DE CARGAS**\n\n` +
            `No hay cargas registradas para tu empresa.\n\n` +
            `Las cargas se registran automáticamente cuando subes archivos Excel.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = `📁 **HISTORIAL DE CARGAS**\n\n`;

      cargas.forEach((carga, index) => {
        const icon = carga.esBaseline ? '🏁' : '📊';
        const baselineText = carga.esBaseline ? ' (Baseline)' : '';

        message += `${icon} **${carga.nombreArchivo}**${baselineText}\n`;
        message += `   📅 ${carga.fechaProcesamiento.toLocaleDateString()} - ${carga.fechaProcesamiento.toLocaleTimeString()}\n`;
        message += `   📊 Total: ${carga.totalExpedientes} | Aprobados: ${carga.aprobados} (${carga.getPorcentajeAprobacion().toFixed(1)}%)\n`;
        message += `   🔢 Nuevos: ${carga.nuevosExpedientes} | Actualizados: ${carga.actualizados} | Duplicados: ${carga.duplicadosSinCambio}\n`;
        if (carga.errores > 0) {
          message += `   ❌ Errores: ${carga.errores}\n`;
        }
        if (index < cargas.length - 1) message += '\n';
      });

      const totalExpedientes = cargas.reduce((sum, c) => sum + c.totalExpedientes, 0);
      const totalAprobados = cargas.reduce((sum, c) => sum + c.aprobados, 0);

      message += `\n📊 **Estadísticas totales:**\n`;
      message += `• Total expedientes cargados: ${totalExpedientes}\n`;
      message += `• Total aprobados: ${totalAprobados}\n`;
      message += `• Tasa aprobación promedio: ${totalExpedientes > 0 ? ((totalAprobados / totalExpedientes) * 100).toFixed(1) : '0'}%\n`;
      message += `• Cargas realizadas: ${cargas.length}`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error obteniendo cargas:', error);
      await ctx.reply('❌ Error obteniendo el historial de cargas');
    }
  }

  private async handleTextMessage(ctx: Context) {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const text = ctx.message.text;
    const userId = ctx.from.id.toString();

    // Verificar si es un comando, si es así, no procesar como texto
    if (text.startsWith('/')) return;

    // Obtener estado de registro
    const registrationState = this.registrationStates.get(userId);
    if (!registrationState) return; // No está en proceso de registro

    switch (registrationState.stage) {
      case 'company':
        await this.handleRegistrationCompany(ctx, text);
        break;
      case 'username':
        await this.handleRegistrationUsername(ctx, text);
        break;
      case 'password':
        await this.handleRegistrationPassword(ctx, text);
        break;
    }
  }

  private async handleRegistrationCompany(ctx: Context, companyName: string) {
    if (!ctx.from) return;

    const userId = ctx.from.id.toString();
    const state = this.registrationStates.get(userId);
    if (!state) return;

    // Validar nombre de empresa
    if (companyName.trim().length < 2) {
      await ctx.reply(
        '❌ El nombre de la empresa debe tener al menos 2 caracteres. Intenta de nuevo:'
      );
      return;
    }

    // Guardar y avanzar al paso 2
    state.stage = 'username';
    state.data.companyName = companyName.trim();
    this.registrationStates.set(userId, state);

    await ctx.reply(
      '✅ **Empresa registrada:** ' +
        companyName.trim() +
        '\n\n' +
        '👤 **Paso 2 de 3:** ¿Cuál es tu usuario del Portal IKE?\n\n' +
        'Ejemplo: `usuario@empresa.com`',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleRegistrationUsername(ctx: Context, username: string) {
    if (!ctx.from) return;

    const userId = ctx.from.id.toString();
    const state = this.registrationStates.get(userId);
    if (!state) return;

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(username.trim())) {
      await ctx.reply('❌ Ingresa un email válido. Ejemplo: `usuario@empresa.com`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Guardar y avanzar al paso 3
    state.stage = 'password';
    state.data.username = username.trim();
    this.registrationStates.set(userId, state);

    await ctx.reply(
      '✅ **Usuario:** ' +
        username.trim() +
        '\n\n' +
        '🔐 **Paso 3 de 3:** ¿Cuál es tu contraseña del Portal IKE?\n\n' +
        '⚠️ **Nota:** La contraseña se almacenará encriptada y segura.',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleRegistrationPassword(ctx: Context, password: string) {
    if (!ctx.from) return;

    const userId = ctx.from.id.toString();
    const state = this.registrationStates.get(userId);
    if (!state) return;

    // Validar contraseña
    if (password.trim().length < 3) {
      await ctx.reply('❌ La contraseña debe tener al menos 3 caracteres. Intenta de nuevo:');
      return;
    }

    try {
      // Verificar que tenemos todos los datos
      if (!state.data.companyName || !state.data.username) {
        await ctx.reply(
          '❌ Error: datos de registro incompletos. Usa `/registrar` para comenzar de nuevo.'
        );
        this.registrationStates.delete(userId);
        return;
      }

      // Crear el tenant
      const tenant = await this.tenantService.createTenant({
        telegramId: BigInt(ctx.from.id),
        companyName: state.data.companyName,
        ikeUsername: state.data.username,
        ikePassword: password.trim(),
        headless: true,
      });

      // Limpiar estado de registro
      this.registrationStates.delete(userId);

      await ctx.reply(
        '🎉 **¡Registro completado exitosamente!**\n\n' +
          `🏢 **Empresa:** ${tenant.companyName}\n` +
          `👤 **Usuario:** ${tenant.ikeUsername}\n` +
          `🔐 **Estado:** Configurado y listo\n\n` +
          `📋 **Chat ID:** ${ctx.from.id}\n\n` +
          '✨ ¡Ya puedes empezar a procesar expedientes!\n' +
          'Envía un archivo Excel para comenzar.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error en registro final:', error);
      await ctx.reply('❌ Error completando el registro. Usa `/registrar` para intentar de nuevo.');
      this.registrationStates.delete(userId);
    }
  }

  private async handleError(error: any) {
    console.error('❌ Error en bot:', error);
  }

  async launch() {
    console.log('🚀 Iniciando Bot de Expedientes IKE v3.0 Multitenant...');
    await this.bot.launch();

    process.once('SIGINT', () => this.cleanup());
    process.once('SIGTERM', () => this.cleanup());
  }

  private async cleanup() {
    console.log('🧹 Cerrando conexiones...');
    await this.tenantService.disconnect();
    await this.sessionService.disconnect();
    this.bot.stop('SIGINT');
  }
}
