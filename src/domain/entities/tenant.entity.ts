export class Tenant {
  constructor(
    public readonly id: string,
    public readonly telegramId: bigint,
    public readonly companyName: string,
    public readonly ikeUsername: string,
    public readonly ikePassword: string, // Encriptado
    public readonly headless: boolean = true,
    public readonly isActive: boolean = true,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date()
  ) {}

  static create(
    telegramId: bigint,
    companyName: string,
    ikeUsername: string,
    ikePassword: string,
    headless: boolean = true
  ): {
    telegramId: bigint;
    companyName: string;
    ikeUsername: string;
    ikePassword: string;
    headless: boolean;
    isActive: boolean;
  } {
    return {
      telegramId,
      companyName,
      ikeUsername,
      ikePassword,
      headless,
      isActive: true,
    };
  }

  get isValidForProcessing(): boolean {
    return this.isActive && this.ikeUsername.length > 0 && this.ikePassword.length > 0;
  }
}
