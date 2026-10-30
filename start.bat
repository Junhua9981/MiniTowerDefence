@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >/dev/null 2>nul
if %errorlevel%==0 (
  start "MiniTowerDefence server" node serve.mjs 8080
  goto open
)
where py >/dev/null 2>nul
if %errorlevel%==0 (
  start "MiniTowerDefence server" py serve.py 8080
  goto open
)
where python >/dev/null 2>nul
if %errorlevel%==0 (
  start "MiniTowerDefence server" python serve.py 8080
  goto open
)
echo 找不到 Node.js 或 Python，請先安裝其中一個。
pause
exit /b 1
:open
timeout /t 1 >nul
start "" http://localhost:8080/
echo 遊戲已在瀏覽器開啟。
echo 手機要玩：連同一個 Wi-Fi，打開「MiniTowerDefence server」視窗裡顯示的手機網址。
echo 關閉「MiniTowerDefence server」視窗即可停止伺服器。
timeout /t 8 >nul
