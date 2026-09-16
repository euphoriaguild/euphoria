@echo off
REM Instala dependencias Python do backend na VPS (rode como Admin se necessario)
setlocal
cd /d %~dp0..\..\backend
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo.
echo OK: pip install concluido.
echo Proximo: configure .env (ver deploy\windows\env.vps.example)
echo Depois: install-service.ps1 (NSSM) ou start-dev.ps1
endlocal
