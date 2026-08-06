@echo off
title XAUUSD Workflow
cd /d "%~dp0"

echo.
echo   ===========================================
echo     XAUUSD AI Workflow v2.0
echo     16 Prompts - DeepSeek
echo   ===========================================
echo.
echo   [1] Paste text (interactive)
echo   [2] Read from file
echo   [3] Dry run (preview, no API)
echo   [4] Build EXE file
echo   [5] Open web version
echo.
set /p choice="  Choose 1-5: "

if "%choice%"=="1" (
    python xau_workflow.py
    goto end
)
if "%choice%"=="2" (
    echo.
    set /p file="  File path: "
    python xau_workflow.py --file "%file%"
    goto end
)
if "%choice%"=="3" (
    echo.
    set /p text="  Text (or leave empty): "
    if "%text%"=="" (
        python xau_workflow.py --dry-run --text "test"
    ) else (
        python xau_workflow.py --dry-run --text "%text%"
    )
    goto end
)
if "%choice%"=="4" (
    echo.
    echo   Installing PyInstaller...
    pip install pyinstaller -q
    echo   Building xau_workflow.exe (~1-2 min)...
    pyinstaller --onefile --name xau_workflow --console xau_workflow.py
    echo.
    echo   Done! exe is in dist\ folder.
    goto end
)
if "%choice%"=="5" (
    if exist "%~dp0xau_workflow.html" (
        start "" "%~dp0xau_workflow.html"
    ) else (
        echo   File not found: xau_workflow.html
        echo   Make sure this bat is in the workflow folder
    )
    goto end
)

echo   Invalid choice
:end
echo.
pause
