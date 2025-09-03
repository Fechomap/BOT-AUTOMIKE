import puppeteer, { Browser, Page } from 'puppeteer';
import { existsSync } from 'fs';

export interface IkePortalConfig {
  username: string;
  password: string;
  headless?: boolean;
  timeout?: number;
}

export interface ExpedienteSearchResult {
  encontrado: boolean;
  costoSistema: number;
  fechaRegistro?: string;
  servicio?: string;
  subservicio?: string;
  error?: string;
}

export class IkePortalService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: IkePortalConfig;
  private isLoggedIn = false;

  constructor(config: IkePortalConfig) {
    this.config = {
      headless: true,
      timeout: 30000,
      ...config
    };
  }

  /**
   * Verifica que el frame principal esté disponible de manera segura
   */
  private async waitForMainFrame(): Promise<void> {
    if (!this.page) return;
    
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      try {
        const mainFrame = this.page.mainFrame();
        if (mainFrame) {
          console.log('✅ Frame principal disponible');
          return;
        }
      } catch (error) {
        console.log(`⏳ Esperando frame principal (intento ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }
    
    throw new Error('Frame principal no disponible después de múltiples intentos');
  }

  /**
   * Espera a que la página se estabilice y el frame principal esté disponible
   */
  private async waitForStableNavigation(): Promise<void> {
    if (!this.page) return;
    
    let attempts = 0;
    const maxAttempts = 15; // Aumentar intentos
    
    while (attempts < maxAttempts) {
      try {
        // Esperar un momento antes de verificar
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Verificar que el frame principal esté disponible
        try {
          const mainFrame = this.page.mainFrame();
          if (!mainFrame) {
            throw new Error('Main frame not available');
          }
        } catch (frameError) {
          console.log(`⏳ Frame principal no disponible (intento ${attempts + 1}/${maxAttempts})`);
          attempts++;
          continue;
        }
        
        // Intentar obtener el título - si falla, la página aún se está cargando
        await this.page.title();
        
        // Verificar que podemos acceder a elementos del DOM
        await this.page.evaluate(() => document.readyState);
        
        // Si llegamos aquí, la página está estable
        console.log('📋 Página y frame principal estables');
        return;
        
      } catch (error) {
        attempts++;
        console.log(`⏳ Esperando estabilización (intento ${attempts}/${maxAttempts}): ${(error as Error).message}`);
        
        if (attempts >= maxAttempts) {
          console.log('⚠️ Página puede no estar completamente estable, continuando con precaución...');
          return;
        }
      }
    }
  }

  /**
   * Detecta automáticamente la ruta del ejecutable de Chrome/Chromium
   * Prioriza Google Chrome sobre Chromium
   */
  private getChromiumExecutablePath(): string | null {
    const possiblePaths = [
      // macOS - Chrome primero
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      
      // Windows - Chrome primero  
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Chromium\\Application\\chromium.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chromium.exe',
      
      // Linux (Docker/Railway) - Chrome primero si está disponible
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    console.log('⚠️ No se encontró Chrome/Chromium instalado, usando Puppeteer default');
    return null;
  }

  /**
   * Inicializa el navegador y hace login
   */
  async initialize(): Promise<void> {
    console.log('🚀 Inicializando navegador...');
    
    // Configuración base
    const launchOptions: any = {
      headless: this.config.headless, // Usar configuración del constructor
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=VizDisplayCompositor',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-crash-reporter',
        '--disable-ipc-flooding-protection'
        // Removidos --single-process y --no-zygote que causan problemas con frames
      ],
      defaultViewport: { width: 1200, height: 800 },
      timeout: 60000
    };

    // Auto-detectar ejecutable de Chrome/Chromium por plataforma
    const executablePath = this.getChromiumExecutablePath();
    if (executablePath) {
      launchOptions.executablePath = executablePath;
      console.log(`🌐 Usando navegador: ${executablePath}`);
    }

    // En desarrollo local, usar ventana maximizada
    if (process.env.NODE_ENV !== 'production') {
      launchOptions.args.push('--start-maximized');
      launchOptions.defaultViewport = null;
    }

    this.browser = await puppeteer.launch(launchOptions);

    this.page = await this.browser.newPage();
    
    // Configurar viewport y user agent
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await this.login();
  }

  /**
   * Realiza login en el Portal IKE
   */
  private async login(): Promise<void> {
    if (!this.page) throw new Error('Navegador no inicializado');

    console.log('🔐 Iniciando sesión en Portal IKE...');

    try {
      // Navegar a la página de login con manejo robusto de frames
      await this.page.goto('https://portalproveedores.ikeasistencia.com', {
        waitUntil: 'networkidle2', // Esperar a que la red esté inactiva
        timeout: this.config.timeout
      });

      console.log('📄 Página de login cargada, esperando estabilización...');

      // Esperar a que la página se estabilice y no haya más navegación
      await this.waitForStableNavigation();

      // Verificar que el frame principal esté disponible antes de continuar
      await this.waitForMainFrame();

      console.log('✅ Página estabilizada y frame principal disponible, buscando campos de login...');
      
      // Buscar cualquier input de texto primero
      const inputs = await this.page.$$('input');
      console.log(`📋 Encontrados ${inputs.length} campos de input`);
      
      if (inputs.length === 0) {
        throw new Error('No se encontraron campos de input en la página');
      }

      // Usar los selectores exactos de la aplicación original
      const usernameSelectors = [
        'input[formcontrolname="username"]', // Selector principal de la app original
        'input[type="text"]',
        'input[name*="user"]',
        'input[id*="user"]'
      ];
      
      const passwordSelectors = [
        'input[formcontrolname="password"]', // Selector principal de la app original
        'input[type="password"]',
        'input[name*="pass"]',
        'input[id*="pass"]'
      ];
      
      // Buscar campos con el método original más simple
      let usernameSelector = '';
      let passwordSelector = '';
      
      // Buscar campo de usuario
      for (const selector of usernameSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            console.log(`✅ Campo usuario encontrado con: ${selector}`);
            usernameSelector = selector;
            break;
          }
        } catch {}
      }
      
      // Buscar campo de contraseña
      for (const selector of passwordSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            console.log(`✅ Campo contraseña encontrado con: ${selector}`);
            passwordSelector = selector;
            break;
          }
        } catch {}
      }
      
      if (!usernameSelector || !passwordSelector) {
        // Hacer screenshot para debug
        await this.page.screenshot({ path: 'temp/login-page.png' });
        throw new Error(`No se encontraron los campos de login. Usuario: ${!!usernameSelector}, Contraseña: ${!!passwordSelector}`);
      }

      // Introducir credenciales con delay como la app original
      await this.page.type(usernameSelector, this.config.username, { delay: 30 });
      await this.page.type(passwordSelector, this.config.password, { delay: 30 });

      console.log('✍️ Credenciales introducidas');

      // Hacer click en submit como la app original
      await this.page.click('button[type="submit"]');

      // Esperar navegación igual que la app original
      await this.page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });

      // Verificar login exitoso como la app original
      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('input[formcontrolname="password"]');
      });

      if (!isLoggedIn) {
        throw new Error('Credenciales incorrectas o error en login');
      }

      console.log('✅ Login exitoso');
      this.isLoggedIn = true;

    } catch (error) {
      console.error('❌ Error en login:', error);
      
      // Verificar si el navegador/página aún están disponibles
      if (!this.browser || this.browser.process()?.killed) {
        console.error('🔥 Navegador fue cerrado inesperadamente');
        throw new Error('Navegador cerrado durante login');
      }
      
      if (!this.page || this.page.isClosed()) {
        console.error('🔥 Página fue cerrada inesperadamente');
        throw new Error('Página cerrada durante login');
      }
      
      throw new Error(`Error en login: ${(error as Error).message}`);
    }
  }

  /**
   * Acepta el costo de un expediente encontrado
   */
  async acceptCost(): Promise<boolean> {
    if (!this.page || !this.isLoggedIn) {
      throw new Error('Servicio no inicializado o no autenticado');
    }

    console.log('💰 Intentando aceptar costo del expediente...');

    try {
      // Buscar y hacer clic en el botón de aceptar (basado en la app principal)
      const buttonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const acceptButton = buttons.find(button => {
          const td = button.closest('td');
          return button.querySelector('.mat-mdc-button-touch-target') &&
                 td &&
                 td.cellIndex === 0;
        });
        if (acceptButton) {
          (acceptButton as HTMLButtonElement).click();
          return true;
        }
        return false;
      });

      if (!buttonClicked) {
        console.log('❌ No se encontró el botón de aceptar');
        return false;
      }

      console.log('✅ Botón aceptar clickeado, esperando modal...');
      await this.page.waitForTimeout(2000);

      // Confirmar en el modal (basado en la app principal)
      const confirmed = await this.page.evaluate(() => {
        const modalButtons = Array.from(document.querySelectorAll('.cdk-overlay-container button'));
        const confirmButton = modalButtons.find(button =>
          button.textContent?.trim().toLowerCase().includes('aceptar')
        );
        if (confirmButton) {
          (confirmButton as HTMLButtonElement).click();
          return true;
        }
        return false;
      });

      if (confirmed) {
        console.log('✅ Expediente aceptado exitosamente');
        await this.page.waitForTimeout(3000);
        return true;
      } else {
        console.log('❌ No se pudo confirmar la aceptación en el modal');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error durante la aceptación:', error);
      return false;
    }
  }

  /**
   * Busca un expediente en el sistema
   */
  async searchExpediente(numeroExpediente: string): Promise<ExpedienteSearchResult> {
    if (!this.page || !this.isLoggedIn) {
      throw new Error('Servicio no inicializado o no autenticado');
    }

    console.log(`🔍 Buscando expediente: ${numeroExpediente}`);

    try {
      // Solo navegar si no estamos ya en la página correcta (optimización de velocidad)
      if (!this.page.url().includes('portalproveedores.ikeasistencia.com')) {
        console.log('📍 Navegando a página de búsqueda...');
        await this.page.goto('https://portalproveedores.ikeasistencia.com/admin/services/pendientes', {
          waitUntil: 'networkidle2',
          timeout: this.config.timeout
        });
        await this.page.waitForTimeout(1500);
      } else {
        console.log('📍 Ya en página de búsqueda, saltando navegación');
      }

      // Usar los selectores exactos de la app original para búsqueda
      const inputSelectors = [
        'input[placeholder="No. Expediente:*"]',
        'input[formcontrolname="expediente"]',
        'input.mat-mdc-input-element',
        'input[type="text"]'
      ];

      let inputSelector = '';
      for (const sel of inputSelectors) {
        try {
          const element = await this.page.$(sel);
          if (element) {
            console.log(`✅ Campo de búsqueda encontrado con: ${sel}`);
            inputSelector = sel;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!inputSelector) {
        throw new Error('No se encontró el campo de búsqueda de expediente');
      }

      // Limpiar y escribir número de expediente como la app original
      await this.page.click(inputSelector, { clickCount: 3 });
      await this.page.waitForTimeout(300);
      await this.page.evaluate((sel) => { 
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) el.value = '';
      }, inputSelector);

      // Escribir con delay como la app original
      for (const char of numeroExpediente.toString()) {
        await this.page.keyboard.type(char, { delay: 50 });
      }
      await this.page.waitForTimeout(300);

      // Buscar y hacer click en botón como la app original
      const searchButton = await this.page.$$eval('button', (buttons) => {
        return buttons.find(btn => btn.textContent?.includes('Buscar'));
      });

      if (searchButton) {
        console.log('🔍 Botón buscar encontrado, haciendo click...');
        await searchButton.click();
      } else {
        console.log('🔍 Botón buscar no encontrado, usando Enter...');
        await this.page.keyboard.press('Enter');
      }

      // Esperar resultados con timeout más conservador
      try {
        await this.page.waitForSelector('table tbody tr, .no-results', { timeout: 5000 });
      } catch (err) {
        console.log('⚠️ No se encontró tabla de resultados');
      }

      await this.page.waitForTimeout(1000);

      // Verificar si el expediente fue encontrado
      const notFoundSelectors = [
        'text="No se encontraron resultados"',
        'text="Expediente no encontrado"',
        '.no-results',
        '.empty-results'
      ];

      let encontrado = true;
      for (const selector of notFoundSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 1000 });
          encontrado = false;
          break;
        } catch {
          // Selector no encontrado, continuar
        }
      }

      if (!encontrado) {
        console.log(`❌ Expediente ${numeroExpediente} no encontrado`);
        return {
          encontrado: false,
          costoSistema: 0,
          error: 'Expediente no encontrado en el sistema'
        };
      }

      // Extraer información del expediente
      const expedienteInfo = await this.extractExpedienteInfo();
      
      console.log(`✅ Expediente ${numeroExpediente} encontrado - Costo: $${expedienteInfo.costoSistema}`);
      
      return {
        encontrado: true,
        ...expedienteInfo
      };

    } catch (error) {
      console.error(`❌ Error buscando expediente ${numeroExpediente}:`, error);
      return {
        encontrado: false,
        costoSistema: 0,
        error: `Error en búsqueda: ${(error as Error).message}`
      };
    }
  }

  /**
   * Extrae información del expediente de la página
   */
  private async extractExpedienteInfo(): Promise<Omit<ExpedienteSearchResult, 'encontrado'>> {
    if (!this.page) throw new Error('Página no inicializada');

    try {
      // Buscar tabla de resultados o contenedor de información
      await this.page.waitForSelector('table, .expediente-info, .resultado', { timeout: 5000 });

      // Extraer costo del sistema igual que la app original
      const costoSistema = await this.page.evaluate(() => {
        const row = document.querySelector('table tbody tr');
        if (!row) return 0;

        const cells = row.querySelectorAll('td');
        
        // Verificar si hay contenido en la celda del costo (columna 3, index 2)
        const tieneContenido = cells[2] && 
                             cells[2].textContent && 
                             cells[2].textContent.trim() !== '' && 
                             cells[2].textContent.trim() !== '$0.00' &&
                             cells[2].textContent.trim() !== '$0';
        
        if (!tieneContenido) {
          return 0;
        }

        // Extraer costo de la columna 3 (index 2)
        const costoTexto = cells[2] ? cells[2].textContent?.trim().replace('$', '').replace(',', '') || '0' : '0';
        return parseFloat(costoTexto) || 0;
      });

      // Extraer información adicional si está disponible
      const fechaRegistro = await this.page.evaluate(() => {
        const dateElements = document.querySelectorAll('td, span, div');
        for (let i = 0; i < dateElements.length; i++) {
          const element = dateElements[i];
          const text = element.textContent || '';
          // Buscar fechas en formato DD/MM/YYYY o similar
          const dateMatch = text.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
          if (dateMatch) return dateMatch[0];
        }
        return '';
      });

      return {
        costoSistema: costoSistema || 0,
        fechaRegistro: fechaRegistro || undefined,
        servicio: 'Portal IKE',
        subservicio: 'Consulta automatizada'
      };

    } catch (error) {
      console.error('❌ Error extrayendo información:', error);
      return {
        costoSistema: 0,
        error: `Error extrayendo datos: ${(error as Error).message}`
      };
    }
  }

  /**
   * Cierra el navegador
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log('🔒 Navegador cerrado');
    }
  }

  /**
   * Verifica si el servicio está inicializado y autenticado
   */
  isReady(): boolean {
    return this.browser !== null && this.page !== null && this.isLoggedIn;
  }
}