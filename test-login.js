const puppeteer = require('puppeteer');

async function testLogin() {
  console.log('🚀 Probando login al Portal IKE...');
  
  const browser = await puppeteer.launch({
    headless: false, // Visible para ver qué pasa
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  
  try {
    // Navegar a la página de login
    console.log('📄 Navegando a Portal IKE...');
    await page.goto('https://portalproveedores.ikeasistencia.com', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    console.log('✅ Página cargada exitosamente');
    console.log('URL actual:', page.url());
    
    // Esperar 5 segundos para ver la página
    await page.waitForTimeout(5000);
    
    // Buscar campos de login
    const usernameField = await page.$('input[type="text"], input[name*="user"], input[id*="user"]');
    const passwordField = await page.$('input[type="password"]');
    
    if (usernameField && passwordField) {
      console.log('✅ Campos de login encontrados');
      
      // Introducir credenciales
      await page.type('input[type="text"], input[name*="user"], input[id*="user"]', 'jonathan.vargas@troyasis.com');
      await page.type('input[type="password"]', '123456');
      
      console.log('✍️ Credenciales introducidas');
      
      // Esperar 3 segundos antes de hacer submit
      await page.waitForTimeout(3000);
      
    } else {
      console.log('❌ No se encontraron campos de login');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  // Mantener navegador abierto por 10 segundos más
  console.log('⏳ Manteniendo navegador abierto 10 segundos más...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('🔒 Navegador cerrado');
}

testLogin();