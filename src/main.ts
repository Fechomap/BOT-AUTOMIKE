import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { BotController } from './presentation/controllers/bot.controller';
import { ProcessExcelUseCase } from './application/use-cases/process-excel.use-case';
import { ExcelRepositoryImpl } from './infrastructure/repositories/excel.repository';
import { SistemaRepositoryImpl } from './infrastructure/repositories/sistema.repository';

// Configuración
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN no configurado');
  process.exit(1);
}

// Dependency Injection (Simple Factory)
async function createBotController(): Promise<BotController> {
  const bot = new Telegraf(BOT_TOKEN!);
  
  // Repositories (Infrastructure)
  const excelRepo = new ExcelRepositoryImpl();
  const sistemaRepo = new SistemaRepositoryImpl();
  
  // Configurar credenciales para automatización (sin inicializar el navegador aún)
  const ikeUsername = process.env.IKE_USERNAME;
  const ikePassword = process.env.IKE_PASSWORD;
  
  if (!ikeUsername || !ikePassword) {
    console.error('❌ Credenciales IKE no configuradas');
    console.error('Configure IKE_USERNAME y IKE_PASSWORD en el archivo .env');
    process.exit(1);
  }

  console.log('🔐 Credenciales IKE configuradas (navegador se abrirá al procesar Excel)');
  sistemaRepo.setCredentials({
    username: ikeUsername,
    password: ikePassword,
    headless: process.env.IKE_HEADLESS === 'true'
  });
  
  // Use Cases (Application)
  const processExcelUseCase = new ProcessExcelUseCase(excelRepo, sistemaRepo);
  
  // Controller (Presentation)
  return new BotController(bot, processExcelUseCase);
}

// Main
async function main() {
  try {
    const botController = await createBotController();
    await botController.launch();
  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  }
}

main();