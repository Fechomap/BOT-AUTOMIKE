import puppeteer, { Browser, Page } from 'puppeteer';
import { Logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { AutomationResult } from '../../types';

export interface CredentialsData {
  username: string;
  password: string;
}

export interface AutomationOptions {
  headless?: boolean;
  timeout?: number;
  retries?: number;
}

export class AutomationService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly portalUrl = config.portal.url;
  private readonly timeout = config.portal.timeout;

  constructor(private options: AutomationOptions = {}) {
    this.options = {
      headless: options.headless ?? config.puppeteer.headless,
      timeout: options.timeout ?? config.puppeteer.timeout,
      retries: options.retries ?? 3,
    };
  }

  /**
   * Inicializa el navegador
   */
  async initializeBrowser(): Promise<void> {
    try {
      Logger.automation('Inicializando navegador', {});

      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        defaultViewport: null,
        args: [
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
        timeout: this.timeout,
      });

      this.page = await this.browser.newPage();
      await this.page.setDefaultNavigationTimeout(this.timeout);
      await this.page.setDefaultTimeout(this.timeout);

      Logger.automation('✅ Navegador inicializado correctamente', {});
    } catch (error) {
      Logger.error('Error inicializando navegador', {}, error as Error);
      throw new Error(`Error inicializando navegador: ${(error as Error).message}`);
    }
  }

  /**
   * Realiza login en el portal IKE
   */
  async login(credentials: CredentialsData): Promise<void> {
    if (!this.page) {
      throw new Error('Navegador no inicializado');
    }

    try {
      Logger.automation('Iniciando proceso de login', {
        metadata: { username: credentials.username },
      });

      // Navegar al portal
      await this.page.goto(this.portalUrl, {
        waitUntil: 'networkidle2',
        timeout: this.timeout,
      });

      // Esperar elementos de login
      await this.page.waitForSelector('input[formcontrolname="username"]', {
        timeout: this.timeout,
      });
      await this.page.waitForSelector('input[formcontrolname="password"]', {
        timeout: this.timeout,
      });

      // Ingresar credenciales
      await this.page.type('input[formcontrolname="username"]', credentials.username, {
        delay: 30,
      });
      await this.page.type('input[formcontrolname="password"]', credentials.password, {
        delay: 30,
      });

      // Hacer click en login
      await this.page.click('button[type="submit"]');

      // Esperar navegación
      await this.page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: this.timeout,
      });

      // Verificar login exitoso
      const isLoggedIn = await this.page.evaluate(() => {
        return !document.querySelector('input[formcontrolname="password"]');
      });

      if (!isLoggedIn) {
        throw new Error('Credenciales incorrectas');
      }

      Logger.automation('✅ Login completado exitosamente', {});
    } catch (error) {
      Logger.error('Error en login', {}, error as Error);
      throw new Error(`Error en login: ${(error as Error).message}`);
    }
  }

  /**
   * Busca un expediente específico
   */
  async searchExpediente(numeroExpediente: string): Promise<AutomationResult> {
    if (!this.page) {
      throw new Error('Navegador no inicializado');
    }

    const startTime = Date.now();

    try {
      Logger.automation(`Buscando expediente ${numeroExpediente}`, {
        expedienteNum: numeroExpediente,
      });

      // Navegar a página de búsqueda
      await this.navigateToSearchPage();

      // Realizar búsqueda
      await this.performSearch(numeroExpediente);

      // Extraer resultados
      const result = await this.extractSearchResults(numeroExpediente);

      const processingTime = Date.now() - startTime;
      Logger.automation(`✅ Búsqueda completada para ${numeroExpediente}`, {
        expedienteNum: numeroExpediente,
        metadata: {
          found: result.found,
          processingTime: `${processingTime}ms`,
        },
      });

      return {
        ...result,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      Logger.error(
        'Error buscando expediente',
        {
          expedienteNum: numeroExpediente,
        },
        error as Error
      );

      return {
        expedienteNum: numeroExpediente,
        found: false,
        liberado: false,
        error: (error as Error).message,
        processingTime,
      };
    }
  }

  /**
   * Libera un expediente automáticamente
   */
  async liberarExpediente(numeroExpediente: string): Promise<boolean> {
    if (!this.page) {
      throw new Error('Navegador no inicializado');
    }

    try {
      Logger.automation(`Liberando expediente ${numeroExpediente}`, {
        expedienteNum: numeroExpediente,
      });

      // Buscar botón de aceptar en la primera columna
      const acceptButton = await this.page.$eval('table tbody tr', (row) => {
        const buttons = row.querySelectorAll('button');
        for (let i = 0; i < buttons.length; i++) {
          const button = buttons[i];
          const parentTd = button.closest('td');
          if (parentTd && (parentTd as HTMLTableCellElement).cellIndex === 0) {
            return true;
          }
        }
        return false;
      });

      if (!acceptButton) {
        throw new Error('No se encontró el botón de aceptar');
      }

      // Hacer click en el botón de aceptar
      await this.page.evaluate(() => {
        const row = document.querySelector('table tbody tr');
        if (row) {
          const buttons = row.querySelectorAll('button');
          for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            const parentTd = button.closest('td');
            if (parentTd && (parentTd as HTMLTableCellElement).cellIndex === 0) {
              (button as HTMLElement).click();
              return;
            }
          }
        }
      });

      // Esperar modal de confirmación
      await this.page.waitForTimeout(2000);

      // Buscar y hacer click en confirmación del modal
      const confirmClicked = await this.page.evaluate(() => {
        const modalButtons = document.querySelectorAll('.cdk-overlay-container button');
        for (let i = 0; i < modalButtons.length; i++) {
          const button = modalButtons[i];
          if (button.textContent?.trim().toLowerCase().includes('aceptar')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!confirmClicked) {
        throw new Error('No se pudo confirmar la liberación');
      }

      // Esperar que se complete la liberación
      await this.page.waitForTimeout(3000);

      Logger.automation(`✅ Expediente ${numeroExpediente} liberado exitosamente`, {
        expedienteNum: numeroExpediente,
      });

      return true;
    } catch (error) {
      Logger.error(
        'Error liberando expediente',
        {
          expedienteNum: numeroExpediente,
        },
        error as Error
      );
      return false;
    }
  }

  /**
   * Navega a la página de búsqueda
   */
  private async navigateToSearchPage(): Promise<void> {
    if (!this.page) return;

    try {
      const searchUrl = `${this.portalUrl}/admin/services/pendientes`;

      // Solo navegar si no estamos ya en la página correcta
      if (!this.page.url().includes('portalproveedores.ikeasistencia.com')) {
        await this.page.goto(searchUrl, {
          waitUntil: 'networkidle2',
          timeout: this.timeout,
        });

        await this.page.waitForTimeout(1500);
      }

      // Verificar que el campo de búsqueda esté disponible
      const inputSelectors = [
        'input[placeholder="No. Expediente:*"]',
        'input[formcontrolname="expediente"]',
        'input.mat-mdc-input-element',
        'input[type="text"]',
      ];

      let inputFound = false;
      for (const selector of inputSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          inputFound = true;
          break;
        } catch (error) {
          continue;
        }
      }

      if (!inputFound) {
        throw new Error('No se encontró el campo de búsqueda');
      }
    } catch (error) {
      throw new Error(`Error navegando a página de búsqueda: ${(error as Error).message}`);
    }
  }

  /**
   * Realiza la búsqueda del expediente
   */
  private async performSearch(numeroExpediente: string): Promise<void> {
    if (!this.page) return;

    try {
      // Buscar el campo de entrada con múltiples selectores
      const inputSelectors = [
        'input[placeholder="No. Expediente:*"]',
        'input[formcontrolname="expediente"]',
        'input.mat-mdc-input-element',
        'input[type="text"]',
      ];

      let inputElement: any = null;
      for (const selector of inputSelectors) {
        try {
          inputElement = await this.page.$(selector);
          if (inputElement) {
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!inputElement) {
        throw new Error('No se encontró el campo de búsqueda');
      }

      // Limpiar campo
      await inputElement.click({ clickCount: 3 });
      await this.page.waitForTimeout(300);
      await this.page.evaluate((el) => {
        (el as HTMLInputElement).value = '';
      }, inputElement);

      // Escribir número de expediente
      for (const char of numeroExpediente.toString()) {
        await this.page.keyboard.type(char, { delay: 50 });
      }
      await this.page.waitForTimeout(300);

      // Buscar botón de búsqueda
      const searchButtonExists = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (let i = 0; i < buttons.length; i++) {
          const button = buttons[i];
          if (button.textContent?.includes('Buscar')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!searchButtonExists) {
        await this.page.keyboard.press('Enter');
      }

      // Esperar resultados
      try {
        await this.page.waitForSelector('table tbody tr, .no-results', {
          timeout: 5000,
        });
      } catch (error) {
        // No hay problema si no hay resultados
      }

      await this.page.waitForTimeout(1500);
    } catch (error) {
      throw new Error(`Error realizando búsqueda: ${(error as Error).message}`);
    }
  }

  /**
   * Extrae los resultados de la búsqueda
   */
  private async extractSearchResults(numeroExpediente: string): Promise<AutomationResult> {
    if (!this.page) {
      return {
        expedienteNum: numeroExpediente,
        found: false,
        liberado: false,
      };
    }

    try {
      // Verificar si hay resultados en la tabla
      const hasResults = (await this.page.$('table tbody tr')) !== null;

      if (!hasResults) {
        return {
          expedienteNum: numeroExpediente,
          found: false,
          liberado: false,
        };
      }

      // Extraer datos de la tabla
      const result = await this.page.evaluate(() => {
        const row = document.querySelector('table tbody tr');
        if (!row) return null;

        const cells = row.querySelectorAll('td');

        // Verificar que hay contenido en la celda de costo (columna 2)
        const tieneContenido =
          cells[2] &&
          cells[2].textContent &&
          cells[2].textContent.trim() !== '' &&
          cells[2].textContent.trim() !== '$0.00' &&
          cells[2].textContent.trim() !== '$0';

        if (!tieneContenido) {
          return null;
        }

        // Extraer datos de las celdas
        const costoSistema = cells[2]
          ? cells[2].textContent.trim().replace('$', '').replace(',', '')
          : '0';

        const estatus = cells[3] ? cells[3].textContent.trim() : '';
        const notas = cells[4] ? cells[4].textContent.trim() : '';
        const fechaRegistro = cells[5] ? cells[5].textContent.trim() : '';
        const servicio = cells[6] ? cells[6].textContent.trim() : '';
        const subservicio = cells[7] ? cells[7].textContent.trim() : '';

        return {
          costoSistema: parseFloat(costoSistema) || 0,
          estatus,
          notas,
          fechaRegistro,
          servicio,
          subservicio,
        };
      });

      if (!result) {
        return {
          expedienteNum: numeroExpediente,
          found: false,
          liberado: false,
        };
      }

      return {
        expedienteNum: numeroExpediente,
        found: true,
        liberado: false, // Se determina en el servicio de procesamiento
        costoSistema: result.costoSistema,
        servicio: result.servicio,
        subservicio: result.subservicio,
      };
    } catch (error) {
      Logger.error(
        'Error extrayendo resultados',
        {
          expedienteNum: numeroExpediente,
        },
        error as Error
      );

      return {
        expedienteNum: numeroExpediente,
        found: false,
        liberado: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Cierra el navegador
   */
  async closeBrowser(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        Logger.automation('🔌 Navegador cerrado', {});
      }
    } catch (error) {
      Logger.error('Error cerrando navegador', {}, error as Error);
    }
  }

  /**
   * Verifica si el navegador está activo
   */
  isActive(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Reinicia el navegador si hay problemas
   */
  async restart(): Promise<void> {
    await this.closeBrowser();
    await this.initializeBrowser();
  }
}

export default AutomationService;
