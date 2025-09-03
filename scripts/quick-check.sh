#!/bin/bash

# ===========================================
# ⚡ QUICK CHECK - VALIDACIÓN RÁPIDA
# ===========================================
# Script de validación rápida antes de commit
# Solo ejecuta las verificaciones esenciales

set -e

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}⚡ Quick Check - Validación Rápida${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. ESLint (crítico)
echo -e "${BLUE}🔍 ESLint...${NC}"
if npm run lint > /dev/null 2>&1; then
    echo -e "${GREEN}✅ ESLint: OK${NC}"
else
    echo -e "${RED}❌ ESLint: ERRORES ENCONTRADOS${NC}"
    echo -e "${YELLOW}Ejecuta: npm run lint:fix${NC}"
    exit 1
fi

# 2. Prettier (crítico)
echo -e "${BLUE}💄 Prettier...${NC}"
if npm run format:check > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Prettier: OK${NC}"
else
    echo -e "${RED}❌ Prettier: MAL FORMATO${NC}"
    echo -e "${YELLOW}Ejecuta: npm run format${NC}"
    exit 1
fi

# 3. TypeScript (crítico)
echo -e "${BLUE}🔧 TypeScript...${NC}"
if npm run type-check > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript: OK${NC}"
else
    echo -e "${RED}❌ TypeScript: ERRORES DE TIPOS${NC}"
    exit 1
fi

# 4. Build rápido (importante)
echo -e "${BLUE}🏗️ Build...${NC}"
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Build: OK${NC}"
else
    echo -e "${RED}❌ Build: FALLÓ${NC}"
    exit 1
fi

# 5. Variables de entorno básicas
echo -e "${BLUE}🔒 Variables de entorno...${NC}"
if [ -f ".env" ] && grep -q "BOT_TOKEN" .env && grep -q "DATABASE_URL" .env; then
    echo -e "${GREEN}✅ Variables de entorno: OK${NC}"
else
    echo -e "${YELLOW}⚠️ Variables de entorno: Verificar .env${NC}"
fi

echo ""
echo -e "${GREEN}🚀 QUICK CHECK COMPLETADO${NC}"
echo -e "${GREEN}✅ Listo para commit!${NC}"
echo ""
echo -e "${BLUE}Comandos seguros:${NC}"
echo "  git add ."
echo "  git commit -m 'tu mensaje'"
echo "  git push"