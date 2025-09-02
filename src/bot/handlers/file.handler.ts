import { Composer } from 'telegraf';
import { ExcelService } from '../../core/excel/excel.service';
import { ProcessingService } from '../../services/processing.service';
import { MainKeyboard } from '../keyboards/main.keyboard';
import { Logger } from '../../utils/logger';
import * as fs from 'fs';

const excelService = new ExcelService();
const processingService = new ProcessingService();

export const fileHandler = new Composer();

// Handler para archivos Excel
fileHandler.on('document', async (ctx) => {
  const session = ctx.session;

  // Verificar si estamos esperando un archivo
  if (!session?.waitingForFile) {
    await ctx.reply(
      '❓ No estoy esperando ningún archivo en este momento.\n\n' +
        'Para procesar expedientes, usa el menú principal.',
      MainKeyboard.getMainMenu()
    );
    return;
  }

  if (!session.tenant) {
    await ctx.reply('❌ Sesión expirada. Inicia sesión nuevamente.', MainKeyboard.getAuthMenu());
    return;
  }

  const document = ctx.message.document;
  const fileName = document.file_name;
  const fileSize = document.file_size;
  const maxSizeBytes = 50 * 1024 * 1024; // 50MB

  try {
    Logger.processing(`Archivo recibido: ${fileName}`, fileName || 'unknown', session.tenant.id);

    // Validar tipo de archivo
    if (!fileName?.match(/\.(xlsx|xls)$/i)) {
      await ctx.reply(
        '❌ **Formato no válido**\n\n' +
          'Solo se aceptan archivos Excel (.xlsx o .xls)\n\n' +
          'Por favor, envía un archivo válido.',
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getBackButton('process_expedientes'),
        }
      );
      return;
    }

    // Validar tamaño
    if (fileSize && fileSize > maxSizeBytes) {
      await ctx.reply(
        '❌ **Archivo muy grande**\n\n' +
          `Tamaño: ${(fileSize / 1024 / 1024).toFixed(1)}MB\n` +
          `Máximo permitido: 50MB\n\n` +
          'Por favor, reduce el tamaño del archivo.',
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getBackButton('process_expedientes'),
        }
      );
      return;
    }

    // Descargar archivo
    const processingMessage = await ctx.reply(
      '⏳ **Descargando archivo...**\n\n' +
        `📎 ${fileName}\n` +
        `📊 ${fileSize ? (fileSize / 1024).toFixed(1) + 'KB' : 'Tamaño desconocido'}`,
      { parse_mode: 'Markdown' }
    );

    const fileLink = await ctx.telegram.getFileLink(document.file_id);
    const tempFileName = ExcelService.generateTempFileName('upload', 'xlsx');

    // Descargar archivo desde Telegram
    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error('Error descargando archivo');
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempFileName, Buffer.from(buffer));

    // Validar archivo Excel
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      '🔍 **Validando archivo Excel...**',
      { parse_mode: 'Markdown' }
    );

    const validation = await excelService.validateExcelFile(tempFileName);

    if (!validation.isValid) {
      // Limpiar archivo temporal
      fs.unlinkSync(tempFileName);

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        '❌ **Archivo inválido**\n\n' +
          '**Errores encontrados:**\n' +
          validation.errors.map((e) => `• ${e}`).join('\n') +
          (validation.warnings.length > 0
            ? '\n\n**Advertencias:**\n' + validation.warnings.map((w) => `• ${w}`).join('\n')
            : '') +
          '\n\nPor favor, corrige los errores y vuelve a enviar el archivo.',
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getBackButton('process_expedientes'),
        }
      );
      return;
    }

    // Mostrar resumen de validación
    const { totalRows, hasHeaders, format } = validation.summary;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMessage.message_id,
      undefined,
      '✅ **Archivo válido**\n\n' +
        `📊 **Resumen:**\n` +
        `• Total de filas: ${totalRows}\n` +
        `• Formato: ${format === 'simple' ? 'Simple' : 'Estándar'}\n` +
        `• Headers: ${hasHeaders ? 'Sí' : 'No'}\n` +
        (validation.warnings.length > 0
          ? `\n⚠️ **Advertencias:**\n${validation.warnings.map((w) => `• ${w}`).join('\n')}\n`
          : '') +
        '\n¿Deseas continuar con el procesamiento?',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 Continuar', callback_data: `process_confirmed:${tempFileName}` },
              { text: '❌ Cancelar', callback_data: 'cancel_processing' },
            ],
          ],
        },
      }
    );

    // Limpiar flag
    session.waitingForFile = false;
  } catch (error) {
    Logger.error(
      'Error procesando archivo',
      {
        tenantId: session.tenant?.id,
        metadata: { fileName },
      },
      error as Error
    );

    await ctx.reply(
      '❌ **Error procesando archivo**\n\n' +
        `Error: ${(error as Error).message}\n\n` +
        'Por favor, intenta nuevamente.',
      {
        parse_mode: 'Markdown',
        ...MainKeyboard.getErrorMenu(true),
      }
    );

    session.waitingForFile = false;
  }
});

