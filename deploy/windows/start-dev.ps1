# Inicia a API em foreground (teste na VPS)
# Uso: .\start-dev.ps1
$ErrorActionPreference = "Stop"
$Backend = Resolve-Path (Join-Path $PSScriptRoot "..\..\backend")
Set-Location $Backend
if (-not (Test-Path ".env")) {
  Write-Error "Crie backend\.env a partir de deploy\windows\env.vps.example"
}
Write-Host "Subindo uvicorn em 0.0.0.0:8000 (cwd=$Backend)"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
