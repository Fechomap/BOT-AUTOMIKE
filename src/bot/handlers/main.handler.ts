import { Composer } from 'telegraf';
import { AuthService } from '../../services/auth.service';
import { ExpedienteRepository } from '../../database/repositories/expediente.repository';
import { CredentialRepository } from '../../database/repositories/credential.repository';
import { MainKeyboard } from '../keyboards/main.keyboard';
import { Logger } from '../../utils/logger';

const authService = new AuthService();
const expedienteRepo = new ExpedienteRepository();
const credentialRepo = new CredentialRepository();

export const mainHandler = new Composer();

// Middleware para verificar autenticación
mainHandler.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    const telegramId = ctx.from?.id.toString();
    if (telegramId) {
      const isAuthenticated = await authService.isUserAuthenticated(telegramId);

      if (
        !isAuthenticated &&
        !ctx.callbackQuery.data?.startsWith('auth_') &&
        !ctx.callbackQuery.data?.includes('help') &&
        !ctx.callbackQuery.data?.includes('cancel')
      ) {
        await ctx.answerCbQuery('❌ Debes iniciar sesión primero');
        await ctx.editMessageText(
          'Necesitas iniciar sesión para usar esta función.',
          MainKeyboard.getAuthMenu()
        );
        return;
      }

      // Agregar sesión al contexto
      if (isAuthenticated) {
        const session = await authService.getCurrentSession(telegramId);
        ctx.session = {
          user: session.user,
          tenant: session.tenant,
        };
      }
    }
  }

  await next();
});

// Menú principal
mainHandler.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();

  const session = ctx.session;
  if (!session?.tenant) {
    await ctx.editMessageText(
      'Sesión expirada. Por favor, inicia sesión nuevamente.',
      MainKeyboard.getAuthMenu()
    );
    return;
  }

  await ctx.editMessageText(
    `🏠 **Menú Principal**\n\n` +
      `🏢 **Empresa:** ${session.tenant.businessName}\n` +
      `📧 **Email:** ${session.tenant.email}\n\n` +
      `¿Qué te gustaría hacer?`,
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getMainMenu(),
    }
  );
});

// Procesar expedientes
mainHandler.action('process_expedientes', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    '📊 **Procesamiento de Expedientes**\n\n' +
      'Opciones disponibles:\n\n' +
      '📎 **Subir Excel** - Carga tu archivo con expedientes\n' +
      '⚙️ **Configurar Lógicas** - Ajusta las reglas de validación\n' +
      '🔄 **Estado Actual** - Ver procesamiento en curso\n\n' +
      '*Formatos de Excel soportados:*\n' +
      '• Formato estándar (columnas A-J)\n' +
      '• Formato simple (Expediente + Costo)',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getProcessMenu(),
    }
  );
});

// Subir Excel
mainHandler.action('upload_excel', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    '📎 **Subir Archivo Excel**\n\n' +
      'Por favor, envía tu archivo Excel con los expedientes a procesar.\n\n' +
      '📋 **Formatos aceptados:**\n' +
      '• **.xlsx** (recomendado)\n' +
      '• **.xls** (compatible)\n\n' +
      '📊 **Estructura esperada:**\n' +
      '• **Columna A:** Número de expediente\n' +
      '• **Columna B:** Costo guardado (opcional)\n\n' +
      '⚠️ **Límites:**\n' +
      '• Máximo 50MB por archivo\n' +
      '• Hasta 10,000 filas por procesamiento\n\n' +
      '*Envía el archivo como documento adjunto.*',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getBackButton('process_expedientes', '⬅️ Atrás'),
    }
  );

  // Marcar que estamos esperando un archivo
  ctx.session.waitingForFile = true;
});

// Configurar lógicas
mainHandler.action('config_logicas', async (ctx) => {
  await ctx.answerCbQuery();

  const session = ctx.session;
  if (!session?.tenant) return;

  // Por ahora usar configuración por defecto
  // En implementación real, obtener de base de datos
  const logica2Enabled = session.logica2Enabled || false;
  const logica3Enabled = session.logica3Enabled || false;

  await ctx.editMessageText(
    '⚙️ **Configuración de Lógicas de Validación**\n\n' +
      '**Lógicas disponibles:**\n\n' +
      '✅ **Lógica 1 - Costo Exacto** *(Siempre activa)*\n' +
      '   Se libera si el costo coincide exactamente\n\n' +
      `${logica2Enabled ? '☑️' : '☐'} **Lógica 2 - Margen ±10%**\n` +
      '   Se libera si está dentro del ±10% del costo\n\n' +
      `${logica3Enabled ? '☑️' : '☐'} **Lógica 3 - Costo Superior**\n` +
      '   Se libera si el costo del sistema es mayor\n\n' +
      '*Selecciona las lógicas que quieres activar:*',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getLogicasMenu(logica2Enabled, logica3Enabled),
    }
  );
});

// Toggle lógica 2
mainHandler.action('toggle_logica_2', async (ctx) => {
  await ctx.answerCbQuery('Lógica 2 actualizada');

  ctx.session.logica2Enabled = !ctx.session.logica2Enabled;

  // Refrescar menú
  const logica2Enabled = ctx.session.logica2Enabled;
  const logica3Enabled = ctx.session.logica3Enabled || false;

  await ctx.editMessageReplyMarkup(
    MainKeyboard.getLogicasMenu(logica2Enabled, logica3Enabled).reply_markup
  );
});

// Toggle lógica 3
mainHandler.action('toggle_logica_3', async (ctx) => {
  await ctx.answerCbQuery('Lógica 3 actualizada');

  ctx.session.logica3Enabled = !ctx.session.logica3Enabled;

  // Refrescar menú
  const logica2Enabled = ctx.session.logica2Enabled || false;
  const logica3Enabled = ctx.session.logica3Enabled;

  await ctx.editMessageReplyMarkup(
    MainKeyboard.getLogicasMenu(logica2Enabled, logica3Enabled).reply_markup
  );
});

