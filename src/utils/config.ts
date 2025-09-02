import * as dotenv from 'dotenv';
import { AppConfig } from '../types';

// Cargar variables de entorno
dotenv.config();

export const config: AppConfig = {
  bot: {
    token: process.env.BOT_TOKEN || '',
    username: process.env.BOT_USERNAME || 'ExpedientesIKEBot',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  portal: {
    url: process.env.IKE_PORTAL_URL || 'https://portalproveedores.ikeasistencia.com',
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '30000'),
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'IKE-TELEGRAM-BOT-2024-SECURE-KEY',
  },
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS === 'true',
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '30000'),
  },
  cron: {
    enabled: process.env.ENABLE_CRON_JOBS === 'true',
    revalidationSchedule: process.env.REVALIDATION_CRON || '0 6 * * *', // 6 AM diario
  },
  limits: {
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '30'),
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '50'),
  },
};

// Validar configuración requerida
export function validateConfig(): void {
  const required = ['BOT_TOKEN', 'DATABASE_URL'];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${missing.join(', ')}`);
  }

  if (!config.bot.token) {
    throw new Error('BOT_TOKEN es requerido');
  }

  if (!config.database.url) {
    throw new Error('DATABASE_URL es requerido');
  }

  console.log('✅ Configuración validada correctamente');
}

export default config;
