import { TenantData, UserData } from './index';

// Extensión del contexto de Telegraf para incluir sesión
declare module 'telegraf' {
  interface Context {
    session?: {
      tenant?: TenantData;
      user?: UserData;
      logica2Enabled?: boolean;
      logica3Enabled?: boolean;
      waitingForFile?: boolean;
      waitingForCredentials?: boolean;
      resultFilePath?: string;
      registerData?: {
        email: string;
        businessName: string;
      };
      loginData?: {
        email: string;
      };
    };
  }
}

export {};
