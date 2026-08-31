@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  경조사 화환 자동 발송 앱 - 로컬 실행
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
    pause
    exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
    echo [오류] Docker Desktop이 설치되어 있지 않습니다.
    echo 데이터베이스^(PostgreSQL^)를 가장 간편하게 띄우는 방법이라 필요합니다.
    echo https://www.docker.com/products/docker-desktop 에서 설치한 뒤
    echo Docker Desktop을 한 번 실행해 켜두고, 이 파일을 다시 실행해주세요.
    pause
    exit /b 1
)

set "ROOT=%~dp0"

echo [1/6] 데이터베이스^(PostgreSQL^) 컨테이너를 띄웁니다...
cd /d "%ROOT%"
docker compose up -d db
if errorlevel 1 (
    echo [오류] Docker로 데이터베이스를 띄우지 못했습니다. Docker Desktop이 켜져 있는지 확인해주세요.
    pause
    exit /b 1
)

echo 데이터베이스가 준비될 때까지 잠시 기다립니다...
timeout /t 8 /nobreak >nul

echo [2/6] 백엔드^(apps\api^) 설정 파일을 준비합니다...
cd /d "%ROOT%apps\api"
if not exist ".env" copy ".env.example" ".env" >nul

echo [3/6] 백엔드 패키지를 설치합니다^(최초 1회는 시간이 걸립니다^)...
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

echo [5/6] 프론트엔드^(apps\web^) 설정 파일을 준비합니다...
cd /d "%ROOT%apps\web"
if not exist ".env.local" copy ".env.example" ".env.local" >nul

echo 프론트엔드 패키지를 설치합니다^(최초 1회는 시간이 걸립니다^)...
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
echo  종료하려면 새로 열린 검은 창 2개^(백엔드/프론트엔드^)를
echo  각각 닫아주세요. 데이터베이스는 계속 필요하면 그대로 두고,
echo  완전히 정리하려면 "docker compose down"을 실행하세요.
echo ============================================
pause
endlocal
