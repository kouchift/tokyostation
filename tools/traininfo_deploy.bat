@echo off
rem «運行情報（遅延・運転見合わせ）» の受け皿を Google Apps Script に置いて公開する（初回も更新も、これをダブルクリック）
rem 初回だけ: ODPT の鍵を貼る ／ 公開した URL で «許可»（Google のログインと Apps Script API は «使われ方» のときに済んでいれば不要）
chcp 65001 > nul
cd /d "%~dp0.."
where node > nul 2>&1
if errorlevel 1 (
  echo Node.js が必要です。https://nodejs.org/ から入れてください
  pause
  exit /b 1
)
node tools\traininfo_deploy.mjs %*
echo.
pause
