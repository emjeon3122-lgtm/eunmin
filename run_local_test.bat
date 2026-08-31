@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title 경조사 화환 자동 발송 앱 - 로컬 실행

echo ============================================
echo  경조사 화환 자동 발송 앱 - 로컬 실행
echo ============================================
echo.

set "ROOT=%~dp0"
cd /d "%ROOT%"

REM ---------- 0. 필요한 프로그램이 없으면 자동 설치 ----------
set "MISSING=0"
where git >nul 2>nul || set "MISSING=1"
where node >nul 2>nul || set "MISSING=1"

if "%MISSING%"=="1" (
    net session >nul 2>nul
    if errorlevel 1 (
        echo 설치되지 않은 프로그램이 있어 자동 설치를 진행합니다^(관리자 권한 필요^).
        echo 아래에 Windows 권한 요청 창이 뜨면 "예"를 눌러주세요.
        echo ^(새 창이 관리자 권한으로 열리고, 이 창은 닫힙니다.^)
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
        exit /b
    )

    where winget >nul 2>nul
    if errorlevel 1 (
        echo [오류] winget^(앱 설치 관리자^)이 없어 자동 설치를 할 수 없습니다.
        echo Microsoft Store에서 "앱 설치 관리자"를 설치하거나, Windows Update로
        echo 시스템을 최신화한 뒤 다시 실행해주세요. 또는 아래를 직접 설치해주세요:
        echo   - Git: https://git-scm.com/download/win
        echo   - Node.js LTS: https://nodejs.org
        echo   - Docker Desktop: https://www.docker.com/products/docker-desktop
        pause
        exit /b 1
    )

    call :EnsureTool git Git.Git "Git"
    call :EnsureTool node OpenJS.NodeJS.LTS "Node.js"
)

call :EnsureDockerRunning
set "DOCKER_OK=0"
if not errorlevel 1 set "DOCKER_OK=1"