// Confirmar procesamiento
fileHandler.action(/^process_confirmed:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const filePath = ctx.match[1];
  const session = ctx.session;

  if (!session?.tenant) {
    await ctx.reply('❌ Sesión expirada', MainKeyboard.getAuthMenu());
    return;
  }

  try {
    // Actualizar mensaje
    await ctx.editMessageText(
      '🚀 **Iniciando procesamiento...**\n\n' +
        'Por favor espera mientras procesamos tu archivo.\n' +
        'Te mantendremos informado del progreso.',
      { parse_mode: 'Markdown' }
    );

    // Obtener configuración de lógicas
    const options = {
      enableLogica2: session.logica2Enabled || false,
      enableLogica3: session.logica3Enabled || false,
    };

    // Procesar archivo
    let progressMessageId: number | undefined;
    const result = await processingService.processExcelFile({
      tenantId: session.tenant.id,
      filePath,
      options,
      progressCallback: async (progress) => {
        try {
          const progressText =
            `📊 **Procesando expedientes...**\n\n` +
            `**Progreso:** ${progress.current}/${progress.total} (${progress.percentage}%)\n` +
            `**Expediente actual:** ${progress.currentExpediente || 'N/A'}\n` +
            `**Errores:** ${progress.errors}\n\n` +
            `[${'█'.repeat(Math.floor(progress.percentage / 5))}${'░'.repeat(20 - Math.floor(progress.percentage / 5))}]`;

          if (!progressMessageId) {
            const msg = await ctx.telegram.sendMessage(ctx.chat.id, progressText, {
              parse_mode: 'Markdown',
            });
            progressMessageId = msg.message_id;
          } else {
            await ctx.telegram
              .editMessageText(ctx.chat.id, progressMessageId, undefined, progressText, {
                parse_mode: 'Markdown',
              })
              .catch(() => {
                // Ignorar errores de rate limit en actualizaciones de progreso
              });
          }
        } catch (error) {
          // Ignorar errores de actualización de progreso
        }
      },
    });

    // Limpiar archivo temporal
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Mostrar resultados
    const resultText =
      '✅ **¡Procesamiento completado!**\n\n' +
      '📊 **Resultados:**\n' +
      `• Total procesados: ${result.totalRows}\n` +
      `• Aceptados (liberados): ${result.aceptados}\n` +
      `• Pendientes: ${result.pendientes}\n` +
      `• No encontrados: ${result.noEncontrados}\n` +
      `• Tasa de liberación: ${((result.aceptados / result.totalRows) * 100).toFixed(1)}%\n` +
      (result.errors.length > 0
        ? `\n⚠️ **Errores:** ${result.errors.length}\n` +
          result.errors
            .slice(0, 3)
            .map((e) => `• ${e}`)
            .join('\n') +
          (result.errors.length > 3 ? `\n• ... y ${result.errors.length - 3} más` : '')
        : '') +
      '\n\n🎉 Tu archivo de resultados está listo para descargar.';

    await ctx.telegram.editMessageText(ctx.chat.id, progressMessageId!, undefined, resultText, {
      parse_mode: 'Markdown',
      ...MainKeyboard.getDownloadMenu(),
    });

    // Guardar ruta del archivo para descarga
    session.resultFilePath = result.filePath;
  } catch (error) {
    Logger.error(
      'Error en procesamiento',
      {
        tenantId: session.tenant?.id,
        metadata: { filePath },
      },
      error as Error
    );

    await ctx.editMessageText(
      '❌ **Error en procesamiento**\n\n' +
        `Error: ${(error as Error).message}\n\n` +
        'Por favor, revisa el archivo y vuelve a intentar.',
      {
        parse_mode: 'Markdown',
        ...MainKeyboard.getErrorMenu(true),
      }
    );

    // Limpiar archivo temporal
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// Cancelar procesamiento
fileHandler.action('cancel_processing', async (ctx) => {
  await ctx.answerCbQuery();

  // Extraer ruta del archivo del mensaje anterior si es posible
  const callbackData =
    ctx.callbackQuery.message?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
  if (callbackData && callbackData.startsWith('process_confirmed:')) {
    const filePath = callbackData.split(':')[1];
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  await ctx.editMessageText(
    '❌ Procesamiento cancelado.\n\nEl archivo ha sido eliminado.',
    MainKeyboard.getProcessMenu()
  );
});

// Descargar resultado
fileHandler.action('download_excel', async (ctx) => {
  await ctx.answerCbQuery();

  const session = ctx.session;
  if (!session?.resultFilePath || !fs.existsSync(session.resultFilePath)) {
    await ctx.reply('❌ No hay archivo de resultados disponible.', MainKeyboard.getProcessMenu());
    return;
  }

  try {
    await ctx.replyWithDocument(
      { source: session.resultFilePath },
      {
        caption: '📊 Resultados del procesamiento de expedientes',
        reply_markup: MainKeyboard.getProcessMenu().reply_markup,
      }
    );

    // Limpiar referencia
    session.resultFilePath = undefined;
  } catch (error) {
    Logger.error(
      'Error enviando archivo de resultados',
      {
        tenantId: session.tenant?.id,
        metadata: { filePath: session.resultFilePath },
      },
      error as Error
    );

    await ctx.reply('❌ Error enviando archivo de resultados.', MainKeyboard.getErrorMenu(true));
  }
});

// Procesar nuevo archivo
fileHandler.action('process_new', async (ctx) => {
  await ctx.answerCbQuery();

  // Limpiar archivo anterior si existe
  if (ctx.session?.resultFilePath && fs.existsSync(ctx.session.resultFilePath)) {
    fs.unlinkSync(ctx.session.resultFilePath);
    ctx.session.resultFilePath = undefined;
  }

  await ctx.editMessageText(
    '📎 **Subir Nuevo Archivo**\n\n' + 'Por favor, envía tu nuevo archivo Excel para procesar.',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getBackButton('process_expedientes'),
    }
  );

  ctx.session.waitingForFile = true;
});

export default fileHandler;
