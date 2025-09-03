import { Telegraf, Context } from 'telegraf';
import * as fs from 'fs';
import { ProcessExcelUseCase } from '../../application/use-cases/process-excel.use-case';

interface UserSession {
  filePath?: string;
  fileName?: string;
  expedientesCount?: number;
  logicasActivas: {
    costoExacto: boolean;      // Siempre activa
    margen10Porciento: boolean;
    costoSuperior: boolean;
  };
  stage: 'idle' | 'file_received' | 'configuring_logics' | 'ready_to_process';
}

// Almacén simple de sesiones (en producción usaríamos Redis o DB)
const userSessions = new Map<number, UserSession>();

export class BotController {
  constructor(
    private readonly bot: Telegraf,
    private readonly processExcelUseCase: ProcessExcelUseCase
  ) {
    this.setupHandlers();
  }

  private setupHandlers() {
    // Comando start
    this.bot.start(this.handleStart.bind(this));
    
    // Procesar documentos Excel
    this.bot.on('document', this.handleDocument.bind(this));
    
    // Manejo de botones inline (callbacks)
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    
    // Comando help
    this.bot.help(this.handleHelp.bind(this));
    
    // Error handler
    this.bot.catch(this.handleError.bind(this));
  }

  private getOrCreateSession(userId: number): UserSession {
    if (!userSessions.has(userId)) {
      userSessions.set(userId, {
        logicasActivas: {
          costoExacto: true,      // Siempre activa por defecto
          margen10Porciento: false,
          costoSuperior: false
        },
        stage: 'idle'
      });
    }
    return userSessions.get(userId)!;
  }

  private async handleStart(ctx: Context) {
    await ctx.reply(
      '🤖 **Bot de Expedientes IKE v2.0**\n\n' +
      '📎 **Nuevo flujo interactivo:**\n' +
      '1. Sube tu archivo Excel\n' +
      '2. Configura las lógicas de validación\n' +
      '3. Revisa el preview\n' +
      '4. ¡Inicia el proceso!\n\n' +
      '**Formatos soportados:** .xlsx, .xls\n' +
      '*Envía el archivo como documento.*',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleDocument(ctx: Context) {
    if (!ctx.message || !('document' in ctx.message)) return;
    if (!ctx.from) return;

    const document = ctx.message.document;
    const fileName = document.file_name;
    const session = this.getOrCreateSession(ctx.from.id);

    console.log(`📎 Archivo recibido: ${fileName}`);

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
      
      const tempPath = `temp/${fileName}`;
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      // Leer solo para obtener la cantidad de expedientes (no procesar aún)
      const { ExcelRepositoryImpl } = await import('../../infrastructure/repositories/excel.repository');
      const excelRepo = new ExcelRepositoryImpl();
      const expedientes = await excelRepo.readFile(tempPath);

      // Actualizar sesión
      session.filePath = tempPath;
      session.fileName = fileName;
      session.expedientesCount = expedientes.length;
      session.stage = 'configuring_logics';

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        undefined,
        `📋 **Archivo analizado exitosamente**\n\n` +
        `• Archivo: ${fileName}\n` +
        `• Expedientes detectados: **${expedientes.length}**\n\n` +
        `Ahora configura las lógicas de validación:`
      );

      // Mostrar opciones de configuración
      await this.showLogicConfiguration(ctx);

    } catch (error) {
      console.error('❌ Error analizando archivo:', error);
      await ctx.reply(`❌ Error analizando el archivo: ${(error as Error).message}`);
    }
  }

