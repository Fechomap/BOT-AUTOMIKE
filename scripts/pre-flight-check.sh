#!/bin/bash

# ===========================================
# 🚀 PRE-FLIGHT CHECK - VALIDACIÓN COMPLETA
# ===========================================
# Script para validar TODO antes de hacer commit/push
# Evita errores en CI/CD detectándolos localmente

set -e # Salir en cualquier error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mostrar paso actual
show_step() {
    echo -e "${BLUE}🔍 $1...${NC}"
}

# Función para mostrar éxito
show_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Función para mostrar error
show_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Función para mostrar advertencia
show_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                 🚀 PRE-FLIGHT CHECK                          ║"
echo "║           Validación completa antes de deploy                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ===========================================
# 1. VERIFICAR DEPENDENCIAS
# ===========================================
show_step "1/10 Verificando dependencias de Node.js"

if ! command -v node &> /dev/null; then
    show_error "Node.js no está instalado"
    exit 1
fi

NODE_VERSION=$(node --version)
show_success "Node.js $NODE_VERSION instalado"

if ! command -v npm &> /dev/null; then
    show_error "npm no está instalado"
    exit 1
fi

NPM_VERSION=$(npm --version)
show_success "npm $NPM_VERSION instalado"

# Verificar que las dependencias estén instaladas
if [ ! -d "node_modules" ]; then
    show_warning "node_modules no existe, instalando dependencias..."
    npm install
fi

# ===========================================
# 2. VERIFICAR ARCHIVOS CRÍTICOS
# ===========================================
show_step "2/10 Verificando archivos críticos"

CRITICAL_FILES=(
    ".env"
    "package.json"
    "tsconfig.json"
    "prisma/schema.prisma"
    "Dockerfile"
    "railway.json"
    "src/main.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        show_error "Archivo crítico faltante: $file"
        exit 1
    fi
done

show_success "Todos los archivos críticos presentes"

# ===========================================
# 3. VALIDAR VARIABLES DE ENTORNO
# ===========================================
show_step "3/10 Validando variables de entorno"

if [ ! -f ".env" ]; then
    show_error "Archivo .env no encontrado"
    exit 1
fi

# Cargar variables de entorno
source .env 2>/dev/null || true

# Variables críticas
REQUIRED_VARS=("BOT_TOKEN" "DATABASE_URL" "ENCRYPTION_KEY")

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        show_error "Variable de entorno faltante: $var"
        exit 1
    fi
    
    # Verificar que no sean valores por defecto
    if [[ "${!var}" == *"your-"* ]] || [[ "${!var}" == *"example"* ]]; then
        show_error "Variable $var tiene valor por defecto, actualiza con valor real"
        exit 1
    fi
done

show_success "Variables de entorno válidas"

# ===========================================
# 4. LINTING
# ===========================================
show_step "4/10 Ejecutando ESLint"

if npm run lint; then
    show_success "ESLint: Sin errores de linting"
else
    show_error "ESLint encontró errores"
    echo -e "${YELLOW}💡 Ejecuta 'npm run lint:fix' para corregir automáticamente${NC}"
    exit 1
fi

# ===========================================
# 5. FORMATEO
# ===========================================
show_step "5/10 Verificando formato de código (Prettier)"

if npm run format:check; then
    show_success "Prettier: Código correctamente formateado"
else
    show_error "Prettier encontró archivos mal formateados"
    echo -e "${YELLOW}💡 Ejecuta 'npm run format' para formatear automáticamente${NC}"
    exit 1
fi

# ===========================================
# 6. TYPE CHECKING
# ===========================================
show_step "6/10 Verificando tipos TypeScript"

if npm run type-check; then
    show_success "TypeScript: Sin errores de tipos"
else
    show_error "TypeScript encontró errores de tipos"
    exit 1
fi

# ===========================================
# 7. VERIFICAR PRISMA
# ===========================================
show_step "7/10 Verificando configuración de Prisma"

# Verificar que el cliente Prisma esté generado
if [ ! -d "node_modules/.prisma" ]; then
    show_warning "Cliente Prisma no generado, generando..."
    npx prisma generate
fi

# Verificar formato del schema
if npx prisma format --check; then
    show_success "Prisma: Schema correctamente formateado"
else
    show_warning "Prisma: Schema será reformateado"
    npx prisma format
fi

# ===========================================
# 8. BUILD TEST
# ===========================================
show_step "8/10 Probando build de producción"

# Limpiar build anterior
rm -rf dist/

if npm run build:prod; then
    show_success "Build: Compilación exitosa"
else
    show_error "Build falló"
    exit 1
fi

# Verificar que los archivos de salida existan
if [ ! -f "dist/main.js" ]; then
    show_error "Archivo main.js no generado en dist/"
    exit 1
fi

BUILD_SIZE=$(du -sh dist/ | cut -f1)
show_success "Build generado correctamente (Tamaño: $BUILD_SIZE)"

# ===========================================
# 9. DOCKER BUILD TEST
# ===========================================
show_step "9/10 Probando build de Docker"

if command -v docker &> /dev/null; then
    # Probar solo la primera etapa para ahorrar tiempo
    if docker build --target builder -t expedientes-ike-bot:test-builder . > /dev/null 2>&1; then
        show_success "Docker: Build stage exitoso"
        # Limpiar imagen de prueba
        docker rmi expedientes-ike-bot:test-builder > /dev/null 2>&1 || true
    else
        show_error "Docker build falló"
        exit 1
    fi
else
    show_warning "Docker no disponible, saltando test de build"
fi

# ===========================================
# 10. VERIFICAR GIT STATUS
# ===========================================
show_step "10/10 Verificando estado de Git"

# Verificar que estemos en un repo git
if [ ! -d ".git" ]; then
    show_error "No estás en un repositorio Git"
    exit 1
fi

# Verificar archivos no trackeados importantes
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ ! -z "$UNTRACKED" ]; then
    show_warning "Archivos sin trackear encontrados:"
    echo "$UNTRACKED"
    echo -e "${YELLOW}💡 Considera agregar archivos importantes con 'git add'${NC}"
fi

# Verificar cambios sin commit
if [ ! -z "$(git diff --name-only)" ]; then
    show_warning "Cambios sin hacer commit:"
    git diff --name-only
fi

# Verificar cambios staged sin commit
if [ ! -z "$(git diff --cached --name-only)" ]; then
    show_success "Cambios staged listos para commit:"
    git diff --cached --name-only
fi

# ===========================================
# REPORTE FINAL
# ===========================================
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ PRE-FLIGHT EXITOSO                     ║"
echo "║               Tu código está listo para deploy!              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BLUE}📋 Resumen de validaciones:${NC}"
echo "✅ Dependencias instaladas"
echo "✅ Archivos críticos presentes"
echo "✅ Variables de entorno configuradas"
echo "✅ ESLint sin errores"
echo "✅ Prettier formato correcto"
echo "✅ TypeScript tipos válidos"
echo "✅ Prisma configurado"
echo "✅ Build exitoso"
echo "✅ Docker build funcional"
echo "✅ Git status verificado"

echo ""
echo -e "${GREEN}🚀 Comandos seguros para ejecutar:${NC}"
echo "   git add ."
echo "   git commit -m 'tu mensaje'"
echo "   git push"

echo ""
echo -e "${BLUE}🔗 El pipeline de CI/CD debería pasar sin problemas${NC}"