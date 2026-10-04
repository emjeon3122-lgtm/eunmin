# NAS(Synology) 운영 배포 안내

경조사 화환 신청 앱을 Synology NAS의 Container Manager(Docker)로 운영하기 위한 안내입니다.
대상 장비: DS1019+ (linux/amd64), DSM 7.3, Container Manager.

## 1. 구성

```
사용자/꽃집 ──HTTPS──▶ Cloudflare ──Tunnel──▶ cloudflared ──▶ web:3000 ──(내부)──▶ api:4000 ──▶ /data
                                              └──────────── 같은 컨테이너 네트워크(wreath) ────────────┘
```

| 컨테이너 | 역할 | 포트 | 외부 노출 |
|---|---|---|---|
| `web` | 화면(Next.js). `/api` 요청은 내부에서 `api`로 전달 | 3000 (0.0.0.0) | Tunnel 대상 `http://web:3000` |
| `api` | 서버(NestJS), DB, 파일 저장 | 4000 | 없음 |
| `cloudflared` | Cloudflare Tunnel | - | - |

- **NAS 호스트 포트는 하나도 열지 않습니다.** 들어오는 연결은 Tunnel뿐입니다.
- **별도 DB 서버는 없습니다.** DB는 SQLite 파일 1개이며, 사진과 함께 `DATA_DIR` 한 폴더에 저장됩니다.
- 컨테이너는 지정한 일반 계정(UID/GID)으로 실행되고, `DATA_DIR` 외의 NAS 폴더는 연결하지 않습니다.

### 저장 데이터 (`DATA_DIR`)

```
DATA_DIR/
├── db/wreath.db     신청서, 사용자, 알림톡 발송 기록, 알림
└── uploads/         파트너 승인 증빙, 청첩장·부고장 사진, 배송완료 사진
```

컨테이너를 삭제하거나 새 버전으로 다시 만들어도 이 폴더는 그대로 남습니다.

## 2. 사전 준비 (NAS 관리자)

### 2-1. 전용 폴더와 실행 계정
1. 앱 전용 공유폴더를 만듭니다. 예: `/volume1/wreath-app`
2. 앱 실행 전용 계정을 만들고, **이 공유폴더에만 읽기/쓰기 권한**을 줍니다.
3. SSH로 접속해 계정의 UID/GID를 확인합니다.
   ```sh
   id 계정명      # 예: uid=1030(wreath) gid=100(users)
   ```
4. 데이터 폴더를 만들고 소유자를 그 계정으로 지정합니다.
   ```sh
   sudo mkdir -p /volume1/wreath-app/data
   sudo chown -R 1030:100 /volume1/wreath-app/data   # 위에서 확인한 UID:GID
   ```

### 2-2. Cloudflare Tunnel
1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared 방식).
2. 설치 화면의 토큰(`eyJ...`)만 복사해 둡니다. 설치 명령은 실행하지 않습니다(컨테이너로 실행).
3. Public Hostname 추가:
   - Subdomain / Domain: 사용할 주소 (예: `wreath.회사도메인`)
   - Service: Type `HTTP`, URL `web:3000`

### 2-3. 방화벽 (NAS → 외부, 나가는 연결)

| 대상 | 용도 | 시점 |
|---|---|---|
| Cloudflare (TCP/UDP 7844, TCP 443) | Tunnel | 상시 |
| `api.solapi.com:443` | 알림톡 발송 | 상시 |
| `login.microsoftonline.com:443` | Microsoft 365 로그인 | 로그인 연동 후 상시 |
| Docker Hub (`registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`) | 기본 이미지 내려받기 | 설치·업데이트 시 |
| `registry.npmjs.org:443` | 앱 의존성 설치 | 설치·업데이트 시 |
| `deb.debian.org:443/80` | 이미지 내부 OpenSSL 설치 | 설치·업데이트 시 |
| `binaries.prisma.sh:443` | DB 엔진 내려받기 | 설치·업데이트 시 |
| `api.anthropic.com:443` | 청첩장 AI 자동 채우기 | 기능을 켤 때만(기본 꺼짐) |

## 3. 설치

SSH로 NAS에 접속해 진행합니다. 소스는 앱 폴더 안의 `app`에 두고, 데이터 폴더(`data`)와 분리합니다.

### 3-1. 소스 받기 (둘 중 하나)

**압축 파일로 받은 경우** — File Station으로 압축 파일을 `/volume1/wreath-app`에 올린 뒤:

```sh
cd /volume1/wreath-app
mkdir app && cd app
7z x ../wreath-app-*.zip      # 또는 File Station에서 app 폴더에 압축 풀기
```

**GitHub에서 받는 경우:**

```sh
cd /volume1/wreath-app
git clone -b <배포 브랜치> <저장소 주소> app
```

### 3-2. 설정 및 실행 (공통)

```sh
cd /volume1/wreath-app/app/deploy

# 1) 설정 파일 만들기
cp .env.example .env
vi .env          # 아래 "필수 설정" 참고

# 2) 빌드 및 실행 (첫 빌드는 DS1019+ 기준 수 분~10분 정도 걸립니다)
sudo docker compose up -d --build

# 3) 상태 확인 — api, web, cloudflared 모두 Up (healthy)이면 정상
sudo docker compose ps
```

