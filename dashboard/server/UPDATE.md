# 업데이트 방법 (IT 담당자)

새 버전 zip 을 받으면 아래 순서로 반영합니다. 자료(`data/`)와 설정(`.env`)은 그대로 둡니다.

1. **백업**: 대시보드 › 검증·자료 관리 › '백업 파일 받기' 로 지금 상태를 내려받아 둔다
   (또는 NAS 의 `data/` 폴더를 통째로 복사).
2. **파일 교체**: zip 을 풀어 NAS 의 대시보드 폴더에 덮어쓴다.
   `.env` 와 `data/` 는 zip 에 들어 있지 않으므로 그대로 남는다.
3. **다시 빌드·실행**: Container Manager › 프로젝트 › 대시보드 › 작업 › **빌드** 후 시작
   (명령줄이면 `docker compose up -d --build`).
4. **확인**: NAS 에서 `curl http://127.0.0.1:7020/healthz` → `ok`(본문은 항상 `ok` 두 글자),
   버전은 `curl -sI http://127.0.0.1:7020/healthz | grep -i x-dashboard-version` 또는
   대시보드 화면 맨 아래 "버전 ○○○○" 로 새 버전인지 본다.

운영 Docker 설정을 따로 관리한다면, 새 zip 의 `Dockerfile`·`docker-compose.yml` 에서 아래만 맞춰 주면 된다.
- 꼭 필요: 시간대 `TZ=Asia/Seoul` (Dockerfile `ENV` 또는 `.env`). 없으면 UTC 로 돌아 자동 확정일·자동 백업 시각이 9시간 어긋난다.
- 권장: `COPY server.js VERSION ./` (없으면 동작은 같고 버전만 `unknown` 으로 보인다).
- 권장(보안): compose 의 `cap_drop: [ALL]`, `mem_limit`, `pids_limit`, `read_only`, `no-new-privileges`. 없어도 동작은 같다.
- `./data:/data` 볼륨은 쓰기 가능해야 한다(로그아웃 세션 목록 `revoked-sessions.json` 도 여기 저장).

예전 버전 자료는 그대로 읽는다(본부매핑 예전 형식 자동 변환, 예전 확정월은 처음 켤 때 그때 보이던 기장 수기분으로
한 번 고정 — 합계 변화 없음, 변경 기록 `audit.log` 에 `fix-gijang` 으로 남음). `input.json` 파일은 바꾸지 않는다.

문제가 생기면 이전 zip 으로 2~3 단계를 다시 하면 되돌아간다. `data/` 형식이 바뀌는 업데이트는
`CHANGELOG.md` 에 따로 적는다.
