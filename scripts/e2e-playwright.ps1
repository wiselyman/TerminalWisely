param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs = @()
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SidecarPort = if ($env:E2E_SIDECAR_PORT) { $env:E2E_SIDECAR_PORT } else { "8765" }
$PreviewPort = if ($env:E2E_PREVIEW_PORT) { $env:E2E_PREVIEW_PORT } else { "1420" }
$env:TW_AI_TOKEN = if ($env:TW_AI_TOKEN) { $env:TW_AI_TOKEN } else { "dev-token" }
$env:TW_AI_E2E = "1"
$env:E2E_BASE_URL = "http://127.0.0.1:$PreviewPort"

$SidecarProcess = $null
$PreviewProcess = $null
$SidecarLog = Join-Path $env:TEMP "terminalwisely-e2e-sidecar.out.log"
$SidecarErrorLog = Join-Path $env:TEMP "terminalwisely-e2e-sidecar.err.log"
$PreviewLog = Join-Path $env:TEMP "terminalwisely-e2e-preview.out.log"
$PreviewErrorLog = Join-Path $env:TEMP "terminalwisely-e2e-preview.err.log"
$SidecarPython = Join-Path $RepoRoot "agent-sidecar\.venv\Scripts\python.exe"

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable failed with exit code $LASTEXITCODE"
  }
}

function Wait-Http([string]$Url, [System.Diagnostics.Process]$Process, [string]$Label, [int]$Attempts) {
  for ($Attempt = 0; $Attempt -lt $Attempts; $Attempt++) {
    if ($Process.HasExited) {
      throw "$Label exited before becoming ready (exit $($Process.ExitCode))"
    }
    try {
      $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 400) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "$Label failed to become ready at $Url"
}

try {
  Write-Host "=== Sidecar venv ==="
  if (-not (Test-Path $SidecarPython)) {
    Invoke-Checked "python" @("-m", "venv", (Join-Path $RepoRoot "agent-sidecar\.venv"))
  }
  Invoke-Checked $SidecarPython @("-m", "pip", "install", "-q", "-U", "pip")
  Invoke-Checked $SidecarPython @("-m", "pip", "install", "-q", "-r", (Join-Path $RepoRoot "agent-sidecar\requirements.txt"))

  Write-Host "=== Start sidecar :$SidecarPort ==="
  $env:PYTHONPATH = Join-Path $RepoRoot "agent-sidecar"
  $SidecarProcess = Start-Process -FilePath $SidecarPython `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", $SidecarPort) `
    -WorkingDirectory (Join-Path $RepoRoot "agent-sidecar") `
    -RedirectStandardOutput $SidecarLog -RedirectStandardError $SidecarErrorLog -PassThru -WindowStyle Hidden
  Wait-Http "http://127.0.0.1:$SidecarPort/healthz" $SidecarProcess "Sidecar" 40

  Write-Host "=== Build E2E frontend ==="
  $env:VITE_E2E = "1"
  $env:VITE_E2E_SIDECAR_URL = "http://127.0.0.1:$SidecarPort"
  $env:VITE_E2E_SIDECAR_TOKEN = $env:TW_AI_TOKEN
  Invoke-Checked "npm.cmd" @("run", "build")

  Write-Host "=== Vite preview :$PreviewPort ==="
  $NodePath = (Get-Command node).Source
  $ViteCli = Join-Path $RepoRoot "node_modules\vite\bin\vite.js"
  $PreviewProcess = Start-Process -FilePath $NodePath `
    -ArgumentList @($ViteCli, "preview", "--host", "127.0.0.1", "--port", $PreviewPort) `
    -WorkingDirectory $RepoRoot -RedirectStandardOutput $PreviewLog `
    -RedirectStandardError $PreviewErrorLog -PassThru -WindowStyle Hidden
  Wait-Http "$env:E2E_BASE_URL/" $PreviewProcess "Vite preview" 30

  Write-Host "=== Playwright ==="
  Invoke-Checked "npx.cmd" (@("playwright", "test", "--config", "playwright.config.ts") + $PlaywrightArgs)
  Write-Host "Playwright E2E passed."
} catch {
  Write-Error $_
  if (Test-Path $SidecarLog) { Get-Content $SidecarLog -Tail 40 }
  if (Test-Path $SidecarErrorLog) { Get-Content $SidecarErrorLog -Tail 40 }
  if (Test-Path $PreviewLog) { Get-Content $PreviewLog -Tail 40 }
  if (Test-Path $PreviewErrorLog) { Get-Content $PreviewErrorLog -Tail 40 }
  exit 1
} finally {
  foreach ($Process in @($PreviewProcess, $SidecarProcess)) {
    if ($null -ne $Process -and -not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