// Guardar configuración de lógicas
mainHandler.action('save_logicas', async (ctx) => {
  await ctx.answerCbQuery('✅ Configuración guardada');

  const logica2 = ctx.session.logica2Enabled || false;
  const logica3 = ctx.session.logica3Enabled || false;

  await ctx.editMessageText(
    '✅ **Configuración Guardada**\n\n' +
      '**Lógicas activas:**\n\n' +
      '✅ **Costo Exacto** - Siempre activa\n' +
      `${logica2 ? '✅' : '❌'} **Margen ±10%** - ${logica2 ? 'Activa' : 'Inactiva'}\n` +
      `${logica3 ? '✅' : '❌'} **Costo Superior** - ${logica3 ? 'Activa' : 'Inactiva'}\n\n` +
      'Ahora puedes procesar expedientes con estas reglas.',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getProcessMenu(),
    }
  );
});

// Configuración general
mainHandler.action('config_menu', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    '⚙️ **Configuración**\n\n' +
      'Gestiona la configuración de tu cuenta y preferencias:\n\n' +
      '🔐 **Credenciales Portal IKE** - Configura tu acceso al sistema\n' +
      '⚡ **Lógicas Predeterminadas** - Configura validaciones por defecto\n' +
      '🔔 **Notificaciones** - Gestiona alertas y reportes\n' +
      '📊 **Mi Cuenta** - Información de tu empresa',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getConfigMenu(),
    }
  );
});

// Configurar credenciales
mainHandler.action('config_credentials', async (ctx) => {
  await ctx.answerCbQuery();

  const session = ctx.session;
  if (!session?.tenant) return;

  const credentials = await credentialRepo.findActiveByTenant(session.tenant.id);
  const hasCredentials = !!credentials;

  await ctx.editMessageText(
    '🔐 **Credenciales Portal IKE**\n\n' +
      `**Estado:** ${hasCredentials ? '✅ Configuradas' : '❌ No configuradas'}\n` +
      `**Usuario:** ${hasCredentials ? credentials.username : 'No configurado'}\n\n` +
      '⚠️ **Importante:**\n' +
      'Estas credenciales se usan para acceder automáticamente al portal de IKE y procesar expedientes.\n\n' +
      '🔒 Todas las credenciales se almacenan de forma encriptada.\n\n' +
      'Para configurar o actualizar tus credenciales, responde con tu información en este formato:\n\n' +
      '`usuario:contraseña`\n\n' +
      '*Ejemplo: juan.perez:mipassword123*',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getBackButton('config_menu'),
    }
  );

  ctx.session.waitingForCredentials = true;
});

// Estadísticas
mainHandler.action('stats_menu', async (ctx) => {
  await ctx.answerCbQuery();

  const session = ctx.session;
  if (!session?.tenant) return;

  try {
    // Obtener estadísticas generales
    const stats = await expedienteRepo.getStatsByTenant(session.tenant.id);

    await ctx.editMessageText(
      '📈 **Estadísticas**\n\n' +
        '📊 **Resumen General:**\n' +
        `• Total procesados: ${stats.total}\n` +
        `• Liberados: ${stats.liberados} (${stats.tasaLiberacion.toFixed(1)}%)\n` +
        `• Pendientes: ${stats.pendientes}\n` +
        `• No encontrados: ${stats.noEncontrados}\n\n` +
        '🎯 **Por Lógica:**\n' +
        `• Costo exacto: ${stats.porLogica.logica1}\n` +
        `• Margen ±10%: ${stats.porLogica.logica2}\n` +
        `• Costo superior: ${stats.porLogica.logica3}\n\n` +
        'Selecciona una opción para ver más detalles:',
      {
        parse_mode: 'Markdown',
        ...MainKeyboard.getStatsMenu(),
      }
    );
  } catch (error) {
    Logger.error(
      'Error obteniendo estadísticas',
      {
        tenantId: session.tenant.id,
      },
      error as Error
    );

    await ctx.editMessageText('❌ Error obteniendo estadísticas.', MainKeyboard.getErrorMenu(true));
  }
});

// Ayuda
mainHandler.action('help_menu', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    'ℹ️ **Ayuda y Soporte**\n\n' +
      '**🤖 Bot de Expedientes IKE**\n' +
      'Versión 1.0.0\n\n' +
      '**📋 ¿Cómo funciona?**\n' +
      '1. Sube tu archivo Excel con expedientes\n' +
      '2. Configura las lógicas de validación\n' +
      '3. El bot procesa y libera automáticamente\n' +
      '4. Descarga el archivo con resultados\n\n' +
      '**🔧 Comandos disponibles:**\n' +
      '• `/start` - Iniciar el bot\n' +
      '• `/help` - Mostrar ayuda\n' +
      '• `/status` - Estado del sistema\n\n' +
      '**📞 Soporte:**\n' +
      'Si tienes problemas, contacta al equipo técnico.',
    {
      parse_mode: 'Markdown',
      ...MainKeyboard.getBackButton('main_menu', '🏠 Menú Principal'),
    }
  );
});

// Cancelar operación
mainHandler.action('cancel', async (ctx) => {
  await ctx.answerCbQuery();

  // Limpiar flags de espera
  if (ctx.session) {
    ctx.session.waitingForFile = false;
    ctx.session.waitingForCredentials = false;
  }

  await ctx.editMessageText('❌ Operación cancelada.', MainKeyboard.getMainMenu());
});

export default mainHandler;