  private async showLogicConfiguration(ctx: Context) {
    if (!ctx.from) return;
    const session = this.getOrCreateSession(ctx.from.id);

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: session.logicasActivas.margen10Porciento ? '✅ Margen ±10%' : '➕ Activar Margen ±10%',
            callback_data: 'toggle_margen10'
          }
        ],
        [
          {
            text: session.logicasActivas.costoSuperior ? '✅ Costo Superior' : '➕ Activar Costo Superior',
            callback_data: 'toggle_superior'
          }
        ],
        [
          {
            text: '📊 Ver Configuración',
            callback_data: 'show_preview'
          }
        ]
      ]
    };

    await ctx.reply(
      `🔧 **CONFIGURACIÓN DE LÓGICAS**\n\n` +
      `✅ **Lógica 1: Costo Exacto** (siempre activa)\n` +
      `${session.logicasActivas.margen10Porciento ? '✅' : '❌'} **Lógica 2: Margen ±10%**\n` +
      `${session.logicasActivas.costoSuperior ? '✅' : '❌'} **Lógica 3: Costo Superior**\n\n` +
      `Selecciona las lógicas adicionales que quieres activar:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleCallbackQuery(ctx: Context) {
    if (!ctx.callbackQuery || !ctx.from) return;
    if (!('data' in ctx.callbackQuery)) return;

    const data = ctx.callbackQuery.data;
    const session = this.getOrCreateSession(ctx.from.id);

    try {
      await ctx.answerCbQuery();

      switch (data) {
        case 'toggle_margen10':
          session.logicasActivas.margen10Porciento = !session.logicasActivas.margen10Porciento;
          await this.updateLogicConfiguration(ctx, session);
          break;

        case 'toggle_superior':
          session.logicasActivas.costoSuperior = !session.logicasActivas.costoSuperior;
          await this.updateLogicConfiguration(ctx, session);
          break;

        case 'show_preview':
          await this.showProcessPreview(ctx, session);
          break;

        case 'start_processing':
          await this.startProcessing(ctx, session);
          break;

        case 'back_to_config':
          await this.updateLogicConfiguration(ctx, session);
          break;
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      await ctx.answerCbQuery('❌ Error procesando acción');
    }
  }

  private async updateLogicConfiguration(ctx: Context, session: UserSession) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: session.logicasActivas.margen10Porciento ? '✅ Margen ±10%' : '➕ Activar Margen ±10%',
            callback_data: 'toggle_margen10'
          }
        ],
        [
          {
            text: session.logicasActivas.costoSuperior ? '✅ Costo Superior' : '➕ Activar Costo Superior',
            callback_data: 'toggle_superior'
          }
        ],
        [
          {
            text: '📊 Ver Configuración',
            callback_data: 'show_preview'
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
        `Selecciona las lógicas adicionales que quieres activar:`,
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
            callback_data: 'start_processing'
          }
        ],
        [
          {
            text: '⬅️ Volver a Configuración',
            callback_data: 'back_to_config'
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
      `⚡ **¿Listo para iniciar el barrido?**\n` +
      `Se abrirá el portal, se hará login automático y se procesarán todos los expedientes con liberación real.`;

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
    if (!session.filePath || session.stage !== 'configuring_logics') {
      await ctx.reply('❌ Error: Sesión inválida. Por favor, sube el archivo nuevamente.');
      return;
    }

    try {
      const processingMsg = await ctx.reply('🌐 Iniciando proceso...\n🚀 Abriendo portal IKE y haciendo login...');

      // Procesar con Use Case usando las lógicas configuradas
      const result = await this.processExcelUseCase.execute({ 
        filePath: session.filePath,
        logicasActivas: session.logicasActivas
      });

      // Limpiar archivo temporal
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }

      // Resetear sesión
      session.stage = 'idle';
      session.filePath = undefined;

      // Mensaje final
      const finalMessage = 
        `✅ **¡Procesamiento completado!**\n\n` +
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
          { caption: '📎 Archivo de resultados con liberaciones reales' }
        );
        
        // Limpiar archivo de resultados
        fs.unlinkSync(result.resultFilePath);
      }

    } catch (error) {
      console.error('❌ Error procesando archivo:', error);
      await ctx.reply(`❌ Error procesando el archivo: ${(error as Error).message}`);
      
      // Limpiar sesión en caso de error
      if (session.filePath && fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }
      session.stage = 'idle';
      session.filePath = undefined;
    }
  }

  private async handleHelp(ctx: Context) {
    await ctx.reply(
      '🆘 **Ayuda - Bot de Expedientes IKE**\n\n' +
      '📋 **Cómo usar:**\n' +
      '1. Envía un archivo Excel (.xlsx o .xls)\n' +
      '2. Configura las lógicas de validación\n' +
      '3. Revisa la configuración en el preview\n' +
      '4. Inicia el proceso con el botón START\n\n' +
      '📊 **Formato del Excel:**\n' +
      '• Columna A: Número de expediente\n' +
      '• Columna B: Costo guardado\n' +
      '• Primera fila: Encabezados\n\n' +
      '🎯 **Lógicas disponibles:**\n' +
      '• **Costo exacto**: Siempre activa\n' +
      '• **Margen ±10%**: Opcional\n' +
      '• **Costo superior**: Opcional',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleError(error: any) {
    console.error('❌ Error en bot:', error);
  }

  async launch() {
    console.log('🚀 Iniciando Bot de Expedientes IKE...');
    await this.bot.launch();
    
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}