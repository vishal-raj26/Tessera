# Production image: builds the Mini App, then runs the API which also serves it.
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production DB_PATH=/data/tessera.db WEB_DIST=/app/web/dist PORT=8787
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /app/web/dist /app/web/dist
# the database lives in /data: mount a volume there (Railway: a volume at /data; Docker: -v)
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "src/index.js"]
