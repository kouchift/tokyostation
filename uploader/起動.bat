@echo off
chcp 65001 > nul
title 東京ステーションガイド アップローダー
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python が見つかりません。
  echo   https://www.python.org/downloads/windows/ から入れてください。
  echo   ※ インストール画面の「Add python.exe to PATH」に必ずチェックを。
  echo.
  pause
  exit /b 1
)

python tsg_uploader.py
if errorlevel 1 (
  echo.
  echo   うまく起動できませんでした。上の文字をご確認ください。
  pause
)
