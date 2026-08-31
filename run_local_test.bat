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
if exist "%REPO_ROOT%.git" (
    where git >nul 2>nul
    if not errorlevel 1 (
        echo [업데이트 확인] 최신 코드가 있는지 확인합니다...
        for /f "delims=" %%b in ('git -C "%REPO_ROOT%" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURBRANCH=%%b"
        git -C "%REPO_ROOT%" fetch origin "!CURBRANCH!" >nul 2>nul

        set "BEHIND=0"
        for /f %%c in ('git -C "%REPO_ROOT%" rev-list HEAD.."origin/!CURBRANCH!" --count 2^>nul') do set "BEHIND=%%c"

        if not "!BEHIND!"=="0" (
            git -C "%REPO_ROOT%" status --porcelain > "%TEMP%\wreath_git_status.tmp" 2>nul
            for %%A in ("%TEMP%\wreath_git_status.tmp") do set "DIRTY_SIZE=%%~zA"
            del "%TEMP%\wreath_git_status.tmp" >nul 2>nul

            if "!DIRTY_SIZE!"=="0" (
                echo 새 업데이트를 내려받습니다^(!CURBRANCH!^)...
                git -C "%REPO_ROOT%" pull --ff-only origin "!CURBRANCH!"
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

REM ---------- 2. 데이터베이스 ----------
REM DB는 SQLite 파일(apps\api\prisma\dev.db) 하나라서 별도 서버/계정/Docker가 필요 없다.
echo [1/5] 데이터베이스는 SQLite 파일을 사용합니다^(별도 설치 불필요^).

REM ---------- 3. 백엔드 ----------
echo [2/5] 백엔드^(apps\api^) 설정 파일을 준비합니다...
cd /d "%REPO_ROOT%apps\api"
if not exist ".env" copy ".env.example" ".env" >nul

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
