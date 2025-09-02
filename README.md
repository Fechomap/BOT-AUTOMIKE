# 🤖 Bot de Telegram - Expedientes IKE

Bot de Telegram para automatizar la validación y liberación de expedientes del sistema IKE con multi-tenancy, persistencia completa y jobs automáticos.

## 🚀 Características

### ✅ **Funcionalidades Principales**
- **Multi-tenancy** - Múltiples organizaciones en una instancia
- **Autenticación completa** - Registro, login y gestión de sesiones
- **Procesamiento de Excel** - Soporte para formatos estándar y simplificado
- **Validación automática** - 3 lógicas configurables de liberación
- **Automatización web** - Integración con portal IKE via Puppeteer
- **Trazabilidad completa** - Historial de todas las validaciones
- **Jobs automáticos** - Revalidación diaria de expedientes pendientes
- **Estadísticas avanzadas** - Reportes y métricas detalladas

### 🔧 **Lógicas de Validación**
1. **Costo Exacto** (Siempre activa) - Libera si el costo coincide exactamente
2. **Margen ±10%** (Opcional) - Libera si está dentro del ±10% del costo guardado
3. **Costo Superior** (Opcional) - Libera si el costo del sistema es mayor

## 🏗️ Arquitectura Técnica

### **Stack Tecnológico**
- **Backend**: Node.js + TypeScript
- **Bot Framework**: Telegraf
- **Base de Datos**: PostgreSQL + Prisma ORM
- **Web Automation**: Puppeteer
- **Excel Processing**: ExcelJS
- **Jobs**: node-cron
- **Deployment**: Railway + Docker

### **Estructura del Proyecto**
```
src/
├── bot/                    # Lógica del bot de Telegram
│   ├── commands/           # Comandos (/start, /help)
│   ├── handlers/           # Manejadores de eventos
│   ├── keyboards/          # Teclados inline y reply
│   └── scenes/            # Flujos conversacionales
├── core/                  # Lógica de negocio
│   ├── validation/        # Lógicas de validación
│   ├── automation/        # Web scraping
│   └── excel/            # Procesamiento Excel
├── database/             # Capa de datos
│   ├── prisma/          # Cliente y configuración
│   └── repositories/    # Repositorios de datos
├── services/            # Servicios de aplicación
├── types/              # Definiciones TypeScript
└── utils/             # Utilidades generales
```

## ⚙️ Configuración

### **Variables de Entorno**
```bash
# Base de datos PostgreSQL
DATABASE_URL="postgresql://user:pass@host:port/db"

# Bot de Telegram
BOT_TOKEN="your_telegram_bot_token"
BOT_USERNAME="your_bot_username"

# Portal IKE
IKE_PORTAL_URL="https://portalproveedores.ikeasistencia.com"

# Seguridad
ENCRYPTION_KEY="your-secure-encryption-key"

# Jobs automáticos
ENABLE_CRON_JOBS=true
REVALIDATION_CRON="0 6 * * *"  # Diario a las 6 AM

# Puppeteer
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=30000

# Aplicación
NODE_ENV="production"
LOG_LEVEL="info"
PORT=3000
```

### **Base de Datos**
```bash
# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate deploy

# Ver base de datos (desarrollo)
npx prisma studio
```

## 🚀 Despliegue

### **Desarrollo Local**
```bash
# Clonar repositorio
git clone <repo-url>
cd expedientes-ike-bot

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev

# Iniciar en desarrollo
npm run dev
```

### **Producción - Railway**
1. **Conectar repositorio** a Railway
2. **Configurar variables de entorno** en Railway dashboard
3. **Conectar PostgreSQL** database
4. **Deploy automático** al hacer push a main

### **Docker**
```bash
# Construir imagen
docker build -t expedientes-ike-bot .

# Ejecutar contenedor
docker run -d \
  --name bot \
  --env-file .env \
  -p 3000:3000 \
  expedientes-ike-bot
```

