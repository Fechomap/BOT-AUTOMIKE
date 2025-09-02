// Tipos principales del sistema
export interface TenantData {
  id: string;
  email: string;
  businessName: string;
  isActive: boolean;
  createdAt: Date;
}

export interface UserData {
  id: string;
  telegramId: string;
  tenantId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
}

export interface ExpedienteData {
  id: string;
  expedienteNum: string;
  costoGuardado?: number;
  costoSistema?: number;
  estado: ExpedienteEstado;
  fechaRegistro?: Date;
  servicio?: string;
  subservicio?: string;
  notas?: string;
}

export interface ValidationData {
  id: string;
  expedienteId: string;
  logicaUsada: LogicaValidacion;
  resultado: ResultadoValidacion;
  costoAnterior?: number;
  costoNuevo?: number;
  fechaValidacion: Date;
}

export interface CredentialData {
  id: string;
  tenantId: string;
  username: string;
  password: string;
  isActive: boolean;
}

// Enums
export enum ExpedienteEstado {
  PENDIENTE = 'PENDIENTE',
  LIBERADO = 'LIBERADO',
  NO_ENCONTRADO = 'NO_ENCONTRADO',
}

export enum LogicaValidacion {
  COSTO_EXACTO = 1,
  MARGEN_10_PORCIENTO = 2,
  COSTO_SUPERIOR = 3,
}

export enum ResultadoValidacion {
  ACEPTADO = 'ACEPTADO',
  PENDIENTE = 'PENDIENTE',
  NO_ENCONTRADO = 'NO_ENCONTRADO',
}


export enum JobType {
  REVALIDATION = 'REVALIDATION',
  CLEANUP = 'CLEANUP',
  EXCEL_PROCESSING = 'EXCEL_PROCESSING',
}

// Interfaces del bot
export interface BotContext {
  user?: UserData;
  tenant?: TenantData;
  session?: BotSession;
}

export interface BotSession {
  step?: string;
  data?: Record<string, any>;
  expiresAt?: Date;
}

export interface ProcessingOptions {
  enableLogica2: boolean; // Margen ±10%
  enableLogica3: boolean; // Costo superior
  notifyProgress: boolean;
}

export interface ExcelProcessingResult {
  totalRows: number;
  processedRows: number;
  aceptados: number;
  pendientes: number;
  noEncontrados: number;
  errors: string[];
  filePath?: string;
}

export interface AutomationResult {
  expedienteNum: string;
  found: boolean;
  liberado: boolean;
  costoSistema?: number;
  servicio?: string;
  subservicio?: string;
  error?: string;
  processingTime?: number;
}

// Configuración
export interface AppConfig {
  bot: {
    token: string;
    username: string;
  };
  database: {
    url: string;
  };
  portal: {
    url: string;
    timeout: number;
  };
  encryption: {
    key: string;
  };
  puppeteer: {
    headless: boolean;
    timeout: number;
  };
  cron: {
    enabled: boolean;
    revalidationSchedule: string;
  };
  limits: {
    maxRequestsPerMinute: number;
    maxFileSizeMB: number;
  };
}

// Mensajes del bot
export interface BotMessage {
  text: string;
  keyboard?: any;
  options?: any;
}

export interface KeyboardButton {
  text: string;
  callback_data: string;
}

export interface ReplyKeyboardButton {
  text: string;
}

// Excel formats
export interface ExcelRow {
  expediente: string;
  costoGuardado?: number;
  costoSistema?: number;
  validacion?: string;
  notas?: string;
  fechaRegistro?: string;
  servicio?: string;
  subservicio?: string;
  logica?: number;
  fechaValidacion?: string;
}

export interface ExcelFormat {
  type: 'standard' | 'simple';
  hasHeaders: boolean;
  columns: {
    expediente: string; // A
    costo: string; // B
  };
}

// API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ProcessingProgress {
  current: number;
  total: number;
  percentage: number;
  currentExpediente?: string;
  errors: number;
}

// Logs
export interface LogContext {
  tenantId?: string;
  userId?: string;
  telegramId?: string;
  expedienteNum?: string;
  expedienteId?: string;
  credentialId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

