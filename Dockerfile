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
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./public
ENV FRONTEND_DIR=/app/public
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
