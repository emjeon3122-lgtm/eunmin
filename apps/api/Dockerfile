# 경조사 화환 앱 — API 서버 (NestJS + Prisma/SQLite)
# 대상: Synology DS1019+ 등 linux/amd64. 빌드와 실행 모두 같은 Debian 기반 이미지를 써서
# Prisma 엔진(OpenSSL 3)이 빌드 환경과 실행 환경에서 어긋나지 않게 한다.

FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# 시드 스크립트는 ts-node 없이 실행할 수 있게 JS로 따로 컴파일해 둔다(시험용 샘플 데이터).
RUN npx prisma generate \
    && npm run build \
    && npx tsc prisma/seed.ts --outDir dist-seed --module commonjs --target es2021 \
       --esModuleInterop --skipLibCheck \
    && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HOME=/tmp
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY docker-entrypoint.sh ./
# 실행 계정은 docker-compose의 user(NAS 전용 계정 UID/GID)로 덮어쓴다. 기본값도 root가 아니다.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
