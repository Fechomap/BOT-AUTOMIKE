# Multi-stage build para optimizar el tamaño
FROM node:18-slim AS builder

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

# Imagen de producción
FROM node:18-slim AS runtime

# Instalar dependencias mínimas del sistema
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
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Usuario no-root para seguridad
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Puerto (si necesitas uno en el futuro)
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]