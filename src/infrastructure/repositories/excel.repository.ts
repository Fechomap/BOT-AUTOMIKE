import { ExcelRepository } from '../../application/use-cases/process-excel.use-case';
import { Expediente } from '../../domain/entities/expediente.entity';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';

export class ExcelRepositoryImpl implements ExcelRepository {
  async readFile(filePath: string): Promise<Expediente[]> {
    console.log(`📖 Leyendo Excel: ${filePath}`);

    try {
      // Leer archivo Excel con ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('No se encontró ninguna hoja en el archivo Excel');
      }

      // Convertir a array de arrays
      const data: any[][] = [];
      worksheet.eachRow((row) => {
        const rowData: any[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          rowData.push(cell.value);
        });
        data.push(rowData);
      });

      const expedientes: Expediente[] = [];

      // Procesar filas (saltar header si existe)
      let startRow = 0;

      // Detectar si hay header
      if (data.length > 0 && data[0]) {
        const firstRowText = String(data[0][0]).toLowerCase();
        if (
          firstRowText.includes('expediente') ||
          firstRowText.includes('numero') ||
          firstRowText.includes('folio')
        ) {
          startRow = 1; // Saltar header
          console.log('📋 Header detectado, saltando primera fila');
        }
      }

      // Procesar filas
      for (let i = startRow; i < data.length; i++) {
        const row = data[i];

        if (!row || row.length === 0) continue;

        const numero = this.cleanValue(row[0]);
        const costo = this.parseNumber(row[1]);

        if (numero) {
          expedientes.push(new Expediente(numero, costo));
        }
      }

      console.log(`✅ Leídos ${expedientes.length} expedientes del archivo`);
      return expedientes;
    } catch (error) {
      console.error('❌ Error leyendo Excel:', error);
      throw new Error(`Error leyendo archivo Excel: ${(error as Error).message}`);
    }
  }

  async writeResults(results: any[], fileName: string): Promise<string> {
    const outputPath = `temp/${fileName}`;

    try {
      // Crear directorio si no existe
      if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp');
      }

      // Crear workbook con ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Resultados');

      // Agregar headers si hay resultados
      if (results.length > 0) {
        const headers = Object.keys(results[0]);
        worksheet.addRow(headers);

        // Agregar datos
        results.forEach((result) => {
          const row = headers.map((header) => result[header]);
          worksheet.addRow(row);
        });
      }

      // Escribir archivo
      await workbook.xlsx.writeFile(outputPath);

      console.log(`✅ Archivo Excel generado: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('❌ Error generando Excel:', error);
      throw new Error(`Error generando archivo Excel: ${(error as Error).message}`);
    }
  }

  private cleanValue(value: any): string {
    if (!value) return '';
    return String(value).trim();
  }

  private parseNumber(value: any): number {
    if (!value) return 0;
    const num = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    return isNaN(num) ? 0 : num;
  }
}
