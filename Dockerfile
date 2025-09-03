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

# Instalar dependencias mínimas del sistema + Google Chrome
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    wget \
    gnupg \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y \
    google-chrome-stable \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
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

# Usuario no-root para seguridad con directorio home
RUN groupadd -r appuser && useradd -r -g appuser -m appuser
RUN chown -R appuser:appuser /app
RUN mkdir -p /home/appuser/.local/share/applications /app/temp
RUN chmod 755 /home/appuser /home/appuser/.local /home/appuser/.local/share /home/appuser/.local/share/applications
RUN chmod 777 /app/temp /tmp

USER appuser

# Variables de entorno adicionales para Puppeteer
ENV HOME=/home/appuser
ENV XDG_DATA_HOME=/home/appuser/.local/share

# Puerto (si necesitas uno en el futuro)
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]