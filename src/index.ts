import { Telegraf, session, Scenes } from 'telegraf';
import { config, validateConfig } from './utils/config';
import { Logger } from './utils/logger';
import DatabaseClient from './database/prisma/client';
import JobService from './services/job.service';

// Importar comandos y handlers
import { startCommand } from './bot/commands/start.command';
import { authScenes, authHandlers } from './bot/scenes/auth.scene';
import { mainHandler } from './bot/handlers/main.handler';
import { fileHandler } from './bot/handlers/file.handler';
import { textHandler } from './bot/handlers/text.handler';

async function bootstrap() {
  try {
    // Validar configuración
    validateConfig();
    Logger.info('🚀 Iniciando bot de Expedientes IKE...');

    // Conectar a la base de datos
    await DatabaseClient.connect();

    // Inicializar sistema de jobs
    const jobService = new JobService();
    await jobService.initializeJobs();

    // Crear el bot
    const bot = new Telegraf(config.bot.token);

    // Configurar sesiones y scenes
    bot.use(session() as any);
    bot.use((authScenes as any).middleware());

    // Middleware de logging
    bot.use(async (ctx, next) => {
      const start = Date.now();
      Logger.bot(
        `Mensaje recibido: ${ctx.message ? 'text' : 'callback'}`,
        ctx.from?.id.toString() || 'unknown'
      );

      await next();

      const responseTime = Date.now() - start;
      Logger.bot(`Procesado en ${responseTime}ms`, ctx.from?.id.toString() || 'unknown');
    });

    // Configurar handlers y comandos
    bot.use(startCommand);
    bot.use(mainHandler);
    bot.use(fileHandler);
    bot.use(textHandler);

    // Configurar handlers de autenticación
    bot.action('auth_register', authHandlers.handleRegister);
    bot.action('auth_login', authHandlers.handleLogin);
    bot.action('logout', authHandlers.handleLogout);
    bot.action('cancel_auth', (ctx: any) => {
      if (ctx.scene) {
        return ctx.scene.leave();
      }
    });

    // Comando de ayuda
    bot.help(async (ctx) => {
      await ctx.reply(
        'ℹ️ **Ayuda del Bot de Expedientes IKE**\n\n' +
          '**Comandos disponibles:**\n' +
          '• `/start` - Iniciar el bot\n' +
          '• `/help` - Mostrar esta ayuda\n' +
          '• `/status` - Estado del sistema\n\n' +
          '**Características principales:**\n' +
          '• ✅ Validación automática de expedientes\n' +
          '• 📊 Procesamiento de archivos Excel\n' +
          '• 🔧 Múltiples lógicas de liberación\n' +
          '• 📈 Estadísticas y reportes\n' +
          '• 🔄 Revalidación automática\n' +
          '• 🔐 Multi-tenancy seguro\n\n' +
          '**Para comenzar:**\n' +
          '1. Regístrate o inicia sesión\n' +
          '2. Configura tus credenciales del portal IKE\n' +
          '3. Sube tu archivo Excel\n' +
          '4. ¡Listo! El bot procesará automáticamente',
        { parse_mode: 'Markdown' }
      );
    });

    bot.command('status', async (ctx) => {
      const isHealthy = await DatabaseClient.healthCheck();
      await ctx.reply(
        `🔧 *Estado del Sistema*\n\n` +
          `• Bot: ✅ Activo\n` +
          `• Base de datos: ${isHealthy ? '✅' : '❌'} ${isHealthy ? 'Conectada' : 'Desconectada'}\n` +
          `• Entorno: ${process.env.NODE_ENV || 'development'}\n` +
          `• Versión: 1.0.0\n\n` +
          `Última actualización: ${new Date().toLocaleString('es-ES')}`,
        { parse_mode: 'Markdown' }
      );
    });

    // Error handling
    bot.catch((err: any, ctx: any) => {
      Logger.error(
        `Error en el bot: ${(err as Error).message}`,
        {
          telegramId: ctx.from?.id.toString(),
          action: 'bot_error',
          metadata: {
            updateType: ctx.updateType,
            message: ctx.message,
          },
        },
        err as Error
      );
    });

    // Iniciar el bot
    await bot.launch();
    Logger.info('✅ Bot iniciado correctamente');

    // Graceful shutdown
    process.once('SIGINT', () => {
      Logger.info('🛑 Recibida señal SIGINT, cerrando bot...');
      bot.stop('SIGINT');
    });

    process.once('SIGTERM', () => {
      Logger.info('🛑 Recibida señal SIGTERM, cerrando bot...');
      bot.stop('SIGTERM');
    });

    // Cleanup on exit
    process.on('beforeExit', async () => {
      jobService.stopAllJobs();
      await DatabaseClient.disconnect();
    });

    // Health check endpoint for Railway
    const express = require('express');
    const app = express();
    const port = process.env.PORT || 3000;

    app.get('/health', async (_req: any, res: any) => {
      const isDbHealthy = await DatabaseClient.healthCheck();
      const jobsStatus = jobService.getJobsStatus();

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: isDbHealthy ? 'connected' : 'disconnected',
        bot: 'running',
        jobs: {
          total: jobsStatus.length,
          running: jobService.getRunningJobs().length,
          scheduled: jobsStatus.filter((j) => j.isScheduled).length,
        },
      });
    });

    app.listen(port, () => {
      Logger.info(`Health check server running on port ${port}`);
    });

    Logger.info('🎉 Bot de Expedientes IKE listo para usar');
  } catch (error) {
    Logger.error('❌ Error fatal al iniciar el bot', {}, error as Error);
    process.exit(1);
  }
}

// Iniciar la aplicación
bootstrap().catch((error) => {
  Logger.error('❌ Error no manejado', {}, error as Error);
  process.exit(1);
});
