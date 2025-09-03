import { Telegraf, Context } from 'telegraf';
import * as fs from 'fs';
import { ProcessExcelUseCase } from '../../application/use-cases/process-excel.use-case';
import { TenantService } from '../../infrastructure/services/tenant.service';
import { SessionService, UserSession } from '../../infrastructure/services/session.service';

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
    private readonly processExcelUseCase: ProcessExcelUseCase
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
    this.bot.help(this.handleHelp.bind(this));
    
    // Error handler
    this.bot.catch(this.handleError.bind(this));
  }

  private setupCleanupTasks() {
    // Limpiar sesiones antiguas cada hora
    setInterval(async () => {
      try {
        await this.sessionService.cleanupOldSessions();
      } catch (error) {
        console.error('Error limpiando sesiones:', error);
      }
    }, 60 * 60 * 1000); // 1 hora
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
      await ctx.reply('❌ Ya tienes una empresa registrada. Usa `/credenciales` para ver o actualizar tus datos.');
      return;
    }

    // Iniciar flujo interactivo - Paso 1: Pedir nombre de empresa
    const userId = ctx.from.id.toString();
    this.registrationStates.set(userId, {
      stage: 'company',
      data: {}
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
      const { ExcelRepositoryImpl } = await import('../../infrastructure/repositories/excel.repository');
      const excelRepo = new ExcelRepositoryImpl();
      const expedientes = await excelRepo.readFile(tempPath);

      // Obtener o crear sesión
      const session = await this.sessionService.getOrCreateSession(tenant.id);
      await this.sessionService.updateSession(session.id, {
        filePath: tempPath,
        fileName: fileName,
        expedientesCount: expedientes.length,
        stage: 'configuring_logics'
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
            text: session.logicasActivas.margen10Porciento ? '✅ Margen ±10%' : '➕ Activar Margen ±10%',
            callback_data: `toggle_margen10_${session.id}`
          }
        ],
        [
          {
            text: session.logicasActivas.costoSuperior ? '✅ Costo Superior' : '➕ Activar Costo Superior',
            callback_data: `toggle_superior_${session.id}`
          }
        ],
        [
          {
            text: '📊 Ver Configuración',
            callback_data: `show_preview_${session.id}`
          }
        ]
      ]
    };

    await ctx.reply(
      `🔧 **CONFIGURACIÓN DE LÓGICAS**\n\n` +
      `✅ **Lógica 1: Costo Exacto** (siempre activa)\n` +
      `${session.logicasActivas.margen10Porciento ? '✅' : '❌'} **Lógica 2: Margen ±10%**\n` +
      `${session.logicasActivas.costoSuperior ? '✅' : '❌'} **Lógica 3: Costo Superior**\n\n` +
      `Selecciona las lógicas adicionales:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleCallbackQuery(ctx: Context) {
    if (!ctx.callbackQuery || !ctx.from || !('data' in ctx.callbackQuery)) return;

    const data = ctx.callbackQuery.data;
    const [action, ...params] = data.split('_');
    const sessionId = params[params.length - 1];

    try {
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
          await this.startProcessing(ctx, session);
          break;
        case 'back':
          await this.updateLogicConfiguration(ctx, session);
          break;
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      await ctx.answerCbQuery('❌ Error procesando acción');
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
      logicasActivas: newLogicas
    });

    await this.updateLogicConfiguration(ctx, updatedSession);
  }

  private async updateLogicConfiguration(ctx: Context, session: UserSession) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: session.logicasActivas.margen10Porciento ? '✅ Margen ±10%' : '➕ Activar Margen ±10%',
            callback_data: `toggle_margen10_${session.id}`
          }
        ],
        [
          {
            text: session.logicasActivas.costoSuperior ? '✅ Costo Superior' : '➕ Activar Costo Superior',
            callback_data: `toggle_superior_${session.id}`
          }
        ],
        [
          {
            text: '📊 Ver Configuración',
            callback_data: `show_preview_${session.id}`
          }
        ]
      ]
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
          reply_markup: keyboard
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
            callback_data: `start_processing_${session.id}`
          }
        ],
        [
          {
            text: '⬅️ Volver a Configuración',
            callback_data: `back_to_config_${session.id}`
          }
        ]
      ]
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
          reply_markup: keyboard
        }
      );
    }
  }

  private async startProcessing(ctx: Context, session: UserSession) {
    if (!session.filePath || !ctx.from) return;

    const tenant = await this.tenantService.getTenantByTelegramId(BigInt(ctx.from.id));
    if (!tenant) {
      await ctx.reply('❌ Error: Tenant no encontrado');
      return;
    }

    try {
      const processingMsg = await ctx.reply(
        `🌐 **Iniciando proceso para ${tenant.companyName}**\n` +
        `🚀 Abriendo portal IKE con tus credenciales...`
      );

      // Procesar con credenciales específicas del tenant
      const result = await this.processExcelUseCase.execute({ 
        filePath: session.filePath,
        logicasActivas: session.logicasActivas,
        tenantId: tenant.id
      });

      // Registrar en historial
      await this.tenantService.addProcessingHistory(BigInt(ctx.from.id), {
        total: result.total,
        aceptados: result.aceptados,
        pendientes: result.pendientes,
        tasaLiberacion: result.tasaLiberacion,
        logicasUsadas: session.logicasActivas,
        fileName: session.fileName
      });

      // Limpiar archivo temporal
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }

      // Limpiar sesión
      await this.sessionService.cleanupSession(session.id);

      // Mensaje final
      const finalMessage = 
        `✅ **¡Procesamiento completado para ${tenant.companyName}!**\n\n` +
        `📊 **Resultados:**\n` +
        `• Total: ${result.total}\n` +
        `• Liberados: ${result.aceptados}\n` +
        `• Pendientes: ${result.pendientes}\n` +
        `• Tasa liberación: ${result.tasaLiberacion.toFixed(1)}%\n\n` +
        `🔍 **Por lógica:**\n` +
        `• L1 (Exacto): ${result.porLogica.logica1}\n` +
        `• L2 (±10%): ${result.porLogica.logica2}\n` +
        `• L3 (Superior): ${result.porLogica.logica3}`;

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        finalMessage,
        { parse_mode: 'Markdown' }
      );

      // Enviar archivo de resultados
      if (fs.existsSync(result.resultFilePath)) {
        await ctx.replyWithDocument(
          { source: result.resultFilePath },
          { caption: `📎 Resultados de ${tenant.companyName} - Liberaciones reales` }
        );
        
        fs.unlinkSync(result.resultFilePath);
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
      '🆘 **Bot de Expedientes IKE v3.0 Multitenant**\n\n' +
      '📋 **Comandos:**\n' +
      '• `/registrar` - Registrar tu empresa\n' +
      '• `/credenciales` - Ver datos de tu empresa\n' +
      '• `/estado` - Estado de tu cuenta\n' +
      '• `/help` - Esta ayuda\n\n' +
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
      await ctx.reply('❌ El nombre de la empresa debe tener al menos 2 caracteres. Intenta de nuevo:');
      return;
    }

    // Guardar y avanzar al paso 2
    state.stage = 'username';
    state.data.companyName = companyName.trim();
    this.registrationStates.set(userId, state);

    await ctx.reply(
      '✅ **Empresa registrada:** ' + companyName.trim() + '\n\n' +
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
      await ctx.reply('❌ Ingresa un email válido. Ejemplo: `usuario@empresa.com`', { parse_mode: 'Markdown' });
      return;
    }

    // Guardar y avanzar al paso 3
    state.stage = 'password';
    state.data.username = username.trim();
    this.registrationStates.set(userId, state);

    await ctx.reply(
      '✅ **Usuario:** ' + username.trim() + '\n\n' +
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
        await ctx.reply('❌ Error: datos de registro incompletos. Usa `/registrar` para comenzar de nuevo.');
        this.registrationStates.delete(userId);
        return;
      }

      // Crear el tenant
      const tenant = await this.tenantService.createTenant({
        telegramId: BigInt(ctx.from.id),
        companyName: state.data.companyName,
        ikeUsername: state.data.username,
        ikePassword: password.trim(),
        headless: true
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