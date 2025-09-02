import { Telegraf, Context } from 'telegraf';
import * as fs from 'fs';
import { ProcessExcelUseCase } from '../../application/use-cases/process-excel.use-case';

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
    
    // Comando help
    this.bot.help(this.handleHelp.bind(this));
    
    // Error handler
    this.bot.catch(this.handleError.bind(this));
  }

  private async handleStart(ctx: Context) {
    await ctx.reply(
      '🤖 **Bot de Expedientes IKE**\n\n' +
      '📎 **Sube tu archivo Excel** y lo procesaré automáticamente.\n\n' +
      '**Formatos soportados:**\n' +
      '• .xlsx (recomendado)\n' +
      '• .xls\n\n' +
      '*Envía el archivo como documento.*',
      { parse_mode: 'Markdown' }
    );
  }

  private async handleDocument(ctx: Context) {
    if (!ctx.message || !('document' in ctx.message)) return;

    const document = ctx.message.document;
    const fileName = document.file_name;

    console.log(`📎 Archivo recibido: ${fileName}`);

    // Validar formato
    if (!fileName?.match(/\.(xlsx|xls)$/i)) {
      await ctx.reply('❌ Solo acepto archivos Excel (.xlsx o .xls)');
      return;
    }

    try {
      const processingMsg = await ctx.reply('⏳ Procesando tu archivo Excel...');

      // Descargar archivo
      const fileLink = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(fileLink.href);
      const buffer = await response.arrayBuffer();
      
      if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp');
      }
      
      const tempPath = `temp/${fileName}`;
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      // Procesar con Use Case
      const result = await this.processExcelUseCase.execute({ 
        filePath: tempPath 
      });

      // Limpiar archivo temporal
      fs.unlinkSync(tempPath);

      // Mensaje final
      const finalMessage = 
        `✅ **¡Procesamiento completado!**\n\n` +
        `📊 **Resultados:**\n` +
        `• Total: ${result.total}\n` +
        `• Aceptados: ${result.aceptados}\n` +
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
          { caption: '📊 Resultados del procesamiento' }
        );

        // Limpiar archivo después de 5 segundos
        setTimeout(() => {
          if (fs.existsSync(result.resultFilePath)) {
            fs.unlinkSync(result.resultFilePath);
          }
        }, 5000);
      }

      console.log(`✅ Procesamiento completado: ${result.aceptados}/${result.total} aceptados`);

    } catch (error) {
      console.error('❌ Error:', error);
      await ctx.reply(`❌ Error: ${(error as Error).message}`);
    }
  }

  private async handleHelp(ctx: Context) {
    await ctx.reply(
      '📋 **Ayuda - Bot de Expedientes IKE**\n\n' +
      '**Comandos:**\n' +
      '• /start - Iniciar bot\n' +
      '• /help - Esta ayuda\n\n' +
      '**Uso:**\n' +
      '1. Envía tu archivo Excel\n' +
      '2. El bot lo procesa automáticamente\n' +
      '3. Recibes los resultados\n\n' +
      '**Formatos:** .xlsx, .xls',
      { parse_mode: 'Markdown' }
    );
  }

  private handleError(err: any, ctx: Context) {
    console.error('❌ Bot Error:', err);
  }

  async launch() {
    console.log('🚀 Iniciando Bot de Expedientes IKE...');
    await this.bot.launch();
    console.log('✅ Bot iniciado correctamente');
    
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}