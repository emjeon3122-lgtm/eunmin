# 사내 경조사 화환 자동 발송 앱

임직원이 결혼/부고 등 경조사 화환을 신청하면 관리자(총무·HR) 승인 없이 계약 꽃집으로 즉시
전달되고(카카오 친구톡), 꽃집이 로그인 없는 원터치 링크에서 접수/배송완료를 직접 갱신하는
사내 시스템입니다. 설계 배경과 확정된 정책은 [`docs/`](./docs)의 4개 설계 문서를 참고하세요.

- [`docs/01-architecture-and-db.md`](./docs/01-architecture-and-db.md) — 아키텍처 & DB 설계(ERD)
- [`docs/02-api-spec.md`](./docs/02-api-spec.md) — API 명세
- [`docs/03-frontend-wireframe.md`](./docs/03-frontend-wireframe.md) — 프론트엔드 와이어프레임
- [`docs/04-backend-integration.md`](./docs/04-backend-integration.md) — 꽃집(카카오 친구톡) 연동 로직
- [`docs/conversation-log.md`](./docs/conversation-log.md) — 설계 결정이 오간 대화 기록

## 구성

```
apps/
  api/   NestJS + Prisma + PostgreSQL — REST API 서버
  web/   Next.js 14 (App Router) — 반응형 웹 클라이언트
docker-compose.yml   로컬 개발용 PostgreSQL
```

## 로컬 실행

### 1. DB 기동

```bash
docker compose up -d db
```

(Docker를 쓸 수 없는 환경이라면 로컬 PostgreSQL 16을 직접 띄우고 `apps/api/.env`의
`DATABASE_URL`을 맞춰도 됩니다.)

### 2. 백엔드 (apps/api)

```bash
cd apps/api
cp .env.example .env      # 필요시 값 수정
npm install
npm run prisma:migrate    # 스키마 반영 (최초 1회, 이미 생성된 migrations/ 적용)
npm run prisma:seed       # 샘플 유저/꽃집/상품/규칙 시드
npm run dev                # http://localhost:4000/api
```

시드 후 콘솔에 출력되는 사번으로 개발 로그인(`POST /api/auth/dev-login`)할 수 있습니다:
`A0001`(관리자), `E1001`/`E1002`(임직원).

### 3. 프론트엔드 (apps/web)

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000
```

`/login`에서 위 사번으로 로그인 → `/requests`에서 신청 → 관리자는 `/admin/requests`.
꽃집용 공개 페이지는 `/vendor/status/[token]`으로, 신청 제출 시 발급된 토큰으로 로그인 없이
접근합니다(실제 운영에서는 이 링크가 카카오 친구톡 메시지의 버튼으로 전달됩니다).

## 아직 실제 연동이 필요한 부분 (Mock으로 대체됨)

문서 1단계 "확인 필요 사항"에서 조직적으로 아직 미확정이라고 명시된 두 축은, 어댑터
인터페이스를 분리해두고 지금은 **개발용 Mock 구현체**로 동작하도록 만들어져 있습니다.
실제 값이 정해지면 아래 두 지점만 교체하면 됩니다.

1. **SSO 로그인** — 회사 IdP가 미정이라, `AUTH_MODE=mock`일 때 `POST /api/auth/dev-login`으로
   사번만으로 로그인합니다. 실제 OIDC 공급자가 정해지면 `apps/api/src/auth`에 OIDC 콜백
   로직을 추가하고 `AUTH_MODE=oidc`로 전환하면 됩니다.
2. **꽃집 발송(카카오 친구톡)** — CPaaS 대행사(비즈엠/Solapi/NHN Cloud 등) 계약 전이라,
   `VENDOR_ADAPTER=mock`일 때는 실제 발송 없이 로그만 남기고 항상 성공 처리합니다.
   대행사가 정해지면 `apps/api/src/vendor/kakao-friendtalk.adapter.ts`의 엔드포인트/필드명을
   해당 대행사의 공식 API 문서에 맞춰 채우고 `VENDOR_ADAPTER=kakao`로 전환하면 됩니다.
   웹훅 서명 검증(`apps/api/src/webhooks`)도 대행사의 실제 서명 방식에 맞춰야 합니다.

파일 스토리지도 로컬 디스크(`STORAGE_DRIVER=local`)로 동작합니다 — 운영 배포 전 S3 등
오브젝트 스토리지로 교체를 권장합니다(`apps/api/src/storage`).

## 검증한 내용

- 백엔드: `tsc --noEmit`, `nest build` 통과. 로컬 PostgreSQL에 마이그레이션/시드를 적용하고
  실제 서버를 띄운 뒤 신청 제출 → Mock 꽃집 발송 → 원터치 접수/완료(사진 업로드) →
  관리자 목록/상세/취소/수동처리/엑셀 추출까지 curl로 전 구간을 직접 실행해 확인했습니다.
- 프론트엔드: `tsc --noEmit`, `next build` 통과. Playwright(Chromium)로 로그인 →
  신청 목록/상세/신규작성 → 관리자 목록/상세/설정 → 꽃집 공개 페이지까지 실제 브라우저로
  클릭 경로를 재현해, 하이드레이션 불일치와 파일 URL 깨짐(첨부/완료사진 링크가 프론트
  origin으로 잘못 해석되던 문제) 등 통합 과정에서 드러난 버그를 고쳤습니다.

## 남은 조직적 결정 사항

각 설계 문서의 "확인 필요 사항"에 정리되어 있으며, 대표적으로:

- SSO 공급자 선정, 카카오 친구톡 발송 대행사 선정 및 계약
- 사전승인 판정 기준값(유형별/금액별 임계값) 확정 — 현재 시드 값은 예시입니다
- 개인정보 보관 기간 및 접근 권한 정책
- 엑셀 정산 추출의 부서별/거래처별 집계 항목 확정