## 📊 Uso del Bot

### **Registro y Autenticación**
1. `/start` - Iniciar el bot
2. Seleccionar "🆕 Registro" 
3. Ingresar email, nombre comercial y contraseña
4. Configurar credenciales del portal IKE

### **Procesamiento de Expedientes**
1. **📊 Procesar Expedientes** - Menú principal
2. **📎 Subir Excel** - Cargar archivo (formatos .xlsx/.xls)
3. **⚙️ Configurar Lógicas** - Activar/desactivar lógicas 2 y 3
4. **🚀 Iniciar Procesamiento** - Confirmar y ejecutar
5. **📥 Descargar Resultados** - Excel con resultados completos

### **Formatos de Excel Soportados**

#### **Formato Estándar**
| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Expediente | Costo Guardado | Costo Sistema | Validación | Notas | Fecha Registro | Servicio | Subservicio | Lógica | Fecha Validación |

#### **Formato Simplificado**
| Columna 1 | Columna 2 |
|-----------|-----------|
| Expediente | Costo |

## 🔄 Jobs Automáticos

### **Revalidación Diaria**
- **Horario**: 6:00 AM (configurable)
- **Función**: Revalida expedientes pendientes con nuevas lógicas
- **Beneficio**: Liberación automática sin intervención manual

### **Limpieza Semanal**
- **Horario**: Domingo 2:00 AM
- **Función**: Elimina archivos temporales y logs antiguos
- **Beneficio**: Mantiene el sistema optimizado

## 📈 Estadísticas y Reportes

### **Dashboard por Tenant**
- Total de expedientes procesados
- Tasa de liberación por lógica
- Expedientes pendientes
- Tendencias históricas
- Exportación a Excel

### **Métricas de Rendimiento**
- Tiempo de procesamiento por expediente
- Tasa de éxito de automatización
- Errores y reintentos
- Uso de recursos del sistema

## 🔒 Seguridad

### **Encriptación**
- **Contraseñas**: bcrypt con salt rounds: 12
- **Credenciales portal**: AES con clave configurada
- **Variables sensibles**: Environment variables

### **Validación**
- Input sanitization con Joi
- Rate limiting: 30 requests/minuto
- Archivos máximo 50MB
- Timeouts configurables

### **Logs de Seguridad**
- Intentos de login fallidos
- Accesos no autorizados
- Operaciones sensibles
- Errores de sistema

## 🛠️ Desarrollo

### **Scripts Disponibles**
```bash
npm run dev          # Desarrollo con hot reload
npm run build        # Compilar TypeScript
npm start           # Producción
npm run lint        # ESLint
npm run lint:fix    # Corregir lint automáticamente
```

### **Testing**
```bash
# Ejecutar tests (cuando estén implementados)
npm test

# Tests con cobertura
npm run test:coverage
```

## 📞 Soporte

### **Comandos del Bot**
- `/start` - Iniciar o reiniciar
- `/help` - Ayuda detallada
- `/status` - Estado del sistema

### **Logs y Debugging**
```bash
# Ver logs en tiempo real (desarrollo)
tail -f logs/combined.log

# Ver solo errores
tail -f logs/error.log

# Logs estructurados para análisis
cat logs/combined.log | jq '.'
```

## 🔄 Roadmap

### **Fase 2 - Mini-App**
- [ ] Interfaz web integrada en Telegram
- [ ] Dashboard visual con gráficos
- [ ] Configuración avanzada via UI

### **Fase 3 - APIs**
- [ ] REST API para integraciones
- [ ] Webhooks para notificaciones
- [ ] SDK para desarrolladores

### **Fase 4 - Inteligencia**
- [ ] ML para predicción de liberaciones
- [ ] Detección de patrones anómalos
- [ ] Optimización automática de lógicas

## 📄 Licencia

Este proyecto está licenciado bajo [MIT License](LICENSE).

---

🤖 **Bot de Expedientes IKE** - Automatización inteligente para la gestión de expedientes