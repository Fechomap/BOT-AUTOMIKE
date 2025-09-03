#!/usr/bin/env node

// Script para instalar Chromium bajo demanda en Railway
const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔍 Verificando si necesitamos Chromium...');

// Solo instalar si no existe ya
if (fs.existsSync('/usr/bin/chromium') || fs.existsSync('/opt/google/chrome/chrome')) {
  console.log('✅ Chromium ya está disponible en el sistema');
  process.exit(0);
}

console.log('📦 Instalando Chromium para Puppeteer...');
try {
  execSync('apt-get update && apt-get install -y --no-install-recommends chromium', { 
    stdio: 'inherit',
    timeout: 300000 // 5 minutos timeout
  });
  console.log('✅ Chromium instalado correctamente');
} catch (error) {
  console.warn('⚠️ Error instalando Chromium, continuando sin él:', error.message);
  console.log('💡 El bot funcionará con funcionalidades limitadas');
}