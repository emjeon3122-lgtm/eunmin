# 실적 대시보드 서버 (Synology NAS 설치용)

PC용 `실적대시보드.html` 과 같은 화면을 회사 NAS 에서 제공합니다.
관리자가 올린 자료는 서버에 계속 보관되고, 조회자는 회사 계정(SSO)으로 로그인해 **자기 권한의 본부 자료만** 받습니다.

- Node.js 22 기본 모듈만 사용합니다(외부 패키지 없음). Docker 이미지 하나로 실행됩니다.
- 엑셀은 **관리자 브라우저에서 읽고**, 계산에 필요한 값만 서버에 저장합니다(원본 엑셀 파일은 서버에 남지 않음).
- 권한 필터링은 **서버에서** 합니다. 권한 밖 본부의 행은 조회자 브라우저로 아예 보내지 않습니다.
  법인 전체 값인 자금·예수금은 기본적으로 모든 조회자에게 보이며, 입력용 `설정` 시트의
  '자금·예수금 공개'를 `전체권한자`로 바꾸면 전체 권한자에게만 보냅니다.

## 구성 (이 NAS 기준)

| 항목 | 값 |
|---|---|
| NAS | Synology DS1019+, DSM 7.3, Container Manager |
| 네트워크 | `network_mode: host` (이 NAS 는 컨테이너 간 bridge 통신 불가) |
| 앱 포트 | `127.0.0.1:7020` (http, NAS 안에서만) — 보조 컨테이너 없음 |
| 사용자 주소 | `https://192.168.100.25:7021` (DSM 역방향 프록시 https 7021 → http://127.0.0.1:7020) |
| 접속 범위 | 사내망 + SSL-VPN(FortiGate). 인터넷 직접 공개 없음 |
| 로그인 | Microsoft Entra ID (테넌트 bdo.kr), 허용 도메인 `bdo.kr` |
| **리디렉션 URI** | **`https://192.168.100.25:7021/auth/callback`** (플랫폼: 웹) |
| 관리자 | Entra 앱 역할 `Admin` 또는 `.env` 의 `ADMIN_EMAILS` |
| 자료 저장 | `./data` (JSON 파일, DB 불필요). 매일 자동 백업 `./data/backups` |

## 설치 (IT 담당자)

1. 이 폴더를 NAS 에 복사한다(예: `/volume1/docker/silgeok-dashboard`).
2. `.env.example` 을 `.env` 로 복사하고 값을 채운다(아래 변수 표). `.env` 는 공유하지 않는다.
3. Container Manager › 프로젝트 › 생성 › 이 폴더 선택(`docker-compose.yml`) → 빌드·실행.
4. NAS 에서 `curl http://127.0.0.1:7020/healthz` 가 `ok` 이면 정상.
5. DSM › 제어판 › 로그인 포털 › 고급 › 역방향 프록시:
   원본 `HTTPS` `*` `7021` → 대상 `HTTP` `localhost` `7020`.
   사용자 지정 머리글에 `X-Forwarded-For`(`$proxy_add_x_forwarded_for`)를 추가하면 접속 기록에 사용자 IP 가 남는다.
6. 방화벽: TCP 7021 만 사내망·VPN 대역에 연다(7020 은 127.0.0.1 로만 열려 있어 외부에서 닿지 않음).

## .env 변수

| 변수 | 내용 |
|---|---|
| `OIDC_TENANT_ID` | Entra 테넌트 ID (발급자 주소는 이 값으로 자동 구성) |
| `OIDC_CLIENT_ID` | 앱(클라이언트) ID |
| `OIDC_CLIENT_SECRET` | 클라이언트 비밀 |
| `SESSION_SECRET` | 세션 암호화 키, 32자 이상 임의 문자열 (예: `openssl rand -base64 48`). 바꾸면 모두 다시 로그인 |
| `PUBLIC_URL` | `https://192.168.100.25:7021` |
| `ALLOWED_EMAIL_DOMAINS` | `bdo.kr` |
| `OIDC_ADMIN_ROLE` | `Admin` (이 앱 역할을 받은 사람은 관리자) |
| `ADMIN_EMAILS` | 처음 설정용 관리자 이메일(쉼표 구분). 역할 설정 전에도 관리자가 들어갈 수 있게 |
| `AUTH_MODE` | `oidc` (SSO 연결 전 임시로만 `local` + `LOCAL_ADMIN_PASSWORD_HASH`) |
| `PORT` / `HOST` | `7020` / `127.0.0.1` |
| `TRUST_PROXY` / `COOKIE_SECURE` | `true` / `true` |
| `BACKUP_HOUR` / `BACKUP_KEEP_DAYS` / `BACKUP_DIR` | 자동 백업 시각(기본 3시) / 보관 일수(30) / 폴더(기본 `/data/backups`) |

비밀값은 `변수이름_FILE=/경로` 로 파일에서 읽게 할 수도 있다(`OIDC_CLIENT_SECRET_FILE`, `SESSION_SECRET_FILE` 등).

## Entra ID 앱 등록

1. 앱 등록 › 새 등록: 이 조직 디렉터리의 계정만 / 리디렉션 URI(웹) `https://192.168.100.25:7021/auth/callback`
2. 인증서 및 암호 › 새 클라이언트 암호 → `.env` 의 `OIDC_CLIENT_SECRET`
3. 앱 역할 › `Admin` (허용 멤버: 사용자/그룹) 만들고, 엔터프라이즈 애플리케이션에서 관리자에게 할당.
   역할 정보는 ID 토큰의 `roles` 클레임으로 들어온다.
4. 로그인 흐름: Authorization Code + PKCE. ID 토큰 서명(RS256), 발급자, 대상, 만료, nonce, 테넌트(tid), 이메일 도메인을 검사한다.

자체 서명 인증서라 브라우저에 "안전하지 않음" 경고가 뜨지만 로그인은 동작한다. 정식 인증서·도메인이 정해지면
`PUBLIC_URL` 과 Entra 리디렉션 URI 만 바꾸면 된다.

## 권한 관리 (관리자)

입력용 엑셀의 `권한` 시트:

| 이메일 | 본부 | 역할 |
|---|---|---|
| ceo@bdo.kr | 전체 | 조회 |
| busan.head@bdo.kr | 부산 | 조회 |
| manager@bdo.kr | 1본부, 2본부 | 조회 |
| staff@bdo.kr | 전체 | 관리자 |

- `본부`: 쉼표로 여러 개, `전체` 는 모든 본부. `역할`: `관리자`(자료 올리기·확정 관리) 또는 `조회`.
- 목록에 없는 계정은 로그인해도 "권한 없음" 화면만 본다. Entra 역할 `Admin` 과 `ADMIN_EMAILS` 는 항상 관리자다.

## 백업과 복구

- 서버가 **매일 `BACKUP_HOUR` 시 이후 한 번** `data/backups/dashboard-backup-YYYYMMDD.json` 을 만들고 `BACKUP_KEEP_DAYS` 일 지난 파일은 지운다.
  월별 자료·확정 상태·입력용 설정이 모두 들어 있다. NAS 밖 보관 체계가 생기기 전까지 이 폴더를 주기적으로 다른 곳에 복사해 두길 권한다.
- 관리자 화면 **검증·자료 관리** 탭: '백업 파일 받기'(지금 상태), '계약 원장 CSV(엑셀용)', 데이터 요약 탭의 'CSV 다운로드'.
- 복구: 빈 서버에 관리자로 로그인 → '자료 올리기'로 백업 파일(.json) 하나를 올리면 그대로 복구된다.

## 매월 작업 (관리자)

1. 접속 → **자료 올리기** → 이번 달 ERP/1차 가공 파일(필요하면 입력용 엑셀도)을 고른다.
2. 과거 자료는 처음 한 번만 올린다. PC 버전의 **마감자료(.json)** 를 올리면 그 달들은 확정 상태로 들어간다.
3. 월 마감 후 **검증·자료 관리** 탭에서 "이 달까지 확정(🔒)". 확정된 달은 같은 달 파일을 다시 올려도 바뀌지 않는다.

## 개발·시험

```
python3 ../build.py        # public/index.html 도 함께 만든다
NODE_PATH=/opt/node22/lib/node_modules node tests/e2e.cjs <expected.json> <입력용(권한 시트 포함).xlsx> <작업파일...>
```

`tests/e2e.cjs` 는 임시 폴더에 서버를 띄워 관리자 로그인·업로드·숫자 대조·확정 보호·재시작 후 로그인 유지·자동 백업,
가짜 OIDC 제공자로 SSO·Entra 역할·도메인 제한·본부별 권한 필터링, 백업 파일로 빈 서버 복구를 확인한다(실적 파일은 저장소에 넣지 않는다).
