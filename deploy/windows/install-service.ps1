# Instala Euphoria API como servico Windows via NSSM
# Pre-requisitos:
#   1. NSSM em PATH ou em C:\Tools\nssm\nssm.exe  (https://nssm.cc/download)
#   2. Python 3.11+ + ODBC Driver 17/18 for SQL Server
#   3. backend\.env configurado (env.vps.example)
# Uso (Admin): .\install-service.ps1

$ErrorActionPreference = "Stop"
$ServiceName = "EuphoriaAPI"
$Backend = (Resolve-Path (Join-Path $PSScriptRoot "..\..\backend")).Path
$Python = (Get-Command python -ErrorAction Stop).Source
$Nssm = $null
foreach ($c in @("nssm", "C:\Tools\nssm\nssm.exe", "C:\nssm\nssm.exe")) {
  if (Get-Command $c -ErrorAction SilentlyContinue) { $Nssm = (Get-Command $c).Source; break }
  if (Test-Path $c) { $Nssm = $c; break }
}
if (-not $Nssm) {
  throw "NSSM nao encontrado. Instale de https://nssm.cc/download e coloque nssm.exe no PATH."
}
if (-not (Test-Path (Join-Path $Backend ".env"))) {
  throw "Falta $Backend\.env — copie deploy\windows\env.vps.example"
}

Write-Host "NSSM: $Nssm"
Write-Host "Python: $Python"
Write-Host "Backend: $Backend"

& $Nssm stop $ServiceName 2>$null
& $Nssm remove $ServiceName confirm 2>$null

& $Nssm install $ServiceName $Python "-m" "uvicorn" "main:app" "--host" "0.0.0.0" "--port" "8000" "--workers" "1"
& $Nssm set $ServiceName AppDirectory $Backend
& $Nssm set $ServiceName DisplayName "Euphoria Guild API"
& $Nssm set $ServiceName Description "FastAPI Euphoria (Auth Discord + SQL Server)"
& $Nssm set $ServiceName Start SERVICE_AUTO_START
& $Nssm set $ServiceName AppStdout (Join-Path $Backend "logs\stdout.log")
& $Nssm set $ServiceName AppStderr (Join-Path $Backend "logs\stderr.log")
& $Nssm set $ServiceName AppRotateFiles 1
New-Item -ItemType Directory -Force -Path (Join-Path $Backend "logs") | Out-Null

& $Nssm start $ServiceName
Write-Host "Servico $ServiceName instalado e iniciado."
Write-Host "Teste: Invoke-RestMethod http://127.0.0.1:8000/api/health/db"
Write-Host "Teste externo: http://SEU_IP:8000/api/health/db (firewall liberando 8000) ou via reverse proxy 443"
