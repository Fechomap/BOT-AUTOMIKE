import { Scenes, Markup } from 'telegraf';
import { AuthService, RegisterData, LoginData } from '../../services/auth.service';
import { MainKeyboard } from '../keyboards/main.keyboard';
import { Logger } from '../../utils/logger';
import { EncryptionUtils } from '../../utils/encryption';

const authService = new AuthService();

// Scene para registro
export const registerScene = new Scenes.WizardScene(
  'register',
  // Step 1: Email
  async (ctx) => {
    await ctx.reply(
      '🆕 *Registro de Nueva Cuenta*\n\n' +
        'Para comenzar, necesito algunos datos:\n\n' +
        '📧 *Paso 1/3:* Ingresa tu email corporativo:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_auth')]]),
      }
    );
    return ctx.wizard.next();
  },
  // Step 2: Business Name
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Por favor, envía un email válido.');
      return;
    }

    const email = ctx.message.text.trim().toLowerCase();

    if (!EncryptionUtils.isValidEmail(email)) {
      await ctx.reply('❌ Email inválido. Por favor, ingresa un email válido.');
      return;
    }

    ctx.session.registerData = { email };

    await ctx.reply('🏢 *Paso 2/3:* Ingresa el nombre de tu empresa o negocio:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_auth')]]),
    });
    return ctx.wizard.next();
  },
  // Step 3: Password
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Por favor, envía el nombre de tu empresa.');
      return;
    }

    const businessName = ctx.message.text.trim();

    if (businessName.length < 2) {
      await ctx.reply('❌ El nombre de la empresa debe tener al menos 2 caracteres.');
      return;
    }

    ctx.session.registerData.businessName = businessName;

    await ctx.reply('🔐 *Paso 3/3:* Crea una contraseña segura (mínimo 8 caracteres):', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_auth')]]),
    });
    return ctx.wizard.next();
  },
  // Step 4: Process registration
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Por favor, envía tu contraseña.');
      return;
    }

    const password = ctx.message.text;

    if (!EncryptionUtils.isValidPassword(password)) {
      await ctx.reply('❌ La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    // Delete password message for security
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Ignore if can't delete
    }

    const registerData: RegisterData = {
      email: ctx.session.registerData.email,
      businessName: ctx.session.registerData.businessName,
      password,
    };

    await ctx.reply('⏳ Creando tu cuenta...');

    try {
      const result = await authService.register(ctx.from!.id.toString(), registerData);

      if (result.success && result.tenant && result.user) {
        ctx.session.tenant = result.tenant;
        ctx.session.user = result.user;

        await ctx.reply(
          '✅ *¡Cuenta creada exitosamente!*\n\n' +
            `🏢 Empresa: ${result.tenant.businessName}\n` +
            `📧 Email: ${result.tenant.email}\n\n` +
            '¡Ahora puedes usar el bot para procesar expedientes!',
          {
            parse_mode: 'Markdown',
            ...MainKeyboard.getMainMenu(),
          }
        );

        Logger.bot('Registro completado exitosamente', ctx.from!.id.toString(), result.tenant.id);
      } else {
        await ctx.reply(
          `❌ Error creando la cuenta: ${result.error || 'Error desconocido'}`,
          MainKeyboard.getAuthMenu()
        );
      }
    } catch (error) {
      Logger.error(
        'Error en scene de registro',
        {
          telegramId: ctx.from!.id.toString(),
        },
        error as Error
      );

      await ctx.reply(
        '❌ Error interno. Por favor, intenta nuevamente.',
        MainKeyboard.getAuthMenu()
      );
    }

    return ctx.scene.leave();
  }
);

// Scene para login
export const loginScene = new Scenes.WizardScene(
  'login',
  // Step 1: Email
  async (ctx) => {
    await ctx.reply('🔑 *Iniciar Sesión*\n\n' + '📧 *Paso 1/2:* Ingresa tu email:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_auth')]]),
    });
    return ctx.wizard.next();
  },
  // Step 2: Password
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Por favor, envía un email válido.');
      return;
    }

    const email = ctx.message.text.trim().toLowerCase();

    if (!EncryptionUtils.isValidEmail(email)) {
      await ctx.reply('❌ Email inválido. Por favor, ingresa un email válido.');
      return;
    }

    ctx.session.loginData = { email };

    await ctx.reply('🔐 *Paso 2/2:* Ingresa tu contraseña:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_auth')]]),
    });
    return ctx.wizard.next();
  },
  // Step 3: Process login
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Por favor, envía tu contraseña.');
      return;
    }

    const password = ctx.message.text;

    // Delete password message for security
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Ignore if can't delete
    }

    const loginData: LoginData = {
      email: ctx.session.loginData.email,
      password,
    };

    await ctx.reply('⏳ Verificando credenciales...');

    try {
      const result = await authService.login(ctx.from!.id.toString(), loginData);

      if (result.success && result.tenant && result.user) {
        ctx.session.tenant = result.tenant;
        ctx.session.user = result.user;

        await ctx.reply(
          '✅ *¡Sesión iniciada correctamente!*\n\n' +
            `🏢 Empresa: ${result.tenant.businessName}\n` +
            `📧 Email: ${result.tenant.email}\n\n` +
            '¿Qué te gustaría hacer?',
          {
            parse_mode: 'Markdown',
            ...MainKeyboard.getMainMenu(),
          }
        );

        Logger.bot('Login exitoso', ctx.from!.id.toString(), result.tenant.id);
      } else {
        await ctx.reply(
          `❌ ${result.error || 'Email o contraseña incorrectos'}`,
          MainKeyboard.getAuthMenu()
        );
      }
    } catch (error) {
      Logger.error(
        'Error en scene de login',
        {
          telegramId: ctx.from!.id.toString(),
        },
        error as Error
      );

      await ctx.reply(
        '❌ Error interno. Por favor, intenta nuevamente.',
        MainKeyboard.getAuthMenu()
      );
    }

    return ctx.scene.leave();
  }
);

// Middleware para manejar cancelación
export const handleCancelAuth = async (ctx: any) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('❌ Proceso cancelado.', MainKeyboard.getAuthMenu());
  return ctx.scene.leave();
};

// Scene manager export
export const authScenes = new Scenes.Stage([registerScene, loginScene]);

// Action handlers
export const authHandlers = {
  handleRegister: async (ctx: any) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('register');
  },

  handleLogin: async (ctx: any) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('login');
  },

  handleLogout: async (ctx: any) => {
    await ctx.answerCbQuery();

    try {
      if (ctx.session?.user?.id) {
        await authService.logout(ctx.session.user.id);
      }

      ctx.session.tenant = null;
      ctx.session.user = null;

      await ctx.editMessageText(
        '👋 ¡Hasta luego! Has cerrado sesión correctamente.\n\n' +
          'Para volver a usar el bot, inicia sesión nuevamente.',
        MainKeyboard.getAuthMenu()
      );

      Logger.bot('Logout exitoso', ctx.from?.id.toString() || 'unknown');
    } catch (error) {
      Logger.error(
        'Error en logout',
        {
          telegramId: ctx.from?.id.toString(),
        },
        error as Error
      );

      await ctx.reply('❌ Error cerrando sesión. Intenta nuevamente.');
    }
  },
};
