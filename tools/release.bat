@echo off
rem 東京ステーションガイドの公開（版を上げる → まとめ直す → 下見 → GitHub へ → 公開の確認）
rem   ダブルクリックで実行。途中で «y» を押すと上げる
rem   版を上げずに上げ直す: tools\release.bat --no-bump   下見だけ: tools\release.bat --dry
chcp 65001 > nul
cd /d "%~dp0.."
node tools\release.mjs %*
echo.
pause
