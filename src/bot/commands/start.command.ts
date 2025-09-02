import { Composer } from 'telegraf';
import '../../types/session';
import { AuthService } from '../../services/auth.service';
import { MainKeyboard } from '../keyboards/main.keyboard';
import { Logger } from '../../utils/logger';

const authService = new AuthService();

export const startCommand = new Composer();

startCommand.start(async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    Logger.bot('Comando /start ejecutado', telegramId, undefined, { telegramId });

    // Verificar si ya está autenticado
    const isAuthenticated = await authService.isUserAuthenticated(telegramId);

    if (isAuthenticated) {
      const { tenant } = await authService.getCurrentSession(telegramId);

      await ctx.reply(
        `¡Bienvenido de nuevo! 👋\n\n` +
          `🏢 **Empresa:** ${tenant?.businessName}\n` +
          `📧 **Email:** ${tenant?.email}\n\n` +
          `¿Qué te gustaría hacer hoy?`,
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getMainMenu(),
        }
      );
    } else {
      await ctx.reply(
        '🤖 **¡Bienvenido al Bot de Expedientes IKE!**\n\n' +
          '📋 **¿Qué puedo hacer por ti?**\n' +
          '• ✅ Validar expedientes automáticamente\n' +
          '• 📊 Procesar archivos Excel\n' +
          '• 🚀 Liberar expedientes según tus lógicas\n' +
          '• 📈 Generar estadísticas y reportes\n' +
          '• 🔄 Revalidación automática diaria\n\n' +
          '**Para comenzar, necesitas registrarte o iniciar sesión:**',
        {
          parse_mode: 'Markdown',
          ...MainKeyboard.getAuthMenu(),
        }
      );
    }
  } catch (error) {
    Logger.error(
      'Error en comando start',
      {
        telegramId: ctx.from?.id.toString(),
      },
      error as Error
    );

    await ctx.reply(
      '❌ Error interno. Por favor, intenta nuevamente o contacta soporte.',
      MainKeyboard.getErrorMenu(true)
    );
  }
});

export default startCommand;
