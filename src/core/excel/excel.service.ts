import * as ExcelJS from 'exceljs';
import { Logger } from '../../utils/logger';
import { ExcelFormat, ExcelProcessingResult } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

export interface ExcelData {
  expediente: string;
  costoGuardado?: number;
}

export interface ExcelProcessingOptions {
  skipEmptyRows?: boolean;
  validateNumbers?: boolean;
  maxRows?: number;
}

export class ExcelService {
  private static readonly TEMP_DIR = 'temp';
  private static readonly RESULTS_DIR = 'results';

  constructor() {
    // Crear directorios si no existen
    this.ensureDirectories();
  }

  /**
   * Lee un archivo Excel y extrae los datos
   */
  async readExcelFile(
    filePath: string,
    options: ExcelProcessingOptions = {}
  ): Promise<ExcelData[]> {
    try {
      Logger.info(`Leyendo archivo Excel: ${filePath}`);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        throw new Error('El archivo Excel no tiene hojas de trabajo');
      }

      const data: ExcelData[] = [];
      const maxRows = options.maxRows || 10000;
      let processedRows = 0;

      // Detectar formato del Excel
      const format = this.detectExcelFormat(worksheet);
      Logger.info(`Formato detectado: ${format.type}`, {
        metadata: { hasHeaders: format.hasHeaders },
      });

      // Comenzar desde la fila 2 si tiene headers, sino desde la 1
      const startRow = format.hasHeaders ? 2 : 1;
      const endRow = Math.min(worksheet.rowCount, startRow + maxRows - 1);

      for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
        const row = worksheet.getRow(rowNumber);

        if (this.isEmptyRow(row) && options.skipEmptyRows !== false) {
          continue;
        }

        try {
          const rowData = this.parseExcelRow(row, format, options.validateNumbers);
          if (rowData) {
            data.push(rowData);
            processedRows++;
          }
        } catch (error) {
          Logger.warn(`Error procesando fila ${rowNumber}: ${(error as Error).message}`);
          // Continuar con la siguiente fila
        }
      }

