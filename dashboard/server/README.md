# 실적 대시보드 서버 (NAS 설치용)

PC용 `실적대시보드.html` 과 같은 화면을 회사 서버에서 제공합니다.
관리자가 올린 자료는 서버에 계속 보관되고, 조회자는 로그인해서 **자기 권한의 본부 자료만** 받습니다.

- Node.js 22 기본 모듈만 사용합니다(외부 패키지 없음). Docker 이미지 하나로 실행됩니다.
- 엑셀은 **관리자 브라우저에서 읽고**, 계산에 필요한 값만 서버에 저장합니다(원본 엑셀 파일은 서버에 남지 않음).
- 권한 필터링은 **서버에서** 합니다. 권한 밖 본부의 행은 조회자 브라우저로 아예 보내지 않습니다.
  법인 전체 자료인 자금·예수금은 전체 권한자에게만 보냅니다.

## 설치 (IT 담당자)

1. 이 `server` 폴더를 NAS 의 Docker 작업 폴더(예: `/volume1/docker/dashboard`)에 복사한다.
2. `.env.example` 을 `.env` 로 복사하고 값을 채운다. `.env` 에는 비밀값이 들어가므로 공유하지 않는다.
3. SSO 연결 전 임시 관리자 비밀번호 해시를 만든다.
   ```
   docker compose build
   docker compose run --rm dashboard node tools/hash-password.js
   ```
   출력값을 `.env` 의 `LOCAL_ADMIN_PASSWORD_HASH` 에 넣고, `ADMIN_EMAILS` 에 관리자 이메일을 넣는다.
4. 실행: `docker compose up -d` → `http://NAS주소:8080/healthz` 가 `ok` 이면 정상.
5. **HTTPS**: NAS 의 역방향 프록시(Synology: 제어판 › 로그인 포털 › 고급 › 역방향 프록시)로
   `https://dashboard.회사도메인` → `http://localhost:8080` 을 연결하고 인증서를 붙인다.
   HTTPS 로 접속하는 동안 `COOKIE_SECURE=true` 를 유지한다.
6. **백업**: `data/` 폴더를 NAS 백업(Hyper Backup 등) 대상에 넣는다. 실적 자료와 변경 기록(`audit.log`)이 여기에 있다.
7. 방화벽: 사내망에서만 접속하도록 제한한다(외부 접속이 필요하면 VPN 경유 권장).

## SSO 연결 (Microsoft Entra ID)

1. Microsoft 365 관리자가 Entra 관리 센터 › 앱 등록 › 새 등록
   - 지원 계정: **이 조직 디렉터리의 계정만**
   - 리디렉션 URI(웹): `https://dashboard.회사도메인/auth/callback`
2. 인증서 및 암호 › 새 클라이언트 암호 → 값을 `.env` 의 `OIDC_CLIENT_SECRET` 에 넣는다(대화창·메일로 보내지 않는다).
3. `.env` 설정 후 재시작 (`docker compose up -d`)
   ```
   AUTH_MODE=oidc
   PUBLIC_URL=https://dashboard.회사도메인
   OIDC_ISSUER=https://login.microsoftonline.com/<테넌트ID>/v2.0
   OIDC_TENANT_ID=<테넌트ID>
   OIDC_CLIENT_ID=<애플리케이션(클라이언트) ID>
   OIDC_CLIENT_SECRET=<클라이언트 암호>
   ```
4. 로그인은 Authorization Code + PKCE, ID 토큰 서명(RS256)·발급자·대상·만료·nonce·테넌트를 검사한다.

## 권한 관리 (관리자)

입력용 엑셀에 `권한` 시트를 만들고 올린다.

| 이메일 | 본부 | 역할 |
|---|---|---|
| ceo@회사 | 전체 | 조회 |
| busan.head@회사 | 부산 | 조회 |
| manager@회사 | 1본부, 2본부 | 조회 |
| staff@회사 | 전체 | 관리자 |

- `본부`: 쉼표로 여러 개, `전체` 는 모든 본부. `역할`: `관리자`(자료 올리기·확정 관리) 또는 `조회`.
- 목록에 없는 계정은 로그인해도 "권한 없음" 화면만 본다. `.env` 의 `ADMIN_EMAILS` 는 항상 관리자다.

## 매월 작업 (관리자)

1. 접속 → **자료 올리기** → 이번 달 ERP/1차 가공 파일(필요하면 입력용 엑셀도)을 고른다.
2. 과거 자료는 처음 한 번만 올리면 된다. PC 버전에서 만든 **마감자료(.json)** 를 올리면 그 달들은 확정 상태로 들어간다.
3. 월 마감 후 **검증·자료 관리** 탭에서 "이 달까지 확정(🔒)". 확정된 달은 같은 달 파일을 다시 올려도 바뀌지 않는다.
   잘못 올린 달은 '삭제'(확정된 달은 '확정 풀기' 후) 뒤 다시 올린다.

## 개발·시험

```
python3 ../build.py                     # public/index.html 도 함께 만든다
node server.js                          # 환경변수는 .env.example 참고
NODE_PATH=/opt/node22/lib/node_modules node tests/e2e.cjs <expected.json> <입력용(권한 시트 포함).xlsx> <작업파일...>
```

`tests/e2e.cjs` 는 임시 폴더에 서버를 띄워 관리자 로그인·업로드·숫자 대조·확정 보호·재시작 유지,
가짜 OIDC 제공자로 SSO 로그인과 본부별 권한 필터링, 권한 없는 계정 차단을 확인한다(실적 파일은 저장소에 넣지 않는다).
