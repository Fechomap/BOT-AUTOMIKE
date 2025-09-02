import { ExcelRepository } from '../../application/use-cases/process-excel.use-case';
import { Expediente } from '../../domain/entities/expediente.entity';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

export class ExcelRepositoryImpl implements ExcelRepository {
  
  async readFile(filePath: string): Promise<Expediente[]> {
    console.log(`📖 Leyendo Excel: ${filePath}`);
    
    try {
      // Leer archivo Excel
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convertir a array de arrays
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      const expedientes: Expediente[] = [];
      
      // Procesar filas (saltar header si existe)
      let startRow = 0;
      
      // Detectar si hay header
      if (data.length > 0 && data[0]) {
        const firstRowText = String(data[0][0]).toLowerCase();
        if (firstRowText.includes('expediente') || firstRowText.includes('numero') || firstRowText.includes('folio')) {
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
      
      // Crear workbook y worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(results);
      
      // Agregar worksheet al workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');
      
      // Escribir archivo
      XLSX.writeFile(workbook, outputPath);
      
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