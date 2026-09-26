@echo off
rem 管理ページを «鍵が入った状態» で開く（PC に保存ずみの鍵を使う。鍵は画面に出さない）
chcp 65001 > nul
cd /d "%~dp0.."
where node > nul 2>&1
if errorlevel 1 (
  echo Node.js が必要です。https://nodejs.org/ から入れてください
  pause
  exit /b 1
)
node tools\admin_open.mjs %*
timeout /t 5 > nul
