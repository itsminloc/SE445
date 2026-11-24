# ==========================================================
# SE445 ORI - Order Process & AI Mapper Dockerfile (Port 3004)
# Multi-stage Non-Root Alpine Build (CyberRig Standard)
# ==========================================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY services ./services
RUN npm run typecheck && npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S ori && adduser -S ori -G ori
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=ori:ori /app/dist ./dist
USER ori
ENV NODE_ENV=production ORDER_PORT=3004
EXPOSE 3004
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3004/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/order-process/server.js"]
