@echo off
chcp 65001 >nul
title XAUUSD 智能体工作流
cd /d "%~dp0"

echo.
echo   ╔════════════════════════════════════╗
echo   ║   XAUUSD 智能体工作流 v2.0      ║
echo   ║   16 Prompt 串联 · DeepSeek 驱动 ║
echo   ╚════════════════════════════════════╝
echo.
echo   [1] 粘贴文本分析（交互模式）
echo   [2] 从文件读取分析
echo   [3] 预览 Prompt（不调 API）
echo   [4] 构建 EXE 文件
echo   [5] 打开网页版
echo.

set /p choice="  选 1-5: "

if "%choice%"=="1" (
    python xau_workflow.py
    goto end
)
if "%choice%"=="2" (
    echo.
    set /p file="  文件路径: "
    python xau_workflow.py --file "%file%"
    goto end
)
if "%choice%"=="3" (
    echo.
    set /p text="  输入文本（或留空用默认）: "
    if "%text%"=="" (
        python xau_workflow.py --dry-run --text "测试文本"
    ) else (
        python xau_workflow.py --dry-run --text "%text%"
    )
    goto end
)
if "%choice%"=="4" (
    echo.
    echo   正在安装 PyInstaller...
    pip install pyinstaller -q
    echo   正在构建 xau_workflow.exe（约 1-2 分钟）...
    pyinstaller --onefile --name xau_workflow --console xau_workflow.py
    echo.
    echo   ✓ 构建完成！exe 在 dist\ 文件夹
    goto end
)
if "%choice%"=="5" (
    start xau_workflow.html
    goto end
)

echo   无效选项
:end
echo.
pause
