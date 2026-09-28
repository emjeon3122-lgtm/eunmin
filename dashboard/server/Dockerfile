# 실적 대시보드 서버 — 외부 패키지가 없어 node 공식 이미지만 있으면 된다.
FROM node:22-alpine
WORKDIR /app
COPY lib ./lib
COPY public ./public
COPY tools ./tools
COPY server.js ./
ENV NODE_ENV=production DATA_DIR=/data PORT=7020 HOST=127.0.0.1
RUN mkdir -p /data && chown node:node /data
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server.js"]