REM ---------- 1. 최신 코드로 자동 업데이트 ----------
if exist "%ROOT%.git" (
    where git >nul 2>nul
    if not errorlevel 1 (
        echo [업데이트 확인] 최신 코드가 있는지 확인합니다...
        for /f "delims=" %%b in ('git -C "%ROOT%" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURBRANCH=%%b"
        git -C "%ROOT%" fetch origin "!CURBRANCH!" >nul 2>nul

        set "BEHIND=0"
        for /f %%c in ('git -C "%ROOT%" rev-list HEAD.."origin/!CURBRANCH!" --count 2^>nul') do set "BEHIND=%%c"

        if not "!BEHIND!"=="0" (
            git -C "%ROOT%" status --porcelain > "%TEMP%\wreath_git_status.tmp" 2>nul
            for %%A in ("%TEMP%\wreath_git_status.tmp") do set "DIRTY_SIZE=%%~zA"
            del "%TEMP%\wreath_git_status.tmp" >nul 2>nul

            if "!DIRTY_SIZE!"=="0" (
                echo 새 업데이트를 내려받습니다^(!CURBRANCH!^)...
                git -C "%ROOT%" pull --ff-only origin "!CURBRANCH!"
                if errorlevel 1 (
                    echo [안내] 자동 업데이트에 실패했습니다. 필요하면 직접 "git pull"을 실행해주세요.
                ) else (
                    echo 업데이트 완료. 최신 코드로 계속 진행합니다.
                )
            ) else (
                echo [안내] 로컬에 저장하지 않은 변경사항이 있어 자동 업데이트를 건너뜁니다.
                echo        필요하면 변경사항을 커밋/백업한 뒤 직접 "git pull"을 실행해주세요.
            )
        ) else (
            echo 이미 최신 버전입니다.
        )
    )
)
echo.

REM ---------- 2. 데이터베이스^(PostgreSQL^) 기동 ----------
if "%DOCKER_OK%"=="1" (
    echo [1/6] 데이터베이스^(PostgreSQL^) 컨테이너를 띄웁니다...
    docker compose up -d db
    if errorlevel 1 (
        echo [경고] Docker로 데이터베이스를 띄우지 못했습니다. Docker 없이 계속 진행합니다.
        echo apps\api\.env의 DATABASE_URL이 실제 접속 가능한 PostgreSQL을 가리키는지 확인해주세요.
    ) else (
        echo 데이터베이스가 준비될 때까지 잠시 기다립니다...
        timeout /t 8 /nobreak >nul
    )
) else (
    echo [1/6] Docker를 사용하지 않고 진행합니다.
    echo apps\api\.env의 DATABASE_URL이 실제 접속 가능한 PostgreSQL을 가리키는지 확인해주세요
    echo ^(예: Neon, Supabase 같은 무료 클라우드 PostgreSQL^).
)

REM ---------- 3. 백엔드 ----------
echo [2/6] 백엔드^(apps\api^) 설정 파일을 준비합니다...
cd /d "%ROOT%apps\api"
set "ENV_JUST_CREATED=0"
if not exist ".env" (
    copy ".env.example" ".env" >nul
    set "ENV_JUST_CREATED=1"
)

if "%DOCKER_OK%"=="0" (
    if "%ENV_JUST_CREATED%"=="1" (
        echo.
        echo [안내] apps\api\.env 파일을 새로 만들었습니다. Docker를 사용하지 않으므로
        echo DATABASE_URL 값을 실제 접속 가능한 PostgreSQL 주소^(예: Neon^)로 바꿔야 합니다.
        echo 메모장으로 apps\api\.env 파일을 열어 DATABASE_URL="..." 줄을 교체한 뒤,
        echo 이 창에서 아무 키나 눌러 계속하세요.
        pause
    )
)

echo [3/6] 백엔드 패키지를 설치합니다^(최초 1회 또는 업데이트 후에는 시간이 걸립니다^)...
call npm install
if errorlevel 1 (
    echo [오류] 백엔드 npm install에 실패했습니다. 위 오류 메시지를 확인해주세요.
    pause
    exit /b 1
)

echo [4/6] 데이터베이스 마이그레이션과 샘플 데이터를 준비합니다...
call npx prisma migrate deploy
if errorlevel 1 (
    echo [경고] 마이그레이션에 실패했습니다. 데이터베이스가 아직 켜지는 중일 수 있습니다.
    echo 잠시^(10초 정도^) 기다렸다가 이 파일을 다시 실행해보세요.
    pause
    exit /b 1
)
call npx prisma generate
call npm run prisma:seed

echo 백엔드 서버를 새 창에서 실행합니다^(http://localhost:4000^)...
start "화환앱-백엔드 (이 창을 닫으면 서버가 종료됩니다)" cmd /k "cd /d %ROOT%apps\api && npm run dev"

REM ---------- 4. 프론트엔드 ----------
echo [5/6] 프론트엔드^(apps\web^) 설정 파일을 준비합니다...
cd /d "%ROOT%apps\web"
if not exist ".env.local" copy ".env.example" ".env.local" >nul

echo 프론트엔드 패키지를 설치합니다^(최초 1회 또는 업데이트 후에는 시간이 걸립니다^)...
call npm install
if errorlevel 1 (
    echo [오류] 프론트엔드 npm install에 실패했습니다. 위 오류 메시지를 확인해주세요.
    pause
    exit /b 1
)

echo [6/6] 프론트엔드 서버를 새 창에서 실행합니다^(http://localhost:3000^)...
start "화환앱-프론트엔드 (이 창을 닫으면 서버가 종료됩니다)" cmd /k "cd /d %ROOT%apps\web && npm run dev"

echo.
echo 서버가 완전히 뜰 때까지 10초 정도 기다린 후 브라우저를 엽니다...
timeout /t 10 /nobreak >nul
start "" "http://localhost:3000/login"

echo.
echo ============================================
echo  준비 완료! 아래 사번으로 로그인해서 테스트하세요 ^(비밀번호 없음^).
echo   - A0001  : 관리자 ^(파트너^)
echo   - E1001  : 일반 임직원 ^(비파트너 - 승인 증빙 첨부 필요^)
echo   - E1002  : 일반 임직원 ^(파트너^)
echo.
echo  다음에 이 파일을 다시 실행하면, 코드가 업데이트된 경우
echo  자동으로 최신 버전을 받아온 뒤 실행합니다.
echo.
echo  종료하려면 새로 열린 검은 창 2개^(백엔드/프론트엔드^)를 각각 닫아주세요.
if "%DOCKER_OK%"=="1" (
    echo  데이터베이스는 계속 필요하면 그대로 두고, 완전히 정리하려면
    echo  "docker compose down"을 실행하세요.
)
echo ============================================
pause
endlocal
exit /b 0

REM ================= 아래는 함수 =================

:EnsureTool
REM %1=확인할 명령어  %2=winget 패키지 ID  %3=사람이 읽을 이름
where %1 >nul 2>nul
if not errorlevel 1 exit /b 0

echo %~3이(가) 설치되어 있지 않아 자동으로 설치합니다...
winget install -e --id %2 --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo [오류] %~3 자동 설치에 실패했습니다. 수동으로 설치한 뒤 다시 실행해주세요.
    exit /b 1
)

call :RefreshPath
where %1 >nul 2>nul
if errorlevel 1 (
    echo %~3 설치는 완료됐지만 아직 인식되지 않습니다.
    echo 이 창을 닫고 파일을 다시 실행해주세요.
    exit /b 1
)
echo %~3 설치 완료.
exit /b 0

:RefreshPath
for /f "skip=2 tokens=3*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%A %%B"
for /f "skip=2 tokens=3*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%A %%B"
set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%"
exit /b 0

:EnsureDockerRunning
REM Docker는 이제 필수가 아니다 — 없거나 안 켜져 있으면 조용히 건너뛰고
REM DATABASE_URL이 가리키는 다른 PostgreSQL(예: Neon)을 쓰도록 메인 흐름에 맡긴다.
where docker >nul 2>nul
if errorlevel 1 exit /b 1

docker info >nul 2>nul
if not errorlevel 1 exit /b 0

echo Docker가 설치되어 있어 Docker Desktop을 실행해봅니다...
set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if exist "%DOCKER_EXE%" start "" "%DOCKER_EXE%"

set "DOCKER_TRIES=0"
:WaitForDockerLoop
docker info >nul 2>nul
if not errorlevel 1 (
    echo Docker 엔진이 준비되었습니다.
    exit /b 0
)
set /a DOCKER_TRIES+=1
if !DOCKER_TRIES! GEQ 15 (
    echo [안내] Docker 엔진이 켜지지 않아 Docker 없이 계속 진행합니다.
    exit /b 1
)
echo   ...Docker 엔진이 켜지길 기다리는 중 ^(!DOCKER_TRIES!/15^)
timeout /t 3 /nobreak >nul
goto :WaitForDockerLoop
