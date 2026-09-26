@echo off
rem «使われ方（サイト内の出来事）» の受け皿を Google Apps Script に置いて公開する（初回も更新も、これをダブルクリック）
rem 初回だけ: ブラウザで Google にログインして «許可» ／ Apps Script API をオン ／ 公開した URL で «許可»
chcp 65001 > nul
cd /d "%~dp0.."
where node > nul 2>&1
if errorlevel 1 (
  echo Node.js が必要です。https://nodejs.org/ から入れてください
  pause
  exit /b 1
)
node tools\stats_deploy.mjs %*
echo.
pause
