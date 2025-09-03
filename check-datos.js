const { PrismaClient } = require('@prisma/client');

async function verificarDatos() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Verificando datos guardados...\n');

    // Verificar expedientes
    const expedientes = await prisma.expediente.findMany({
      where: {
        tenantId: '395e5d22-7be6-478a-9a85-4e2df3117f4b',
      },
      include: {
        versiones: true,
      },
      orderBy: {
        fechaUltimaActualizacion: 'desc',
      },
    });

    console.log(`📊 EXPEDIENTES GUARDADOS: ${expedientes.length}`);
    expedientes.forEach((exp, i) => {
      console.log(`${i + 1}. ${exp.numero} - €${exp.costo} - ${exp.calificacion}`);
      console.log(`   Motivo: ${exp.motivoCalificacion}`);
      console.log(`   Versiones: ${exp.versiones.length}`);
    });

    // Verificar cargas
    const cargas = await prisma.cargaExpedientes.findMany({
      where: {
        tenantId: '395e5d22-7be6-478a-9a85-4e2df3117f4b',
      },
      orderBy: {
        fechaProcesamiento: 'desc',
      },
    });

    console.log(`\n📁 CARGAS REGISTRADAS: ${cargas.length}`);
    cargas.forEach((carga, i) => {
      console.log(`${i + 1}. ${carga.nombreArchivo}`);
      console.log(`   Total: ${carga.totalExpedientes}, Errores: ${carga.errores}`);
      console.log(`   Fecha: ${carga.fechaProcesamiento}`);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verificarDatos();
