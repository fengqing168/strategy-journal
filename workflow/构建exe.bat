@echo off
echo 正在构建 XAUUSD 智能体工作流 .exe（约 1-2 分钟）...
pip install pyinstaller openai -q
pyinstaller --onefile --name xau_workflow --console xau_workflow.py
echo.
echo ✓ 完成！dist\xau_workflow.exe 已生成
echo 将其复制到任意位置，双击即可运行
pause
