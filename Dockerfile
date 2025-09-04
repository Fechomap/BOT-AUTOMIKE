# Multi-stage build para optimizar el tamaño
FROM node:24-slim AS builder

# Instalar dependencias del sistema para Prisma y build
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY prisma/ ./prisma/

# Instalar dependencias y generar Prisma client
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci --omit=dev --ignore-scripts
RUN npx prisma generate

# Copiar código fuente
COPY . .

# Build del proyecto
RUN npm run build

# Imagen de producción optimizada para Puppeteer
FROM ghcr.io/puppeteer/puppeteer:21.11.0 AS runtime

# Cambiar a usuario root temporalmente para instalar dependencias
USER root

# Instalar dependencias adicionales
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar archivos necesarios desde builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Variables de entorno
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Crear directorio temp y configurar permisos
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Cambiar de vuelta al usuario puppeteer (usuario por defecto de la imagen)
USER pptruser

# Variables de entorno para el usuario puppeteer
ENV HOME=/home/pptruser

# Puerto (si necesitas uno en el futuro)
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]