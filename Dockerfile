# =============================================================
#  Dreinn Music - production image
#  Multi-stage: native modules (better-sqlite3) are compiled in
#  the builder, the runtime image stays slim.
#  The container starts as root only to fix ownership of the
#  /data volume and immediately drops to the "node" user.
# =============================================================

# ---------- stage 1: dependencies ----------
FROM node:20-bookworm-slim AS deps

# Toolchain for building better-sqlite3 when no prebuilt binary matches
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# ---------- stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/dreinn.db

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini gosu ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# node_modules from the builder stage
COPY --from=deps /app/node_modules ./node_modules

# application sources (.env is excluded via .dockerignore)
COPY package.json ./
COPY index.js ./
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# /data is mounted as a docker volume - the SQLite file lives there
RUN mkdir -p /data \
 && chown -R node:node /data /app \
 && sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini -> entrypoint (chown + gosu node) -> node index.js
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.js"]
