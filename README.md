# 🤖 Expedientes IKE Bot

Bot de Telegram para automatización de validación de expedientes IKE con sistema multi-tenant. Permite a múltiples empresas gestionar sus expedientes de forma independiente y segura.

## ✨ Características

- 🏢 **Multi-tenant**: Soporte para múltiples empresas con credenciales independientes
- 📊 **Procesamiento de Excel**: Lectura y validación automática de expedientes
- 🔍 **Automatización Web**: Integración con Portal IKE usando Puppeteer
- 📱 **Bot de Telegram**: Interfaz conversacional intuitiva
- 🔐 **Seguridad**: Encriptación de credenciales y manejo seguro de datos
- 🐳 **Docker**: Containerización completa para fácil deployment
- 🚀 **CI/CD**: Pipeline automático con GitHub Actions

## 🏗️ Arquitectura

El proyecto sigue los principios de **Arquitectura Hexagonal (Clean Architecture)**:

```
src/
├── domain/           # Entidades y lógica de negocio
├── application/      # Casos de uso
├── infrastructure/   # Implementaciones (DB, APIs, Web)
└── presentation/     # Controladores (Telegram Bot)
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 18+
- PostgreSQL
- Token de Bot de Telegram
- Docker (opcional pero recomendado)

### Instalación Local

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/Fechomap/BOT-AUTOMIKE.git
   cd expedientes-ike-bot
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   # Crear archivo .env con tus credenciales
   touch .env
   # Agregar las siguientes variables:
   # BOT_TOKEN="your-telegram-bot-token"
   # DATABASE_URL="your-postgresql-connection-string" 
   # ENCRYPTION_KEY="your-32-character-secret-key"
   ```

4. **Configurar base de datos**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Ejecutar en desarrollo**
   ```bash
   npm run dev
   ```

### Docker (Recomendado)

```bash
# Build
docker build -t expedientes-ike-bot .

# Run
docker run -d \
  --name expedientes-bot \
  -e BOT_TOKEN=tu_token \
  -e DATABASE_URL=tu_database_url \
  expedientes-ike-bot
```

## ⚙️ Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `BOT_TOKEN` | Token del bot de Telegram | ✅ |
| `DATABASE_URL` | URL de conexión PostgreSQL | ✅ |
| `IKE_USERNAME` | Usuario global IKE (opcional) | ❌ |
| `IKE_PASSWORD` | Contraseña global IKE (opcional) | ❌ |
| `IKE_HEADLESS` | Ejecutar Chrome sin interfaz gráfica | ❌ |

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