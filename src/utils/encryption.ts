import * as CryptoJS from 'crypto-js';
import * as bcrypt from 'bcrypt';
import { config } from './config';

const SALT_ROUNDS = 12;
const ENCRYPTION_KEY = config.encryption.key;

export class EncryptionUtils {
  // Hash de contraseñas con bcrypt
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Encriptación simétrica para credenciales del portal
  static encryptCredentials(credentials: string): string {
    return CryptoJS.AES.encrypt(credentials, ENCRYPTION_KEY).toString();
  }

  static decryptCredentials(encryptedCredentials: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedCredentials, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Generar token temporal (para sesiones)
  static generateToken(): string {
    return CryptoJS.lib.WordArray.random(32).toString();
  }

  // Validar formato de email
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validar contraseña (mínimo 8 caracteres)
  static isValidPassword(password: string): boolean {
    return password.length >= 8;
  }

  // Sanitizar entrada de usuario
  static sanitizeInput(input: string): string {
    return input.trim().replace(/[<>"'&]/g, '');
  }

  // Generar ID único
  static generateId(): string {
    return CryptoJS.lib.WordArray.random(16).toString();
  }
}

export default EncryptionUtils;
