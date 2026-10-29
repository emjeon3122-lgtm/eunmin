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
        pause
        exit /b 1
    )

    call :EnsureTool git Git.Git "Git"
    call :EnsureTool node OpenJS.NodeJS.LTS "Node.js"
)

REM ---------- 0.5. 프로젝트 파일 확인/자동 다운로드 ----------
REM 이 .bat 파일만 다른 폴더(바탕화면 등)로 복사해서 실행해도 동작하도록,
REM 저장소가 없으면 자동으로 내려받는다. 단, OneDrive로 동기화되는 폴더(바탕화면/
REM 문서 등이 회사 정책으로 OneDrive에 연결된 경우 흔함) 안에서는 OneDrive가
REM .git 내부 파일을 잠가 clone이 "Permission denied"로 실패하는 경우가 많아,
REM 그럴 때는 사용자 프로필 바로 밑(OneDrive와 무관한 위치)에 내려받는다.
set "REPO_URL=https://github.com/emjeon3122-lgtm/eunmin.git"
set "REPO_BRANCH=claude/app-development-project-eun5fu"
set "REPO_ROOT=%ROOT%"
set "SAFE_BASE=%USERPROFILE%\"

if not exist "%ROOT%apps\api" (
    if exist "%ROOT%eunmin\apps\api" (
        set "REPO_ROOT=%ROOT%eunmin\"
    ) else if exist "%SAFE_BASE%eunmin\apps\api" (
        set "REPO_ROOT=%SAFE_BASE%eunmin\"
    ) else (
        set "CLONE_TARGET=%ROOT%eunmin"
        echo %ROOT%| findstr /I "OneDrive" >nul
        if not errorlevel 1 (
            echo [안내] 현재 폴더가 OneDrive 동기화 폴더 안에 있어 git 작업이 자주
            echo 실패합니다^(권한 오류^). 대신 "%SAFE_BASE%eunmin" 폴더에 내려받습니다.
            set "CLONE_TARGET=%SAFE_BASE%eunmin"
        )

        echo 프로젝트 파일이 없어 저장소를 내려받습니다^(최초 1회^)...
        echo GitHub 로그인 창이 뜨면 로그인해주세요.
        git clone -b "%REPO_BRANCH%" "%REPO_URL%" "!CLONE_TARGET!"
        if errorlevel 1 (
            echo [오류] 저장소를 내려받지 못했습니다.
            echo 인터넷 연결이나 GitHub 로그인을 확인한 뒤 다시 실행해주세요.
            echo ^(계속 실패하면 OneDrive 동기화를 잠시 끄고 시도해보세요.^)
            pause
            exit /b 1
        )
        set "REPO_ROOT=!CLONE_TARGET!\"
    )
)

REM ---------- 1. 최신 코드로 자동 업데이트 ----------
REM git -C 에 넘길 경로는 끝의 백슬래시를 떼야 한다. 경로가 백슬래시로 끝나면
REM Windows가 뒤따르는 따옴표를 escape 문자로 처리해 git이 경로를 못 받는다.
set "REPO_DIR=%REPO_ROOT%"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

