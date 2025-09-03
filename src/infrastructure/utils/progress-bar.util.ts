export interface ProgressInfo {
  current: number;
  total: number;
  currentItem?: string;
  startTime?: Date;
}

export class ProgressBarUtil {
  private static readonly FILLED_CHAR = '█';
  private static readonly EMPTY_CHAR = '░';
  private static readonly BAR_LENGTH = 10;

  static formatProgressBar(info: ProgressInfo): string {
    const { current, total, currentItem, startTime } = info;

    const percentage = Math.round((current / total) * 100);
    const progress = current / total;
    const filledLength = Math.round(progress * this.BAR_LENGTH);

    const filledBar = this.FILLED_CHAR.repeat(filledLength);
    const emptyBar = this.EMPTY_CHAR.repeat(this.BAR_LENGTH - filledLength);
    const progressBar = `[${filledBar}${emptyBar}]`;

    let message = `🔍 ${progressBar} ${percentage}% (${current}/${total})`;

    if (currentItem) {
      message += ` - Procesando: ${currentItem}`;
    }

    if (startTime && current > 0) {
      const elapsed = Date.now() - startTime.getTime();
      const avgTimePerItem = elapsed / current;
      const remaining = total - current;
      const estimatedTimeLeft = Math.round((avgTimePerItem * remaining) / 1000);

      if (estimatedTimeLeft > 0) {
        message += `\n⏱️ Tiempo estimado restante: ${this.formatTime(estimatedTimeLeft)}`;
      }
    }

    return message;
  }

  private static formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  static createInitialMessage(total: number): string {
    return `📊 Iniciando procesamiento de ${total} expedientes...\n${this.formatProgressBar({ current: 0, total })}`;
  }

  static createCompletionMessage(total: number, startTime: Date): string {
    const elapsed = Date.now() - startTime.getTime();
    const totalTime = Math.round(elapsed / 1000);

    return (
      `✅ Procesamiento completado!\n` +
      `📊 Total procesados: ${total} expedientes\n` +
      `⏱️ Tiempo total: ${this.formatTime(totalTime)}`
    );
  }
}