Container Manager 화면을 쓰려면: 프로젝트 → 생성 → 경로에 `.../app/deploy` 선택 → 기존
`docker-compose.yml` 사용. (`.env`는 위 1단계처럼 먼저 만들어 둡니다.)

### 필수 설정 (`.env`)

| 항목 | 내용 |
|---|---|
| `DATA_DIR` | 2-1에서 만든 데이터 폴더 (예: `/volume1/wreath-app/data`) |
| `APP_UID`, `APP_GID` | 2-1에서 확인한 실행 계정 UID/GID |
| `CLOUDFLARE_TUNNEL_TOKEN` | 2-2의 Tunnel 토큰 |
| `APP_BASE_URL` | 실제 접속 주소 (`https://...`). 알림톡 버튼 링크에 쓰입니다 |
| `JWT_SECRET` | 32자 이상 임의 문자열. `openssl rand -hex 32` 결과를 넣으면 됩니다 |

`JWT_SECRET`이 짧거나 `APP_BASE_URL`이 https가 아니면 **api가 시작되지 않고** 로그에 이유가
표시됩니다. 잘못된 설정으로 인터넷에 공개되는 것을 막기 위한 동작입니다.

### 설치 확인
- 브라우저에서 `https://<도메인>/api/health` → `{"data":{"status":"ok"}}`
- `https://<도메인>/login` 화면이 열리는지 확인

## 4. 업데이트

**압축 파일로 받은 경우:** 새 압축 파일의 내용으로 `app` 폴더를 덮어쓰되, **`deploy/.env`는
그대로 둡니다**(압축 파일에는 `.env`가 들어있지 않으므로 덮어써도 지워지지 않습니다). 그다음:

```sh
cd /volume1/wreath-app/app/deploy
sudo docker compose up -d --build
```

**GitHub에서 받는 경우:**

```sh
cd /volume1/wreath-app/app
git pull
cd deploy
sudo docker compose up -d --build
```

- DB 구조 변경(마이그레이션)은 api가 시작될 때 자동 적용됩니다.
- 데이터 폴더는 그대로 유지됩니다. 업데이트 전 스냅샷을 찍어두면 되돌리기 쉽습니다.

## 5. 운영

| 작업 | 명령 |
|---|---|
| 상태 확인 | `sudo docker compose ps` |
| 로그 보기 | `sudo docker compose logs -f api` (또는 `web`, `cloudflared`) |
| 재시작 | `sudo docker compose restart` |
| 중지 | `sudo docker compose down` (데이터는 유지) |

- **자동 복구:** 모든 컨테이너는 `restart: unless-stopped`입니다. NAS가 재부팅되면 Docker가
  올라오면서 자동으로 다시 시작됩니다.
- **로그 용량:** 컨테이너마다 10MB × 3개까지만 보관합니다.
- **시간대:** 컨테이너는 한국 시간(Asia/Seoul)으로 동작합니다.

### 백업과 복구
- `DATA_DIR` 폴더 하나만 백업하면 됩니다.
- SQLite는 운영 중 파일을 그대로 복사하면 깨진 사본이 생길 수 있습니다.
  **Snapshot Replication(Btrfs 스냅샷)**으로 폴더 단위 백업을 권장합니다. 일반 파일 복사
  방식으로 백업한다면 `docker compose stop api` 후 복사하고 다시 `start` 하세요.
- 복구: `docker compose down` → 폴더 복원 → `docker compose up -d`

## 6. 시험 운영 시 참고

Microsoft 365 로그인 연동 전에는 정식 로그인 수단이 없습니다. 시험할 때만 아래처럼 개발용
사번 로그인을 켤 수 있습니다.

```sh
# .env
ALLOW_DEV_LOGIN=true

# 시험용 샘플 계정 생성 (A0001 관리자, E1001·E1002 직원)
sudo docker compose up -d
sudo docker compose exec api node dist-seed/seed.js
```

> ⚠️ 개발용 로그인을 켜면 **주소를 아는 누구나 사번만으로 들어올 수 있습니다.** 시험 기간에는
> Cloudflare Access로 도메인 전체를 회사 이메일 인증 뒤에 두는 것을 권장합니다. 시험이 끝나면
> `ALLOW_DEV_LOGIN`을 지우고, 샘플 데이터가 들어간 DB는 지운 뒤(`data/db/wreath.db`) 다시 시작하세요.

## 7. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| api가 계속 재시작 | `docker compose logs api`에서 `운영 설정 오류` 메시지 확인 → `.env` 수정 |
| `EACCES` / `permission denied` | `DATA_DIR` 소유자가 `APP_UID:APP_GID`인지 확인 (2-1의 4번) |
| 도메인 접속 시 502 | `web`이 healthy인지, Tunnel Service가 `web:3000`인지 확인 |
| `cloudflared` 연결 실패 | 토큰 값, 방화벽 7844 포트 허용 여부 확인 |

## 8. 아직 남은 개발 작업

배포 구성과 별개로, 정식 오픈 전에 아래 작업이 이어집니다.
- Microsoft 365 로그인 (연동 값은 전산 담당자가 `.env`의 `OIDC_*`에 직접 입력)
- 업로드 파일 접근 제어 (로그인 또는 꽃집 링크 확인 후에만 파일 제공)
- 알림톡 중복 발송 방지, 솔라피 발송 결과 콜백 인증 정리
