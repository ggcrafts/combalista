@echo off
REM Abre o painel do MTG Shorts no navegador. De dois cliques neste arquivo.
REM Esta janela precisa ficar aberta enquanto voce usa o painel.
title MTG Shorts - Painel
cd /d "%~dp0"
call npm run painel
if errorlevel 1 (
  echo.
  echo O painel nao conseguiu abrir. Veja a mensagem acima.
  pause
)
