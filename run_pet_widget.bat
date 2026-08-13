@echo off
chcp 65001 >nul
setlocal

where python >nul 2>nul
if errorlevel 1 (
    echo Python이 설치되어 있지 않거나 PATH에 등록되지 않았습니다.
    echo https://www.python.org/downloads/ 에서 Python을 설치한 뒤 다시 실행해주세요.
    pause
    exit /b 1
)

python "%~dp0pet_widget.py"

if errorlevel 1 (
    echo.
    echo 펫 위젯 실행 중 오류가 발생했습니다.
    pause
)

endlocal
