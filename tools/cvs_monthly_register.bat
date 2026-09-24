@echo off
rem コンビニの月次更新を Windows のタスクスケジューラに登録する（毎月1日 4:00・パソコンが起動していれば実行）
rem 解除するとき: schtasks /delete /tn "TSG_cvs_monthly" /f
chcp 65001 > nul
schtasks /create /tn "TSG_cvs_monthly" /tr "\"%~dp0cvs_monthly.bat\"" /sc monthly /d 1 /st 04:00 /f
pause
