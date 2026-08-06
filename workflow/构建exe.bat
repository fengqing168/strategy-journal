@echo off
title Build EXE
cd /d "%~dp0"

echo.
echo   ===========================================
echo     Building xau_workflow.exe ...
echo     This will take 1-2 minutes.
echo   ===========================================
echo.
pip install pyinstaller openai -q
pyinstaller --onefile --name xau_workflow --console xau_workflow.py
echo.
echo   Done! dist\xau_workflow.exe is ready.
echo   Copy it anywhere and double-click to run.
echo.
pause