      Logger.info(
        `Excel procesado: ${processedRows} filas válidas de ${endRow - startRow + 1} total`
      );
      return data;
    } catch (error) {
      Logger.error('Error leyendo archivo Excel', {}, error as Error);
      throw new Error(`Error procesando Excel: ${(error as Error).message}`);
    }
  }

  /**
   * Genera un archivo Excel con los resultados
   */
  async generateResultsExcel(
    originalData: ExcelData[],
    results: ExcelProcessingResult,
    outputPath: string,
    additionalData?: Array<{
      expediente: string;
      costoSistema?: number;
      validacion?: string;
      notas?: string;
      fechaRegistro?: string;
      servicio?: string;
      subservicio?: string;
      logica?: number;
      fechaValidacion?: string;
    }>
  ): Promise<string> {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Resultados Validación');

      // Configurar columnas
      worksheet.columns = [
        { header: 'Expediente', key: 'expediente', width: 15 },
        { header: 'Costo Guardado', key: 'costoGuardado', width: 15 },
        { header: 'Costo Sistema', key: 'costoSistema', width: 15 },
        { header: 'Validación', key: 'validacion', width: 20 },
        { header: 'Notas', key: 'notas', width: 30 },
        { header: 'Fecha Registro', key: 'fechaRegistro', width: 20 },
        { header: 'Servicio', key: 'servicio', width: 25 },
        { header: 'Subservicio', key: 'subservicio', width: 25 },
        { header: 'Lógica Usada', key: 'logica', width: 15 },
        { header: 'Fecha Validación', key: 'fechaValidacion', width: 20 },
      ];

      // Estilo de headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Agregar datos
      originalData.forEach((item, _index) => {
        const additionalInfo = additionalData?.find((d) => d.expediente === item.expediente);

        const row = worksheet.addRow({
          expediente: item.expediente,
          costoGuardado: item.costoGuardado,
          costoSistema: additionalInfo?.costoSistema || '',
          validacion: additionalInfo?.validacion || 'PENDIENTE',
          notas: additionalInfo?.notas || '',
          fechaRegistro: additionalInfo?.fechaRegistro || '',
          servicio: additionalInfo?.servicio || '',
          subservicio: additionalInfo?.subservicio || '',
          logica: additionalInfo?.logica || '',
          fechaValidacion: additionalInfo?.fechaValidacion || new Date().toLocaleString('es-ES'),
        });

        // Aplicar estilos según el resultado
        const validation = additionalInfo?.validacion;
        if (validation === 'ACEPTADO') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          };
        } else if (validation === 'NO ENCONTRADO') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' },
          };
        } else {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' },
          };
        }
      });

      // Agregar hoja de resumen
      const summarySheet = workbook.addWorksheet('Resumen');
      summarySheet.columns = [
        { header: 'Métrica', key: 'metric', width: 25 },
        { header: 'Valor', key: 'value', width: 15 },
      ];

      const summaryHeaderRow = summarySheet.getRow(1);
      summaryHeaderRow.font = { bold: true };
      summaryHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Datos de resumen
      summarySheet.addRow({ metric: 'Total Expedientes', value: results.totalRows });
      summarySheet.addRow({ metric: 'Procesados', value: results.processedRows });
      summarySheet.addRow({ metric: 'Aceptados', value: results.aceptados });
      summarySheet.addRow({ metric: 'Pendientes', value: results.pendientes });
      summarySheet.addRow({ metric: 'No Encontrados', value: results.noEncontrados });
      summarySheet.addRow({
        metric: 'Tasa de Liberación',
        value: `${((results.aceptados / results.totalRows) * 100).toFixed(2)}%`,
      });
      summarySheet.addRow({
        metric: 'Fecha Procesamiento',
        value: new Date().toLocaleString('es-ES'),
      });

      // Guardar archivo
      await workbook.xlsx.writeFile(outputPath);

      Logger.info(`Archivo de resultados generado: ${outputPath}`);
      return outputPath;
    } catch (error) {
      Logger.error('Error generando archivo de resultados', {}, error as Error);
      throw new Error(`Error generando resultados: ${(error as Error).message}`);
    }
  }

  /**
   * Detecta el formato del archivo Excel
   */
  private detectExcelFormat(worksheet: ExcelJS.Worksheet): ExcelFormat {
    const firstRow = worksheet.getRow(1);

    // Verificar si la primera fila son headers
    const firstCell = this.getCellValue(firstRow, 1);
    const secondCell = this.getCellValue(firstRow, 2);

    const hasHeaders =
      typeof firstCell === 'string' &&
      (firstCell.toLowerCase().includes('expediente') || firstCell.toLowerCase().includes('num')) &&
      typeof secondCell === 'string' &&
      (secondCell.toLowerCase().includes('costo') || secondCell.toLowerCase().includes('precio'));

    // Detectar si es formato simple (solo 2 columnas) o estándar
    const columnsUsed = this.getUsedColumns(worksheet);
    const isSimple = columnsUsed <= 2;

    return {
      type: isSimple ? 'simple' : 'standard',
      hasHeaders,
      columns: {
        expediente: 'A',
        costo: 'B',
      },
    };
  }

  /**
   * Parsea una fila del Excel según el formato
   */
  private parseExcelRow(
    row: ExcelJS.Row,
    format: ExcelFormat,
    validateNumbers: boolean = true
  ): ExcelData | null {
    const expedienteValue = this.getCellValue(row, 1);
    const costoValue = this.getCellValue(row, 2);

    // Validar expediente
    if (!expedienteValue) {
      return null;
    }

    const expediente = expedienteValue.toString().trim();
    if (!expediente) {
      return null;
    }

    // Validar que el expediente sea numérico
    if (validateNumbers && !/^\d+$/.test(expediente)) {
      throw new Error(`Expediente inválido: ${expediente} - debe ser numérico`);
    }

    // Procesar costo
    let costoGuardado: number | undefined;
    if (costoValue !== null && costoValue !== undefined && costoValue !== '') {
      const costoNum =
        typeof costoValue === 'number'
          ? costoValue
          : parseFloat(costoValue.toString().replace(/,/g, ''));

      if (isNaN(costoNum)) {
        if (validateNumbers) {
          throw new Error(`Costo inválido para expediente ${expediente}: ${costoValue}`);
        }
      } else {
        costoGuardado = costoNum;
      }
    }

    return {
      expediente,
      costoGuardado,
    };
  }

  /**
   * Obtiene el valor de una celda
   */
  private getCellValue(row: ExcelJS.Row, column: number): any {
    const cell = row.getCell(column);
    return cell.value;
  }

  /**
   * Verifica si una fila está vacía
   */
  private isEmptyRow(row: ExcelJS.Row): boolean {
    const expediente = this.getCellValue(row, 1);
    return !expediente || expediente.toString().trim() === '';
  }

  /**
   * Cuenta las columnas utilizadas en la hoja
   */
  private getUsedColumns(worksheet: ExcelJS.Worksheet): number {
    let maxColumn = 0;

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const colNum = typeof cell.col === 'string' ? parseInt(cell.col, 10) : cell.col;
        if (colNum > maxColumn) {
          maxColumn = colNum;
        }
      });
    });

    return maxColumn;
  }

  /**
   * Crea los directorios necesarios
   */
  private ensureDirectories(): void {
    const dirs = [ExcelService.TEMP_DIR, ExcelService.RESULTS_DIR];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        Logger.info(`Directorio creado: ${dir}`);
      }
    });
  }

  /**
   * Valida un archivo Excel antes de procesarlo
   */
  async validateExcelFile(filePath: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    summary: {
      totalRows: number;
      hasHeaders: boolean;
      format: 'simple' | 'standard';
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Verificar que el archivo existe
      if (!fs.existsSync(filePath)) {
        errors.push('El archivo no existe');
        return {
          isValid: false,
          errors,
          warnings,
          summary: { totalRows: 0, hasHeaders: false, format: 'simple' },
        };
      }

      // Verificar extensión
      const ext = path.extname(filePath).toLowerCase();
      if (!['.xlsx', '.xls'].includes(ext)) {
        errors.push('Formato de archivo no soportado. Use .xlsx or .xls');
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        errors.push('El archivo no contiene hojas de trabajo');
        return {
          isValid: false,
          errors,
          warnings,
          summary: { totalRows: 0, hasHeaders: false, format: 'simple' },
        };
      }

      const format = this.detectExcelFormat(worksheet);
      const totalRows = worksheet.rowCount - (format.hasHeaders ? 1 : 0);

      if (totalRows === 0) {
        errors.push('El archivo no contiene datos');
      }

      if (totalRows > 10000) {
        warnings.push(
          `Archivo muy grande (${totalRows} filas). Se procesarán solo las primeras 10,000`
        );
      }

      // Validar algunas filas de muestra
      const sampleRows = Math.min(5, totalRows);
      const startRow = format.hasHeaders ? 2 : 1;

      for (let i = 0; i < sampleRows; i++) {
        try {
          const row = worksheet.getRow(startRow + i);
          this.parseExcelRow(row, format, true);
        } catch (error) {
          warnings.push(`Fila ${startRow + i}: ${(error as Error).message}`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        summary: {
          totalRows,
          hasHeaders: format.hasHeaders,
          format: format.type,
        },
      };
    } catch (error) {
      errors.push(`Error validando archivo: ${(error as Error).message}`);
      return {
        isValid: false,
        errors,
        warnings,
        summary: { totalRows: 0, hasHeaders: false, format: 'simple' },
      };
    }
  }

  /**
   * Limpia archivos temporales antiguos
   */
  async cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const dirs = [ExcelService.TEMP_DIR, ExcelService.RESULTS_DIR];
      const now = Date.now();

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);

          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlinkSync(filePath);
            Logger.info(`Archivo temporal eliminado: ${filePath}`);
          }
        }
      }
    } catch (error) {
      Logger.error('Error limpiando archivos temporales', {}, error as Error);
    }
  }

  /**
   * Genera nombre único para archivo temporal
   */
  static generateTempFileName(prefix: string, extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(ExcelService.TEMP_DIR, `${prefix}_${timestamp}_${random}.${extension}`);
  }

  /**
   * Genera nombre único para archivo de resultados
   */
  static generateResultFileName(prefix: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(ExcelService.RESULTS_DIR, `${prefix}_${timestamp}_${random}.xlsx`);
  }
}

export default ExcelService;
