# 🤖 Bot de Telegram - Expedientes IKE

## 📋 Descripción General

Bot de Telegram para automatizar la validación y liberación de expedientes del sistema IKE, migrado desde la aplicación de escritorio original con mejoras de trazabilidad y multi-tenancy.

## 🎯 Funcionalidades Principales

### ✅ Registro Multi-Tenant
- Registro abierto sin sistema de licencias
- Credenciales: email, nombre comercial, contraseña
- Cada tenant tiene sus propios datos aislados

### 📊 Procesamiento de Excel
**Dos formatos soportados:**

1. **Formato Estándar** (Columnas A-J):
   - A: Número de expediente
   - B: Costo guardado
   - C-J: Resultados de validación

2. **Formato Simplificado**:
   - Columna 1: Expediente
   - Columna 2: Costo

### 🔧 Lógicas de Validación

#### **Lógica 1: Costo Exacto** (Siempre Activa)
```typescript
if (costoSistema === costoGuardado) {
  estado = "LIBERADO"
  logica = 1
}
```

#### **Lógica 2: Margen ±10%** (Opcional)
```typescript
const margenInferior = costoGuardado * 0.9
const margenSuperior = costoGuardado * 1.1
if (costoSistema >= margenInferior && costoSistema <= margenSuperior) {
  estado = "LIBERADO"
  logica = 2
}
```

#### **Lógica 3: Costo Superior** (Opcional)
```typescript
if (costoSistema > costoGuardado) {
  estado = "LIBERADO"
  logica = 3
}
```

### 🌐 Automatización Web
- **Portal:** `https://portalproveedores.ikeasistencia.com`
- **Navegación:** Puppeteer headless
- **Búsqueda:** Campo de expediente con múltiples selectores
- **Liberación:** Automática según lógicas configuradas

## 🗄️ Modelo de Datos

### Entidades Principales
- **Tenant**: Organizaciones/clientes
- **Expediente**: Registros de expedientes con trazabilidad
- **Validation**: Historial de validaciones
- **User**: Usuarios de Telegram vinculados a tenants
- **Job**: Trabajos programados para revalidación

### Estados de Expedientes
- `PENDIENTE`: Requiere revisión manual
- `LIBERADO`: Liberado automáticamente
- `NO_ENCONTRADO`: No existe en el sistema IKE

## 🤖 Interfaz del Bot

### Flujo Principal
```
/start →
├── "🆕 Registro" → [Email, Nombre, Contraseña]
└── "🔑 Iniciar Sesión" → [Email, Contraseña]

Menu Principal:
├── 📊 Procesar Expedientes
├── ⚙️ Configuración
├── 📈 Estadísticas
└── ℹ️ Ayuda
```

### Procesamiento de Expedientes
```
📊 Procesar Expedientes →
├── "📎 Subir Excel"
├── "⚙️ Seleccionar Lógicas"
│   ├── ☑️ Costo exacto (siempre)
│   ├── ☐ Margen ±10%
│   └── ☐ Costo superior
├── "🚀 Iniciar Procesamiento"
└── "📥 Descargar Resultados"
```

### Configuración
```
⚙️ Configuración →
├── "🔐 Credenciales Portal IKE"
│   ├── Username
│   └── Password
├── "⚡ Lógicas Predeterminadas"
└── "🔔 Notificaciones"
```

## 🏗️ Arquitectura del Proyecto

```
src/
├── bot/                    # Lógica del bot
│   ├── commands/           # Comandos (/start, /help)
│   ├── handlers/           # Manejadores de eventos
│   ├── keyboards/          # Teclados inline y reply
│   └── scenes/            # Flujos conversacionales
├── core/                  # Lógica de negocio
│   ├── validation/        # Lógicas de validación
│   ├── automation/        # Web scraping
│   └── excel/            # Procesamiento Excel
├── database/             # Capa de datos
│   ├── prisma/          # Cliente Prisma
│   └── repositories/    # Repositorios
├── services/            # Servicios de aplicación
├── types/              # Definiciones TypeScript
└── utils/             # Utilidades
```

## 🔄 Jobs Automáticos

### Revalidación Diaria
- **Horario:** 6:00 AM diario
- **Objetivo:** Revalidar expedientes pendientes
- **Proceso:** Ejecutar lógicas sobre expedientes no liberados

### Limpieza de Logs
- **Horario:** Semanal
- **Objetivo:** Mantener logs actuales (30 días)

## 📈 Estadísticas y Reportes

### Dashboard por Tenant
- Total de expedientes procesados
- Expedientes liberados por lógica
- Expedientes pendientes
- Tasa de éxito por día/semana/mes

### Exportación
- Excel con resultados detallados
- Logs de procesamiento
- Estadísticas consolidadas

## 🚀 Despliegue

### Railway Configuration
```yaml
# railway.toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
```

### Variables de Entorno
```bash
DATABASE_URL          # PostgreSQL de Railway
BOT_TOKEN            # Token del bot de Telegram
ENCRYPTION_KEY       # Clave de encriptación
IKE_PORTAL_URL       # URL del portal IKE
ENABLE_CRON_JOBS     # Habilitar jobs automáticos
```

## 🔒 Seguridad

### Encriptación
- Contraseñas con bcrypt (salt rounds: 12)
- Credenciales del portal con crypto-js AES
- Variables sensibles en environment

### Rate Limiting
- Máximo 30 requests por minuto por usuario
- Archivos máximo 50MB
- Timeout de operaciones: 30 segundos

### Validación
- Joi para validación de datos de entrada
- Sanitización de inputs
- Logs de seguridad

## 🧪 Testing

### Casos de Prueba
1. **Autenticación:**
   - Registro de nuevo tenant
   - Login con credenciales válidas/inválidas
   - Manejo de sesiones

2. **Procesamiento:**
   - Carga de Excel formato estándar
   - Carga de Excel formato simple
   - Validación de lógicas 1, 2, 3
   - Manejo de errores de red

3. **Automatización:**
   - Login al portal IKE
   - Búsqueda de expedientes
   - Liberación automática

## 📊 Monitoreo

### Logs
- Winston con niveles: error, warn, info, debug
- Rotación diaria de archivos
- Logs estructurados en JSON

### Métricas
- Tiempo de procesamiento por expediente
- Tasa de éxito de liberaciones
- Errores de conexión al portal IKE

## 🔄 Migración desde Aplicación Desktop

### Componentes Reutilizados
- **AutomationService.js** → `core/automation/`
- **ExcelService.js** → `core/excel/`
- **Lógicas de validación** → `core/validation/`

### Mejoras Implementadas
1. **Persistencia:** Base de datos vs archivos locales
2. **Multi-tenancy:** Soporte para múltiples organizaciones
3. **Trazabilidad:** Historial completo de validaciones
4. **Jobs:** Automatización de revalidaciones
5. **APIs:** Interfaz programática para futuras integraciones

## 🎯 Roadmap Futuro

### Fase 2: Mini-App
- Interfaz web integrada en Telegram
- Dashboard visual con gráficos
- Configuración avanzada via UI

### Fase 3: APIs
- REST API para integraciones
- Webhooks para notificaciones
- Sincronización con otros sistemas

### Fase 4: Inteligencia
- ML para predicción de liberaciones
- Detección de patrones anómalos
- Optimización automática de lógicas

## 📞 Soporte

### Comandos del Bot
- `/start` - Iniciar o reiniciar el bot
- `/help` - Mostrar ayuda y comandos
- `/status` - Estado del sistema
- `/stats` - Estadísticas personales

### Contacto
- Issues en GitHub para bugs
- Telegram support channel para ayuda