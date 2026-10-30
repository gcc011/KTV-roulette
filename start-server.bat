@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 麦浪点唱 · 本地服务器

where py >nul 2>nul
if %errorlevel%==0 (
  py serve.py --open
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py --open
  goto :done
)

echo.
echo 未检测到 Python。
echo.
echo 你仍然可以直接双击 index.html 打开转盘；
echo 如果要让手机访问，请先安装 Python 3：
echo https://www.python.org/downloads/
echo.
pause
exit /b

:done
echo.
pause
