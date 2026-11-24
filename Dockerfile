# ==========================================================
# SE445 ORI Enterprise Multi-stage Dockerfile
# Cloned from CyberRig pattern: Node.js 20 Alpine, non-root
# ==========================================================

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig*.json ./
RUN npm install --no-audit --no-fund

COPY services ./services
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG SERVICE_ENTRY=dist/demo-runner.js
ENV SERVICE_ENTRY=${SERVICE_ENTRY}

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node si-dashboard ./si-dashboard

USER node
EXPOSE 3001 3002 3003 3004 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3004/health || exit 1

CMD ["sh", "-c", "node ${SERVICE_ENTRY}"]