if exist "%REPO_ROOT%.git" (
    where git >nul 2>nul
    if not errorlevel 1 (
        echo [업데이트 확인] 최신 코드가 있는지 확인합니다...
        for /f "delims=" %%b in ('git -C "%REPO_DIR%" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURBRANCH=%%b"
        git -C "%REPO_DIR%" fetch origin "!CURBRANCH!" >nul 2>nul

        set "BEHIND=unknown"
        for /f %%c in ('git -C "%REPO_DIR%" rev-list HEAD.."origin/!CURBRANCH!" --count 2^>nul') do set "BEHIND=%%c"

        if "!BEHIND!"=="unknown" (
            echo [안내] 업데이트 상태를 확인하지 못했습니다. 현재 받아둔 코드로 진행합니다.
        ) else if "!BEHIND!"=="0" (
            echo 이미 최신 버전입니다.
        ) else (
            echo 새 업데이트 !BEHIND!건을 내려받습니다^(!CURBRANCH!^)...
            REM --ff-only 는 로컬 변경을 덮어쓰지 않고 거부하므로 안전하다.
            git -C "%REPO_DIR%" pull --ff-only origin "!CURBRANCH!"
            if errorlevel 1 (
                echo.
                echo [안내] 자동 업데이트를 하지 못했습니다^(위 git 메시지 참고^).
                echo        로컬에 수정한 내용이 있으면 백업 후 아래를 실행해주세요:
                echo          git -C "%REPO_DIR%" reset --hard origin/!CURBRANCH!
            ) else (
                echo 업데이트 완료. 최신 코드로 계속 진행합니다.
            )
        )
    )
)
echo.

REM ---------- 2. 데이터베이스 ----------
REM DB는 SQLite 파일(apps\api\prisma\dev.db) 하나라서 별도 서버/계정/Docker가 필요 없다.
echo [1/5] 데이터베이스는 SQLite 파일을 사용합니다^(별도 설치 불필요^).

REM ---------- 3. 백엔드 ----------
echo [2/5] 백엔드^(apps\api^) 설정 파일을 준비합니다...
cd /d "%REPO_ROOT%apps\api"
if not exist ".env" copy ".env.example" ".env" >nul

REM 예전 PostgreSQL 시절의 .env가 남아 있으면 SQLite 설정으로 갱신한다
REM (.env는 이미 있으면 덮어쓰지 않기 때문에 그냥 두면 옛 DATABASE_URL이 계속 쓰인다).
findstr /C:"file:./dev.db" ".env" >nul
if errorlevel 1 (
    echo [안내] .env가 예전 PostgreSQL 설정이라 최신 설정으로 갱신합니다.
    echo        기존 파일은 .env.bak 으로 백업합니다.
    copy /y ".env" ".env.bak" >nul
    copy /y ".env.example" ".env" >nul
)

echo [3/5] 백엔드 패키지를 설치합니다^(최초 1회 또는 업데이트 후에는 시간이 걸립니다^)...
call npm install
if errorlevel 1 (
    echo [오류] 백엔드 npm install에 실패했습니다. 위 오류 메시지를 확인해주세요.
    pause
    exit /b 1
)

echo [4/5] 데이터베이스 마이그레이션과 샘플 데이터를 준비합니다...
call npx prisma migrate deploy
if errorlevel 1 (
    echo [오류] 데이터베이스 준비에 실패했습니다. 위 오류 메시지를 확인해주세요.
    pause
    exit /b 1
)
call npx prisma generate
call npm run prisma:seed

echo 백엔드 서버를 새 창에서 실행합니다^(http://localhost:4000^)...
start "화환앱-백엔드 (이 창을 닫으면 서버가 종료됩니다)" cmd /k "cd /d %REPO_ROOT%apps\api && npm run dev"

REM ---------- 4. 프론트엔드 ----------
echo [5/5] 프론트엔드^(apps\web^)를 준비하고 실행합니다...
cd /d "%REPO_ROOT%apps\web"
if not exist ".env.local" copy ".env.example" ".env.local" >nul

echo 프론트엔드 패키지를 설치합니다^(최초 1회 또는 업데이트 후에는 시간이 걸립니다^)...
call npm install
if errorlevel 1 (
    echo [오류] 프론트엔드 npm install에 실패했습니다. 위 오류 메시지를 확인해주세요.
    pause
    exit /b 1
)

echo 프론트엔드 서버를 새 창에서 실행합니다^(http://localhost:3000^)...
start "화환앱-프론트엔드 (이 창을 닫으면 서버가 종료됩니다)" cmd /k "cd /d %REPO_ROOT%apps\web && npm run dev"

echo.
REM 예전에는 10초만 기다리고 브라우저를 열었는데, 개발 모드 백엔드는 TypeScript를
REM 컴파일하고 나서야 포트를 열기 때문에 컴퓨터가 느리면 10초로는 부족했다.
REM 그 상태로 로그인을 누르면 서버가 없어서 실패하는데 화면에는 로그인 실패로만
REM 보여 사번이 틀린 것으로 오해하게 된다 — 그래서 실제로 포트가 열릴 때까지 기다린다.
echo 서버가 준비될 때까지 기다립니다^(처음에는 1분 이상 걸릴 수 있습니다^)...
call :WaitForPort 4000 "백엔드"
call :WaitForPort 3000 "프론트엔드"
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

:WaitForPort
REM %1 = 포트번호, %2 = 화면에 보여줄 이름
REM 서버가 그 포트를 열었는지 확인한다. 개발 서버는 준비가 끝난 뒤에야 포트를 열기 때문에
REM 이 확인만으로 "이제 접속해도 된다"를 판단할 수 있다.
set "WAIT_TRIES=0"
:WaitForPortLoop
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %1); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
    echo   %~2 준비 완료.
    exit /b 0
)
set /a WAIT_TRIES+=1
if !WAIT_TRIES! GEQ 60 (
    echo   [안내] %~2가 2분 안에 응답하지 않았습니다. 새로 열린 검은 창의
    echo          오류 메시지를 확인해주세요.
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto :WaitForPortLoop
