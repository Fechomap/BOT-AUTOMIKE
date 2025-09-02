import { Composer } from 'telegraf';
import { CredentialRepository } from '../../database/repositories/credential.repository';
import { MainKeyboard } from '../keyboards/main.keyboard';
import { Logger } from '../../utils/logger';

const credentialRepo = new CredentialRepository();

export const textHandler = new Composer();

// Handler para mensajes de texto
textHandler.on('text', async (ctx) => {
  const session = ctx.session;
  const text = ctx.message.text;

  if (!session) {
    await ctx.reply('Por favor usa /start para comenzar.', MainKeyboard.getAuthMenu());
    return;
  }

  try {
    // Configuración de credenciales
    if (session.waitingForCredentials) {
      await handleCredentialsInput(ctx, text, session);
      return;
    }

    // Respuesta genérica para mensajes no esperados
    if (session.tenant) {
      await ctx.reply(
        '❓ No entendí ese mensaje.\n\n' +
          'Usa los botones del menú para navegar o /help para obtener ayuda.',
        MainKeyboard.getMainMenu()
      );
    } else {
      await ctx.reply(
        'Para comenzar, necesitas registrarte o iniciar sesión.',
        MainKeyboard.getAuthMenu()
      );
    }
  } catch (error) {
    Logger.error(
      'Error procesando mensaje de texto',
      {
        telegramId: ctx.from?.id.toString(),
        tenantId: session.tenant?.id,
      },
      error as Error
    );

    await ctx.reply('❌ Error procesando tu mensaje.', MainKeyboard.getErrorMenu(true));
  }
});

async function handleCredentialsInput(ctx: any, text: string, session: any) {
  try {
    // Eliminar el mensaje del usuario por seguridad
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Ignorar si no se puede eliminar
    }

    // Validar formato usuario:contraseña
    const credentialMatch = text.match(/^([^:]+):(.+)$/);
    if (!credentialMatch) {
      await ctx.reply(
        '❌ **Formato inválido**\n\n' +
          'Usa el formato: `usuario:contraseña`\n\n' +
          'Ejemplo: `juan.perez:mipassword123`\n\n' +
          'Intenta nuevamente:',
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getBackButton('config_menu', '❌ Cancelar'),
        }
      );
      return;
    }

    const [, username, password] = credentialMatch;

    // Validar longitud mínima
    if (username.trim().length < 3 || password.trim().length < 6) {
      await ctx.reply(
        '❌ **Credenciales muy cortas**\n\n' +
          'El usuario debe tener al menos 3 caracteres\n' +
          'La contraseña debe tener al menos 6 caracteres\n\n' +
          'Intenta nuevamente:',
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getBackButton('config_menu', '❌ Cancelar'),
        }
      );
      return;
    }

    // Mensaje de guardando
    const savingMessage = await ctx.reply('⏳ **Guardando credenciales...**\n\nPor favor espera.', {
      parse_mode: 'Markdown',
    });

    // Guardar en base de datos
    await credentialRepo.upsert(session.tenant.id, username.trim(), password.trim());

    // Actualizar mensaje de confirmación
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      savingMessage.message_id,
      undefined,
      '✅ **Credenciales guardadas**\n\n' +
        `**Usuario:** ${username.trim()}\n` +
        `**Estado:** Configurado correctamente\n\n` +
        '🔒 Las credenciales han sido encriptadas y almacenadas de forma segura.\n\n' +
        'Ahora puedes procesar expedientes automáticamente.',
      {
        parse_mode: 'Markdown',
        ...MainKeyboard.getConfigMenu(),
      }
    );

    // Limpiar flag
    session.waitingForCredentials = false;

    Logger.database('Credenciales configuradas via bot', {
      tenantId: session.tenant.id,
      metadata: { username: username.trim() },
    });
  } catch (error) {
    Logger.error(
      'Error guardando credenciales',
      {
        tenantId: session.tenant?.id,
      },
      error as Error
    );

    await ctx.reply(
      '❌ **Error guardando credenciales**\n\n' +
        'Hubo un problema al guardar tus credenciales.\n' +
        'Por favor, intenta nuevamente.',
      {
        parse_mode: 'Markdown',
        ...MainKeyboard.getErrorMenu(true),
      }
    );

    session.waitingForCredentials = false;
  }
}

// Handler para comandos de texto directo
textHandler.hears('📊 Procesar', async (ctx) => {
  if (ctx.session?.tenant) {
    await ctx.reply(
      '📊 **Procesamiento de Expedientes**\n\n' + 'Sube tu archivo Excel para comenzar.',
      {
        parse_mode: 'Markdown',
        ...MainKeyboard.getProcessMenu(),
      }
    );
  } else {
    await ctx.reply('Debes iniciar sesión primero.', MainKeyboard.getAuthMenu());
  }
});

textHandler.hears('📈 Estadísticas', async (ctx) => {
  if (ctx.session?.tenant) {
    // Redirigir a handler de estadísticas
    ctx.callbackQuery = { data: 'stats_menu' } as any;
    await ctx.reply('📈 Cargando estadísticas...');
  } else {
    await ctx.reply('Debes iniciar sesión primero.', MainKeyboard.getAuthMenu());
  }
});

textHandler.hears('⚙️ Configuración', async (ctx) => {
  if (ctx.session?.tenant) {
    await ctx.reply('⚙️ **Configuración**\n\n' + 'Gestiona tu cuenta y preferencias.', {
      parse_mode: 'Markdown',
      ...MainKeyboard.getConfigMenu(),
    });
  } else {
    await ctx.reply('Debes iniciar sesión primero.', MainKeyboard.getAuthMenu());
  }
});

textHandler.hears('ℹ️ Ayuda', async (ctx) => {
  await ctx.reply(
    'ℹ️ **Ayuda del Bot**\n\n' + 'Usa /help para ver todos los comandos disponibles.',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getBackButton('main_menu'),
    }
  );
});

export default textHandler;
