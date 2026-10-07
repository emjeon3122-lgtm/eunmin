# 업데이트 방법 (IT 담당자)

새 버전 zip 을 받으면 아래 순서로 반영합니다. 자료(`data/`)와 설정(`.env`)은 그대로 둡니다.

1. **백업**: 대시보드 › 검증·자료 관리 › '백업 파일 받기' 로 지금 상태를 내려받아 둔다
   (또는 NAS 의 `data/` 폴더를 통째로 복사).
2. **파일 교체**: zip 을 풀어 NAS 의 대시보드 폴더에 덮어쓴다.
   `.env` 와 `data/` 는 zip 에 들어 있지 않으므로 그대로 남는다.
3. **다시 빌드·실행**: Container Manager › 프로젝트 › 대시보드 › 작업 › **빌드** 후 시작
   (명령줄이면 `docker compose up -d --build`).
4. **확인**: NAS 에서 `curl http://127.0.0.1:7020/healthz` → `ok`(본문은 항상 `ok` 두 글자),
   버전은 `curl -s -D - -o /dev/null http://127.0.0.1:7020/healthz | grep -i x-dashboard-version`(GET 요청) 또는
   대시보드 화면 맨 아래 "버전 ○○○○" 로 새 버전인지 본다.

운영 Docker 설정을 따로 관리한다면, 새 zip 의 `Dockerfile`·`docker-compose.yml` 에서 아래만 맞춰 주면 된다.
- 꼭 필요: 시간대 `TZ=Asia/Seoul` (Dockerfile `ENV` 또는 `.env`). 없으면 UTC 로 돌아 자동 확정일·자동 백업 시각이 9시간 어긋난다.
- 권장: `COPY server.js VERSION ./` (없으면 동작은 같고 버전만 `unknown` 으로 보인다).
- 권장(보안): compose 의 `cap_drop: [ALL]`, `mem_limit`, `pids_limit`, `read_only`, `no-new-privileges`. 없어도 동작은 같다.
- `./data:/data` 볼륨은 쓰기 가능해야 한다(로그아웃 세션 목록 `revoked-sessions.json` 도 여기 저장).

예전 버전 자료는 그대로 읽는다. 본부매핑 예전 형식은 읽을 때 자동 변환하고 `input.json` 파일은 바꾸지 않는다.

**예전 버전에서 확정한 달(기장 수기분)** — 서버를 켤 때 한 번 정리한다. 바꿀 것이 있으면 **먼저** 백업 폴더
(`BACKUP_DIR`, 기본 `data/backups`)에 `pre-upgrade-YYYYMMDDTHHMMSS.json` 을 디스크에 다 쓴 뒤에 바꾸고,
백업을 못 만들면 아무것도 바꾸지 않는다. 이 파일은 자동 삭제되지 않으며 '자료 올리기'로 올리면 그대로 복구된다.
- 그 달 입력용 기장추가가 없거나 저장값과 같으면 값은 그대로 두고 고정 표시만 붙인다.
- 둘이 다르면 어느 버전에서 확정했는지에 따라 맞는 값이 다르고, 저장된 모양만으로는 구분할 수 없다.
  기본은 **아무것도 바꾸지 않고** 서버 로그와 관리자 검증 탭에 '확인 필요' 로 알린다(그동안 화면은 입력용 기장추가 기준).
  어느 버전에서 올라왔는지 확인한 뒤 `.env` 에 한 줄 넣고 다시 시작하면 그 기준으로 고정한다.
  - `LEGACY_LOCK_GIJANG=input` — 2026.10.06-6 이하에서 업데이트(그때 화면 = 입력용 기장추가). 원래 저장값은 `manualBeforeFix` 에 남긴다.
  - `LEGACY_LOCK_GIJANG=stored` — 2026.10.06-7·-8 에서 업데이트(그때 화면 = 확정 때 고정한 저장값).
- 결과는 `audit.log` 에 `fix-gijang`(백업 파일 이름 포함)으로 남는다. 정리가 끝난 뒤에는 이 설정을 지워도 된다.

문제가 생기면 이전 zip 으로 2~3 단계를 다시 하면 되돌아간다. `data/` 형식이 바뀌는 업데이트는
`CHANGELOG.md` 에 따로 적는다.
