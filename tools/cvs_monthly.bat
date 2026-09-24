@echo off
rem コンビニ大手3社の月次更新（公式の店舗検索から取り直し → そのファイルだけ GitHub へ）
rem   手で実行: このファイルをダブルクリック
rem   毎月自動: tools\cvs_monthly_register.bat を一度だけ実行（毎月1日 4:00）
chcp 65001 > nul
cd /d "%~dp0.."
if not exist tools\logs mkdir tools\logs
set LOG=tools\logs\cvs_%date:~0,4%%date:~5,2%%date:~8,2%.log
python tools\fetch_cvs_official.py >> "%LOG%" 2>&1
if errorlevel 1 (
  echo 取得に失敗したので、アップロードはしませんでした。ログ: %LOG%
  exit /b 1
)
python uploader\tsg_push.py --go --only data/chains2.js,data/CVS_MONTHLY.md,tools/cvs_state.json.gz >> "%LOG%" 2>&1
echo 完了しました。ログ: %LOG%
