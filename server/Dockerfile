# ============================================================================
# Dockerfile — Backend (Node 22, no native deps thanks to node:sqlite).
# ============================================================================
FROM node:22-alpine

WORKDIR /app

# Chrome/Chromium system libraries — required for browser mode (Puppeteer).
# We install the distro Chromium and skip puppeteer's bundled-Chrome download.
RUN apk add --no-cache \
      chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install deps first for layer caching
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Runtime directories
RUN mkdir -p data logs

# Non-root user
RUN addgroup -S app && adduser -S app -G app && \
    chown -R app:app /app
USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "index.js"]
