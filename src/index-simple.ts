import { Telegraf } from 'telegraf';
import { config, validateConfig } from './utils/config';
import { Logger } from './utils/logger';
import DatabaseClient from './database/prisma/client-simple';

async function bootstrap() {
  try {
    // Validar configuración
    validateConfig();
    Logger.info('🚀 Iniciando bot de Expedientes IKE...');

    // Conectar a la base de datos
    await DatabaseClient.connect();

    // Crear el bot
    const bot = new Telegraf(config.bot.token);

    // Comandos básicos
    bot.start(async (ctx) => {
      await ctx.reply(
        '🤖 **¡Bot de Expedientes IKE!**\n\n' +
          '✨ El bot está funcionando correctamente.\n\n' +
          '🚧 **Estado:** En desarrollo\n' +
          '📅 **Versión:** 1.0.0\n\n' +
          'Próximamente todas las funcionalidades estarán disponibles.',
        { parse_mode: 'Markdown' }
      );
    });

    bot.help(async (ctx) => {
      await ctx.reply(
        '📋 **Bot de Expedientes IKE**\n\n' +
          '**Comandos disponibles:**\n' +
          '• `/start` - Iniciar el bot\n' +
          '• `/help` - Mostrar ayuda\n' +
          '• `/status` - Estado del sistema\n\n' +
          '**Funcionalidades (próximamente):**\n' +
          '• 📊 Procesamiento de Excel\n' +
          '• ⚙️ Validación automática\n' +
          '• 🤖 Liberación de expedientes\n' +
          '• 📈 Estadísticas y reportes',
        { parse_mode: 'Markdown' }
      );
    });

    bot.command('status', async (ctx) => {
      const isHealthy = await DatabaseClient.healthCheck();
      await ctx.reply(
        `🔧 **Estado del Sistema**\n\n` +
          `• Bot: ✅ Activo\n` +
          `• Base de datos: ${isHealthy ? '✅' : '❌'} ${isHealthy ? 'Conectada' : 'Desconectada'}\n` +
          `• Entorno: ${process.env.NODE_ENV || 'development'}\n` +
          `• Versión: 1.0.0\n\n` +
          `Última actualización: ${new Date().toLocaleString('es-ES')}`,
        { parse_mode: 'Markdown' }
      );
    });

    // Error handling
    bot.catch((err: any, _ctx: any) => {
      Logger.error('Error en el bot', {}, err);
      console.error('Error:', err);
    });

    // Iniciar el bot
    await bot.launch();
    Logger.info('✅ Bot iniciado correctamente');

    // Graceful shutdown
    process.once('SIGINT', () => {
      Logger.info('🛑 Cerrando bot (SIGINT)...');
      bot.stop('SIGINT');
    });

    process.once('SIGTERM', () => {
      Logger.info('🛑 Cerrando bot (SIGTERM)...');
      bot.stop('SIGTERM');
    });

    // Health check endpoint para Railway
    const express = require('express');
    const app = express();
    const port = process.env.PORT || 3000;

    app.get('/health', async (req: any, res: any) => {
      const isDbHealthy = await DatabaseClient.healthCheck();

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: isDbHealthy ? 'connected' : 'disconnected',
        bot: 'running',
        version: '1.0.0',
      });
    });

    app.get('/', (req: any, res: any) => {
      res.json({
        message: 'Bot de Expedientes IKE',
        status: 'running',
        version: '1.0.0',
      });
    });

    app.listen(port, () => {
      Logger.info(`🌐 Servidor web iniciado en puerto ${port}`);
    });

    Logger.info('🎉 Sistema iniciado completamente');
  } catch (error) {
    Logger.error('❌ Error fatal al iniciar el bot', {}, error as Error);
    process.exit(1);
  }
}

// Iniciar la aplicación
bootstrap().catch((error) => {
  console.error('Error no manejado:', error);
  process.exit(1);
});
