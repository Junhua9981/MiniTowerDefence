@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >/dev/null 2>nul
if not %errorlevel%==0 (
  echo 需要先安裝 Node.js：https://nodejs.org/
  pause
  exit /b 1
)
set WRANGLER_SEND_METRICS=false
node tools\build-dist.mjs
echo.
echo [1/2] 確認 Pages 專案（已存在會略過）...
call npx --yes wrangler@4 pages project create mini-tower-defence --production-branch=main 2>nul
echo.
echo [2/2] 上傳 dist ...
call npx --yes wrangler@4 pages deploy dist --project-name=mini-tower-defence --branch=main --commit-dirty=true
echo.
echo ===== 完成。正式網址：https://mini-tower-defence.pages.dev （名稱被占用時以上面印出的為準）=====
pause
