# Multi-stage build (DESIGN.md §2): build frontend, build backend, slim runtime.
# DB is the built-in node:sqlite module — no native deps, no compiler. Needs
# Node >= 23.4 for the unflagged module; node:24-slim is the current LTS.

# Stage 1: frontend
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend
FROM node:24-slim AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: runtime
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
# Bank sync: bundle Chromium + its runtime libs for the Playwright script (~400 MB;
# the browser binary lives in the image, the persistent login profile under /data).
# Plus xvfb: BNPPF blocks headless Chromium, so the sync runs a *headed* browser,
# which in a container needs a virtual X display (started in the CMD below).
RUN npx playwright install --with-deps chromium \
 && apt-get update && apt-get install -y --no-install-recommends xvfb \
 && rm -rf /var/lib/apt/lists/*
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./public
ENV FRONTEND_DIR=/app/public
ENV DATA_DIR=/data
ENV DISPLAY=:99
EXPOSE 3000
# Start Xvfb in the background (the server doesn't need it until a sync runs), then
# exec node so it's PID 1 with proper signal handling. Headed Chromium launched by
# the sync inherits DISPLAY=:99. (xvfb-run as PID 1 fails to bring up the display —
# verified — so we run Xvfb directly.)
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >/dev/null 2>&1 & exec node dist/index.js"]
