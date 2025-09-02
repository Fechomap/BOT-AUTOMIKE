import { ExcelRepository } from '../../application/use-cases/process-excel.use-case';
import { Expediente } from '../../domain/entities/expediente.entity';
import * as fs from 'fs';

// Mock de XLSX hasta instalarlo
const XLSX = {
  readFile: (path: string) => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
  utils: {
    sheet_to_json: () => [
      ['Expediente', 'Costo'],
      ['12345', 100],
      ['67890', 200],
      ['11111', 300]
    ],
    json_to_sheet: (data: any) => ({}),
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: () => {}
};

export class ExcelRepositoryImpl implements ExcelRepository {
  
  async readFile(filePath: string): Promise<Expediente[]> {
    console.log(`📖 Leyendo Excel: ${filePath}`);
    
    // Por ahora mock data hasta instalar xlsx
    const mockData = [
      ['Expediente', 'Costo'],
      ['20938913', 100],
      ['20944855', 200], 
      ['20937075', 300],
      ['20932261', 500],
      ['20943831', 600],
      ['20934310', 800]
    ];
    
    const expedientes: Expediente[] = [];
    
    // Procesar filas (saltar header)
    for (let i = 1; i < mockData.length; i++) {
      const row = mockData[i];
      const numero = this.cleanValue(row[0]);
      const costo = this.parseNumber(row[1]);
      
      if (numero) {
        expedientes.push(new Expediente(numero, costo));
      }
    }
    
    console.log(`✅ Leídos ${expedientes.length} expedientes`);
    return expedientes;
  }
  
  async writeResults(results: any[], fileName: string): Promise<string> {
    const outputPath = `temp/${fileName}`;
    
    // Por ahora crear archivo simple hasta instalar xlsx
    const jsonData = JSON.stringify(results, null, 2);
    
    // Crear directorio si no existe
    if (!fs.existsSync('temp')) {
      fs.mkdirSync('temp');
    }
    
    fs.writeFileSync(outputPath.replace('.xlsx', '.json'), jsonData);
    
    console.log(`✅ Archivo generado: ${outputPath}`);
    return outputPath.replace('.xlsx', '.json');
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