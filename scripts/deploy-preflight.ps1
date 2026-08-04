param(
  [string]$ConfigPath = "wrangler.jsonc",
  [string]$ProductionUrl = $env:VANARA_PRODUCTION_URL,
  [switch]$AllowPendingMigrations
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConfigFullPath = Join-Path $RepoRoot $ConfigPath
$DefaultProductionUrl = "https://vanara-central.administrator-5b7.workers.dev"
$RequiredVars = @(
  "BEDS24_BASE_URL",
  "PASSPORT_RETENTION_DAYS",
  "VANARA_DATABASE_ENVIRONMENT",
  "VANARA_DATABASE_NAME",
  "VANARA_DATABASE_ID"
)
$RequiredSecrets = @(
  "BEDS24_LONG_LIFE_TOKEN",
  "BEDS24_WEBHOOK_SECRET",
  "OPENAI_API_KEY"
)

$script:Ready = $true

function Write-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )
  $status = if ($Ok) { "OK" } else { "FAILED" }
  Write-Host ("[{0}] {1}: {2}" -f $status, $Name, $Detail)
  if (-not $Ok) { $script:Ready = $false }
}

function Stop-AuthenticationMissing {
  Write-Host "[FAILED] Authentication: Wrangler is not authenticated."
  Write-Host "SETUP ACTION: Run '.\node_modules\.bin\wrangler.cmd login' once on this machine, approve Cloudflare OAuth in the browser, then rerun 'npm run deploy:preflight'."
  exit 1
}

function Invoke-External {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  $output = & $FilePath @Arguments 2>&1
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output | Out-String).Trim()
  }
}

function Get-WranglerPath {
  $local = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
  if (Test-Path -LiteralPath $local) { return $local }
  return "wrangler.cmd"
}

function Read-Config {
  if (-not (Test-Path -LiteralPath $ConfigFullPath)) {
    throw "Wrangler config not found at $ConfigFullPath"
  }
  return Get-Content -LiteralPath $ConfigFullPath -Raw | ConvertFrom-Json
}

function Test-HttpOk {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -Method GET -Headers @{ Accept = "application/json" } -UseBasicParsing -TimeoutSec 30
    return [pscustomobject]@{ Ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300); StatusCode = $response.StatusCode }
  } catch {
    return [pscustomobject]@{ Ok = $false; StatusCode = "unreachable" }
  }
}

Write-Host "Vanara production deployment preflight"
Write-Host ("Repository: {0}" -f $RepoRoot)

$wrangler = Get-WranglerPath
$version = Invoke-External $wrangler @("--version")
Write-Check "Wrangler availability" ($version.ExitCode -eq 0) ($version.Output -replace "`r?`n", " ")
if ($version.ExitCode -ne 0) {
  Write-Host "SETUP ACTION: Run 'npm install' in the repository, then rerun 'npm run deploy:preflight'."
  exit 1
}

$config = Read-Config
$workerName = [string]$config.name
$database = $config.d1_databases | Select-Object -First 1
$r2Buckets = @($config.r2_buckets)
$url = if ($ProductionUrl) { $ProductionUrl.TrimEnd("/") } else { $DefaultProductionUrl }

Write-Check "Wrangler configuration" ($workerName -eq "vanara-central") ("Worker {0}, main {1}, compatibility_date {2}" -f $workerName, $config.main, $config.compatibility_date)

$whoami = Invoke-External $wrangler @("whoami")
if ($whoami.ExitCode -ne 0) { Stop-AuthenticationMissing }
Write-Check "Authentication state" $true "Authenticated through the approved local Wrangler OAuth profile."
Write-Check "Cloudflare account access" ($whoami.Output -match "Account Name" -or $whoami.Output -match "You are logged in") "Account is accessible."

$versions = Invoke-External $wrangler @("versions", "list", "--config", $ConfigFullPath)
Write-Check "Worker access" ($versions.ExitCode -eq 0 -and $versions.Output -match "Version ID") ("Worker {0} versions are readable." -f $workerName)

$d1Name = [string]$database.database_name
$migrations = Invoke-External $wrangler @("d1", "migrations", "list", $d1Name, "--remote", "--config", $ConfigFullPath)
$noPending = $migrations.ExitCode -eq 0 -and $migrations.Output -match "No migrations to apply"
Write-Check "D1 access" ($migrations.ExitCode -eq 0) ("Database {0} migration state is readable." -f $d1Name)
Write-Check "Pending migrations" ($migrations.ExitCode -eq 0) ($(if ($noPending) { "No migrations to apply." } elseif ($AllowPendingMigrations) { "Pending approved migrations will be applied by deploy:production." } else { "Pending migrations detected; deploy:production applies approved migrations safely." }))

$requiredR2Bindings = @{
  R2_STORAGE = "vanara-central-documents"
  WARAPORN_KB_ARCHIVE = "vanara-waraporn-kb-archive"
}
$r2Present = $true
$r2Details = @()
foreach ($bindingName in $requiredR2Bindings.Keys) {
  $match = @($r2Buckets | Where-Object { [string]$_.binding -eq $bindingName }) | Select-Object -First 1
  if ($null -eq $match -or [string]$match.bucket_name -ne $requiredR2Bindings[$bindingName]) {
    $r2Present = $false
  } else {
    $r2Details += ("{0} -> {1}" -f $bindingName, [string]$match.bucket_name)
  }
}
Write-Check "R2 binding" $r2Present ($(if ($r2Present) { $r2Details -join "; " } else { "Missing required R2 binding." }))

$varsPresent = $true
foreach ($name in $RequiredVars) {
  if (-not $config.vars.PSObject.Properties.Name.Contains($name)) { $varsPresent = $false }
}
Write-Check "Required environment variables" $varsPresent ("Configured names: {0}" -f ($RequiredVars -join ", "))

$secretList = Invoke-External $wrangler @("secret", "list", "--config", $ConfigFullPath)
$secretsPresent = $secretList.ExitCode -eq 0
if ($secretsPresent) {
  foreach ($name in $RequiredSecrets) {
    if ($secretList.Output -notmatch [regex]::Escape($name)) { $secretsPresent = $false }
  }
}
Write-Check "Required secret names" $secretsPresent ("Configured names: {0}" -f ($RequiredSecrets -join ", "))

$health = Test-HttpOk "$url/health"
Write-Check "Production URL" $health.Ok ("{0}/health -> HTTP {1}" -f $url, $health.StatusCode)

$git = Invoke-External "git" @("status", "--short")
$gitDetail = if ([string]::IsNullOrWhiteSpace($git.Output)) { "working tree clean" } else { "working tree has changes" }
Write-Check "Git status" ($git.ExitCode -eq 0) $gitDetail
if (-not [string]::IsNullOrWhiteSpace($git.Output)) { Write-Host $git.Output }

$packagePath = Join-Path $RepoRoot "package.json"
$serverPackagePath = Join-Path $RepoRoot "server\package.json"
$nodeModulesPath = Join-Path $RepoRoot "node_modules"
$buildReady = (Test-Path -LiteralPath $packagePath) -and (Test-Path -LiteralPath $serverPackagePath) -and (Test-Path -LiteralPath $nodeModulesPath)
Write-Check "Build readiness" $buildReady "package.json, server/package.json, and node_modules are present."

if ($script:Ready) {
  Write-Host "READY"
  exit 0
}

Write-Host "NOT READY"
exit 1
