param(
  [string]$ConfigPath = "wrangler.jsonc",
  [string]$ProductionUrl = $env:VANARA_PRODUCTION_URL,
  [string]$Cookie = $env:VANARA_SMOKE_COOKIE,
  [int]$RoomId = 1,
  [Alias("temporary-smoke-session")]
  [switch]$TemporarySmokeSession,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConfigFullPath = Join-Path $RepoRoot $ConfigPath
$UseTemporarySmokeSession = [bool]$TemporarySmokeSession -or ($RemainingArgs -contains "--temporary-smoke-session")

foreach ($arg in $RemainingArgs) {
  if ($arg -ne "--temporary-smoke-session") {
    throw "Unsupported deploy argument: $arg"
  }
}

function Fail-Step {
  param(
    [string]$Step,
    [string]$Reason
  )
  Write-Host ("FAILED: {0}" -f $Step)
  Write-Host $Reason
  exit 1
}

function Invoke-Step {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $RepoRoot
  )
  Write-Host ("== {0} ==" -f $Name)
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($code -ne 0) { Fail-Step $Name ("Exit code {0}" -f $code) }
  Write-Host ("GREEN: {0}" -f $Name)
}

function Get-WranglerPath {
  $local = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
  if (Test-Path -LiteralPath $local) { return $local }
  return "wrangler.cmd"
}

if ($UseTemporarySmokeSession) {
  Write-Host "Smoke authentication precheck: temporary Owner smoke session will be created and revoked by deploy-smoke."
} elseif (-not $Cookie) {
  Fail-Step "Smoke authentication precheck" "SETUP ACTION: Set VANARA_SMOKE_COOKIE in this shell to the full production 'vanara_session=...' cookie value before running deploy:production. Do not commit or print it."
}

if (-not (Test-Path -LiteralPath $ConfigFullPath)) {
  Fail-Step "Wrangler configuration" "Missing $ConfigFullPath"
}

$config = Get-Content -LiteralPath $ConfigFullPath -Raw | ConvertFrom-Json
$database = $config.d1_databases | Select-Object -First 1
if (-not $database) { Fail-Step "D1 configuration" "No D1 database binding found in wrangler.jsonc." }
$databaseName = [string]$database.database_name
$wrangler = Get-WranglerPath

Invoke-Step "Preflight" "powershell" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "deploy-preflight.ps1"), "-ConfigPath", $ConfigPath, "-AllowPendingMigrations")
Invoke-Step "Server tests" "npm.cmd" @("--prefix", "server", "test")
Invoke-Step "Frontend/source tests" "node" @("--import", "tsx", "--test", "tests/housekeeping-v2-source.test.ts", "tests/housekeeping-v2-room-source.test.ts") (Join-Path $RepoRoot "server")
Invoke-Step "Typecheck" "npm.cmd" @("run", "typecheck")
Invoke-Step "Lint" "npm.cmd" @("run", "lint")
Invoke-Step "Build" "npm.cmd" @("run", "build")
Invoke-Step "Server build" "npm.cmd" @("--prefix", "server", "run", "build:server")
Invoke-Step "Apply approved D1 migrations" $wrangler @("d1", "migrations", "apply", $databaseName, "--remote", "--config", $ConfigFullPath)

Write-Host "== Production deploy =="
$deployOutput = & $wrangler deploy --config $ConfigFullPath 2>&1
$deployCode = $LASTEXITCODE
$deployOutput | ForEach-Object { Write-Host $_ }
if ($deployCode -ne 0) { Fail-Step "Production deploy" ("Exit code {0}" -f $deployCode) }

$deployText = ($deployOutput | Out-String)
if ($deployText -notmatch "Current Version ID:\s+([0-9a-fA-F-]+)") {
  Fail-Step "Capture Cloudflare Version ID" "Deploy succeeded but no Version ID was found in Wrangler output."
}
$versionId = $Matches[1]
Write-Host ("GREEN: Production deploy")
Write-Host ("CLOUDFLARE_VERSION_ID={0}" -f $versionId)

$smokeArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "deploy-smoke.ps1"))
if ($ConfigPath) { $smokeArgs += @("-ConfigPath", $ConfigPath) }
if ($ProductionUrl) { $smokeArgs += @("-ProductionUrl", $ProductionUrl) }
if ($RoomId -gt 0) { $smokeArgs += @("-RoomId", [string]$RoomId) }
if ($UseTemporarySmokeSession) { $smokeArgs += @("-TemporarySmokeSession") }
Invoke-Step "Read-only production smoke" "powershell" $smokeArgs

Write-Host ("VERSION_ID={0}" -f $versionId)
Write-Host "DEPLOYMENT GREEN"
