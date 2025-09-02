import { Markup } from 'telegraf';

export class MainKeyboard {
  // Teclado principal para usuarios autenticados
  static getMainMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Procesar Expedientes', 'process_expedientes'),
        Markup.button.callback('⚙️ Configuración', 'config_menu'),
      ],
      [
        Markup.button.callback('📈 Estadísticas', 'stats_menu'),
        Markup.button.callback('ℹ️ Ayuda', 'help_menu'),
      ],
      [Markup.button.callback('🚪 Cerrar Sesión', 'logout')],
    ]);
  }

  // Teclado de autenticación para usuarios no autenticados
  static getAuthMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🆕 Registro', 'auth_register'),
        Markup.button.callback('🔑 Iniciar Sesión', 'auth_login'),
      ],
      [Markup.button.callback('ℹ️ Información', 'help_info')],
    ]);
  }

  // Teclado para el procesamiento de expedientes
  static getProcessMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('📎 Subir Excel', 'upload_excel')],
      [
        Markup.button.callback('⚙️ Configurar Lógicas', 'config_logicas'),
        Markup.button.callback('🔄 Estado Actual', 'process_status'),
      ],
      [Markup.button.callback('🏠 Menú Principal', 'main_menu')],
    ]);
  }

  // Teclado para configuración de lógicas de validación
  static getLogicasMenu(logica2Enabled: boolean, logica3Enabled: boolean) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ Costo Exacto (Siempre)', 'logica_1_info')],
      [Markup.button.callback(`${logica2Enabled ? '☑️' : '☐'} Margen ±10%`, 'toggle_logica_2')],
      [Markup.button.callback(`${logica3Enabled ? '☑️' : '☐'} Costo Superior`, 'toggle_logica_3')],
      [
        Markup.button.callback('💾 Guardar y Continuar', 'save_logicas'),
        Markup.button.callback('⬅️ Atrás', 'process_menu'),
      ],
    ]);
  }

  // Teclado de configuración
  static getConfigMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔐 Credenciales Portal IKE', 'config_credentials')],
      [
        Markup.button.callback('⚡ Lógicas Predeterminadas', 'config_default_logicas'),
        Markup.button.callback('🔔 Notificaciones', 'config_notifications'),
      ],
      [
        Markup.button.callback('📊 Mi Cuenta', 'config_account'),
        Markup.button.callback('🏠 Menú Principal', 'main_menu'),
      ],
    ]);
  }

  // Teclado de estadísticas
  static getStatsMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Resumen General', 'stats_overview'),
        Markup.button.callback('📅 Por Fecha', 'stats_by_date'),
      ],
      [
        Markup.button.callback('🎯 Por Lógica', 'stats_by_logic'),
        Markup.button.callback('📈 Tendencias', 'stats_trends'),
      ],
      [
        Markup.button.callback('📥 Exportar Excel', 'stats_export'),
        Markup.button.callback('🏠 Menú Principal', 'main_menu'),
      ],
    ]);
  }

  // Teclado de confirmación genérico
  static getConfirmation(confirmAction: string, cancelAction: string = 'cancel') {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Confirmar', confirmAction),
        Markup.button.callback('❌ Cancelar', cancelAction),
      ],
    ]);
  }

  // Teclado para cuando se está procesando
  static getProcessingMenu(canCancel: boolean = false) {
    const buttons = [];

    if (canCancel) {
      buttons.push([Markup.button.callback('🛑 Cancelar Proceso', 'cancel_processing')]);
    }

    buttons.push([Markup.button.callback('🔄 Actualizar Estado', 'refresh_status')]);

    return Markup.inlineKeyboard(buttons);
  }

  // Teclado de navegación simple
  static getBackButton(backAction: string = 'main_menu', label: string = '⬅️ Atrás') {
    return Markup.inlineKeyboard([[Markup.button.callback(label, backAction)]]);
  }

  // Teclado para descarga de resultados
  static getDownloadMenu() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('📥 Descargar Excel', 'download_excel'),
        Markup.button.callback('📊 Ver Resumen', 'view_summary'),
      ],
      [
        Markup.button.callback('🔄 Procesar Nuevo', 'process_new'),
        Markup.button.callback('🏠 Menú Principal', 'main_menu'),
      ],
    ]);
  }

  // Teclado para manejo de errores
  static getErrorMenu(canRetry: boolean = true) {
    const buttons = [];

    if (canRetry) {
      buttons.push([Markup.button.callback('🔄 Reintentar', 'retry_action')]);
    }

    buttons.push([
      Markup.button.callback('🏠 Menú Principal', 'main_menu'),
      Markup.button.callback('ℹ️ Reportar Problema', 'report_issue'),
    ]);

    return Markup.inlineKeyboard(buttons);
  }

  // Teclados de respuesta rápida (Reply Keyboard)
  static getQuickReplyKeyboard() {
    return Markup.keyboard([
      ['📊 Procesar', '📈 Estadísticas'],
      ['⚙️ Configuración', 'ℹ️ Ayuda'],
    ]).resize();
  }

  // Remover teclado
  static removeKeyboard() {
    return Markup.removeKeyboard();
  }
}
