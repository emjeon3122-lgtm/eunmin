# 사내 경조사 화환 자동 발송 앱

임직원이 결혼/부고 등 경조사 화환을 신청하면 관리자(총무·HR) 승인 없이 계약 꽃집으로 즉시
전달되고(카카오 알림톡, CPaaS: Solapi), 꽃집이 로그인 없는 원터치 링크에서 접수/배송완료를
직접 갱신하는 사내 시스템입니다. 설계 배경과 확정된 정책은 [`docs/`](./docs)의 4개 설계
문서를 참고하세요(문서 작성 당시엔 친구톡으로 결정됐다가 이후 알림톡/Solapi로 확정되어
코드가 문서와 다른 부분이 있습니다 — 코드 쪽이 최신입니다).

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

Windows에서는 아래 수동 단계 대신 [`run_local_test.bat`](./run_local_test.bat)을 더블클릭하면
Git/Node.js가 없을 경우 자동 설치(winget, 최초 1회 관리자 권한 필요) → git 저장소면 최신
커밋으로 자동 업데이트 → DB 기동 → 백엔드/프론트엔드 설치·마이그레이션·시드·실행 → 브라우저
열기까지 한 번에 처리합니다. Docker는 필수가 아닙니다 — 설치돼 있으면 자동으로 로컬 DB
컨테이너를 띄우고, 없으면 건너뛰고 `apps/api/.env`의 `DATABASE_URL`이 가리키는 PostgreSQL을
그대로 사용합니다(Neon 등 무료 클라우드 PostgreSQL을 붙여도 됩니다).

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

SSO는 여전히 미정이라 어댑터 인터페이스를 분리해 **개발용 Mock 구현체**로 동작합니다.
꽃집 발송은 CPaaS 대행사가 **Solapi(카카오 알림톡)로 확정**되었지만, 실제 계약/API 키가
아직 없어 마찬가지로 Mock으로 동작 중입니다. 실제 값이 정해지면 아래 두 지점만 교체하면
됩니다.

1. **SSO 로그인** — 회사 IdP가 미정이라, `AUTH_MODE=mock`일 때 `POST /api/auth/dev-login`으로
   사번만으로 로그인합니다. 실제 OIDC 공급자가 정해지면 `apps/api/src/auth`에 OIDC 콜백
   로직을 추가하고 `AUTH_MODE=oidc`로 전환하면 됩니다.
2. **꽃집 발송(Solapi 알림톡)** — `VENDOR_ADAPTER=mock`일 때는 실제 발송 없이 로그만 남기고
   항상 성공 처리합니다. Solapi 계약/API 키가 준비되면
   `apps/api/src/vendor/solapi-alimtalk.adapter.ts`의 엔드포인트/필드명·사전 심사된
   알림톡 템플릿 변수명을 Solapi 공식 문서에 맞춰 채우고 `VENDOR_ADAPTER=kakao`로
   전환하면 됩니다. 웹훅 서명 검증(`apps/api/src/webhooks`)도 Solapi의 실제 서명 방식에
   맞춰야 합니다.

### 꽃집 사진 매칭

알림톡 버튼으로 열리는 `/vendor/status/[token]`에서 업로드하면 토큰 자체가 주문을
특정하므로 매칭 문제가 없습니다. (카톡 대화방에 사진만 올리는 경우를 위한 별도 자동
매칭 경로도 검토했지만, 꽃집이 항상 버튼으로만 사진을 올린다고 가정할 수 있어 토큰
링크 방식 하나로 충분하다고 판단해 빼기로 했습니다.)

파일 스토리지도 로컬 디스크(`STORAGE_DRIVER=local`)로 동작합니다 — 운영 배포 전 S3 등
오브젝트 스토리지로 교체를 권장합니다(`apps/api/src/storage`).

### 청첩장/부고장 URL·OCR 자동 채우기

신청서 작성 중 모바일 청첩장/부고장 URL이나 사진(최대 2장)으로 배송 정보를 자동으로
채워주는 기능도 실제 제공자가 정해지지 않아 같은 패턴(인터페이스 + Mock)으로 구조만
잡아뒀습니다(`apps/api/src/invitation-parser`). 지금은 항상 빈 결과를 반환하므로 —
이 기능은 원래도 선택 입력이라 신청 자체는 막히지 않습니다 — 실제 OCR(네이버 클로바
OCR 등) 또는 청첩장 URL 파싱 서비스가 정해지면 `InvitationParserAdapter`를 구현하는
어댑터를 추가하기만 하면 됩니다.

### 파트너 승인 게이팅

사전승인 필요 여부는 더 이상 금액 기준이 아니라 **신청자의 파트너 여부**
(`User.isPartner`)로 판정합니다 — 파트너가 아니면 제출 시 파트너 승인 증빙(PDF/이미지,
최대 10MB) 첨부가 필수입니다. 기존 금액 기준 사전승인 규칙(`approval_rules` 테이블,
관리자 화면)은 남겨뒀지만 제출 흐름에서는 더 이상 참조하지 않습니다.

## 검증한 내용

- 백엔드: `tsc --noEmit`, `nest build` 통과. 로컬 PostgreSQL에 마이그레이션/시드를 적용하고
  실제 서버를 띄운 뒤 신청 제출 → Mock 꽃집 발송 → 원터치 접수/완료(사진 업로드) →
  관리자 목록/상세/취소/수동처리/엑셀 추출까지 curl로 전 구간을 직접 실행해 확인했습니다.
- 프론트엔드: `tsc --noEmit`, `next build` 통과. Playwright(Chromium)로 로그인 →
  신청 목록/상세/신규작성 → 관리자 목록/상세/설정 → 꽃집 공개 페이지까지 실제 브라우저로
  클릭 경로를 재현해, 하이드레이션 불일치와 파일 URL 깨짐(첨부/완료사진 링크가 프론트
  origin으로 잘못 해석되던 문제) 등 통합 과정에서 드러난 버그를 고쳤습니다.
- 다단계 신청서: 비파트너/파트너 양쪽 경로, 결혼(신랑측)+고객사(현재 고객) 조합으로
  1~5단계를 실제로 다 걸어가며 제출까지 확인. 그 과정에서 초기 경조사 유형(결혼)의
  리본 기본값이 드롭다운을 직접 바꾸기 전까진 채워지지 않던 문제와, 발송 대상을
  고객사→본인으로 되돌릴 때 이전 케이스의 비용코드 기본값이 남아있던 문제를 발견해
  고쳤습니다.

## 신청서 다단계 폼

`/requests/new`는 5단계 마법사 형태입니다: ① 파트너 검증(비파트너만 증빙 첨부) →
② 경조사 선택(결혼/부고 참고 이미지, 개업·승진 동양란/서양란 참고 이미지 포함) →
③ 비용코드·발송사유(고객사 현재/잠재 고객·본인 케이스별로 다른 입력) →
④ 주문 정보(청첩장 URL/OCR 자동 채우기 포함, 결혼이면 신랑측/신부측 선택 추가) →
⑤ 확인 및 제출. 참고 이미지는 `apps/web/public/occasion-references/`에 있습니다.

## 남은 조직적 결정 사항

각 설계 문서의 "확인 필요 사항"에 정리되어 있으며, 대표적으로:

- SSO 공급자 선정
- Solapi 실제 계약/API 키 발급, 알림톡 템플릿 사전 심사·등록
- 사전승인 판정 기준값(유형별/금액별 임계값) 확정 — 현재 시드 값은 예시입니다
- 개인정보 보관 기간 및 접근 권한 정책
- 엑셀 정산 추출의 부서별/거래처별 집계 항목 확정, 비용 코드 체계
