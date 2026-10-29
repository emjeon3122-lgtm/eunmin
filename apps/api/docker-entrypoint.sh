#!/bin/sh
set -e

# DATABASE_URL(file:/data/db/xxx.db)과 STORAGE_LOCAL_DIR이 가리키는 폴더를 미리 만든다.
# NAS 전용 폴더가 비어 있는 첫 실행에서도 바로 뜨게 하기 위함이다.
db_path="${DATABASE_URL#file:}"
mkdir -p "$(dirname "$db_path")" "${STORAGE_LOCAL_DIR:-/data/uploads}"

# 스키마 변경(마이그레이션)은 시작할 때마다 자동 적용한다. 이미 적용된 것은 건너뛴다.
./node_modules/.bin/prisma migrate deploy

exec node dist/main.js
