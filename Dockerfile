# ---- build the web app (PWA) ----
FROM node:22-alpine AS web
WORKDIR /app
COPY shared ./shared
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
# the user guide is bundled into the app, and the build checks it covers every page and setting
COPY docs ./docs
COPY tools ./tools
COPY server/src ./server/src
RUN cd web && npm run build

# ---- runtime: API + static web app ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY --from=web /app/web/dist ./web/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "server/src/index.js"]
