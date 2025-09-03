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
  
  // Las credenciales IKE ahora se configuran por tenant
  console.log('🔐 Sistema multitenant iniciado - credenciales se configuran por empresa');
  
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