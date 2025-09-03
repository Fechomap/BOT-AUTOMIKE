import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { BotController } from './presentation/controllers/bot.controller';
import { ProcessExcelUseCase } from './application/use-cases/process-excel.use-case';
import { CargaExpedientesUseCase } from './application/use-cases/carga-expedientes.use-case';
import { RevalidacionCronJobUseCase } from './application/use-cases/revalidacion-cronjob.use-case';
import { ExcelRepositoryImpl } from './infrastructure/repositories/excel.repository';
import { SistemaRepositoryImpl } from './infrastructure/repositories/sistema.repository';
import { PrismaExpedienteRepository } from './infrastructure/repositories/expediente.repository';
import { SistemaServiceAdapter } from './infrastructure/adapters/sistema-service.adapter';

// Configuración
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN no configurado');
  process.exit(1);
}

// Dependency Injection (Simple Factory)
async function createBotController(): Promise<BotController> {
  const bot = new Telegraf(BOT_TOKEN!);

  // Database
  const prisma = new PrismaClient();

  // Repositories (Infrastructure)
  const excelRepo = new ExcelRepositoryImpl();
  const sistemaRepo = new SistemaRepositoryImpl();
  const expedienteRepository = new PrismaExpedienteRepository(prisma);

  // Las credenciales IKE ahora se configuran por tenant
  console.log('🔐 Sistema multitenant iniciado - credenciales se configuran por empresa');

  // Use Cases (Application)
  const processExcelUseCase = new ProcessExcelUseCase(excelRepo, sistemaRepo);
  const sistemaServiceAdapter = new SistemaServiceAdapter(sistemaRepo);
  const cargaExpedientesUseCase = new CargaExpedientesUseCase(
    expedienteRepository,
    sistemaServiceAdapter,
    excelRepo
  );
  const revalidacionUseCase = new RevalidacionCronJobUseCase(
    expedienteRepository,
    sistemaServiceAdapter
  );

  // Controller (Presentation)
  return new BotController(
    bot,
    processExcelUseCase,
    cargaExpedientesUseCase,
    revalidacionUseCase,
    expedienteRepository
  );
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
