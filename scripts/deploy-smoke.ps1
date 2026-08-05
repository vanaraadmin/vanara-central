param(
  [string]$ConfigPath = "wrangler.jsonc",
  [string]$ProductionUrl = $env:VANARA_PRODUCTION_URL,
  [string]$Cookie = $env:VANARA_SMOKE_COOKIE,
  [int]$RoomId = 1,
  [Alias("temporary-smoke-session")]
  [switch]$TemporarySmokeSession,
  [int]$SmokeTtlSeconds = 300,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConfigFullPath = Join-Path $RepoRoot $ConfigPath
$DefaultProductionUrl = "https://vanara-central.administrator-5b7.workers.dev"
$BaseUrl = if ($ProductionUrl) { $ProductionUrl.TrimEnd("/") } else { $DefaultProductionUrl }
$UseTemporarySmokeSession = [bool]$TemporarySmokeSession -or ($RemainingArgs -contains "--temporary-smoke-session")

foreach ($arg in $RemainingArgs) {
  if ($arg -ne "--temporary-smoke-session") {
    throw "Unsupported smoke argument: $arg"
  }
}

if ($SmokeTtlSeconds -gt 300) { $SmokeTtlSeconds = 300 }
if ($SmokeTtlSeconds -le 0) { throw "SmokeTtlSeconds must be between 1 and 300 seconds." }

function Get-WranglerPath {
  $local = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
  if (Test-Path -LiteralPath $local) { return $local }
  return "wrangler.cmd"
}

function Get-WranglerInvocation {
  $localJs = Join-Path $RepoRoot "node_modules\wrangler\bin\wrangler.js"
  if (Test-Path -LiteralPath $localJs) {
    return [pscustomobject]@{
      FilePath = "node.exe"
      Prefix = @($localJs)
    }
  }
  return [pscustomobject]@{
    FilePath = Get-WranglerPath
    Prefix = @()
  }
}

function Read-Config {
  if (-not (Test-Path -LiteralPath $ConfigFullPath)) {
    throw "Wrangler config not found at $ConfigFullPath"
  }
  return Get-Content -LiteralPath $ConfigFullPath -Raw | ConvertFrom-Json
}

function ConvertTo-Base64Url {
  param([byte[]]$Bytes)
  return [Convert]::ToBase64String($Bytes).TrimEnd([char]"=").Replace("+", "-").Replace("/", "_")
}

function New-SessionToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ConvertTo-Base64Url $bytes
}

function Get-SessionTokenHash {
  param([string]$Token)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Token)
    return ConvertTo-Base64Url ($sha.ComputeHash($bytes))
  } finally {
    $sha.Dispose()
  }
}

function Quote-SqlText {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

$config = Read-Config
$database = $config.d1_databases | Select-Object -First 1
if (-not $database) { throw "No D1 database binding found in $ConfigPath." }
$databaseName = [string]$database.database_name
$wranglerInvocation = Get-WranglerInvocation

function Invoke-D1Json {
  param(
    [string]$Sql,
    [switch]$Sensitive
  )
  $arguments = @($wranglerInvocation.Prefix) + @("d1", "execute", $databaseName, "--remote", "--config", $ConfigFullPath, "--json", "--command", $Sql)
  $output = & $wranglerInvocation.FilePath @arguments 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    if ($Sensitive) { throw "D1 command failed while managing the temporary smoke session." }
    throw ("D1 command failed: {0}" -f (($output | Out-String).Trim()))
  }
  $json = ($output | Out-String).Trim()
  if (-not $json) { throw "D1 command returned no JSON output." }
  $parsed = $json | ConvertFrom-Json
  $first = @($parsed | Select-Object -First 1)[0]
  if (-not $first.success) {
    if ($Sensitive) { throw "D1 command was not successful while managing the temporary smoke session." }
    throw "D1 command was not successful."
  }
  return $first
}

function Get-D1FirstRow {
  param([string]$Sql)
  $result = Invoke-D1Json $Sql
  if ($null -eq $result.results) { return $null }
  $rows = @($result.results)
  if ($rows.Count -eq 0 -or $null -eq $rows[0]) { return $null }
  return $rows[0]
}

function Get-D1Count {
  param(
    [string]$Sql,
    [string]$Column = "total"
  )
  $row = Get-D1FirstRow $Sql
  if ($null -eq $row) { return 0 }
  $property = $row.PSObject.Properties[$Column]
  if ($null -eq $property) { return 0 }
  return [int]$property.Value
}

function New-TemporarySmokeSession {
  $ownerSql = @"
SELECT u.user_id
FROM users u
INNER JOIN user_views v
  ON v.user_id = u.user_id
  AND v.view_key = 'owner'
INNER JOIN user_module_permissions p
  ON p.user_id = u.user_id
  AND p.module_key = 'housekeeping'
  AND p.can_access = 1
WHERE u.role = 'Owner'
  AND u.status = 'active'
ORDER BY u.user_id
LIMIT 1
"@
  $owner = Get-D1FirstRow $ownerSql
  if ($null -eq $owner) {
    throw "No existing active Owner account with Housekeeping read access was found. Stop without changing passwords, roles, or permissions."
  }

  $sessionId = [guid]::NewGuid().ToString()
  $token = New-SessionToken
  $tokenHash = Get-SessionTokenHash $token
  $now = (Get-Date).ToUniversalTime()
  $expiresAt = $now.AddSeconds($SmokeTtlSeconds)

  $insertSql = @"
INSERT INTO user_sessions (session_id, user_id, token_hash, created_at, expires_at)
VALUES ($(Quote-SqlText $sessionId), $(Quote-SqlText ([string]$owner.user_id)), $(Quote-SqlText $tokenHash), $(Quote-SqlText $now.ToString("o")), $(Quote-SqlText $expiresAt.ToString("o")))
"@

  try {
    Invoke-D1Json $insertSql -Sensitive | Out-Null
    $stored = Get-D1Count ("SELECT COUNT(*) AS total FROM user_sessions WHERE session_id = {0}" -f (Quote-SqlText $sessionId))
    if ($stored -ne 1) { throw "Temporary smoke session was not stored." }
  } catch {
    try {
      Invoke-D1Json ("DELETE FROM user_sessions WHERE session_id = {0} OR token_hash = {1}" -f (Quote-SqlText $sessionId), (Quote-SqlText $tokenHash)) -Sensitive | Out-Null
    } catch {
      Write-Host "[WARN] Temporary smoke session setup cleanup could not be verified."
    }
    throw
  }

  Write-Host ("[OK] Temporary Owner smoke session created with TTL {0} seconds; token hidden." -f $SmokeTtlSeconds)
  return [pscustomobject]@{
    SessionId = $sessionId
    TokenHash = $tokenHash
    Cookie = "vanara_session=$token"
  }
}

function Remove-TemporarySmokeSession {
  param([object]$Session)
  if ($null -eq $Session) { return }

  Invoke-D1Json ("DELETE FROM user_sessions WHERE session_id = {0} OR token_hash = {1}" -f (Quote-SqlText ([string]$Session.SessionId)), (Quote-SqlText ([string]$Session.TokenHash))) -Sensitive | Out-Null
  $remaining = Get-D1Count ("SELECT COUNT(*) AS total FROM user_sessions WHERE session_id = {0} OR token_hash = {1}" -f (Quote-SqlText ([string]$Session.SessionId)), (Quote-SqlText ([string]$Session.TokenHash)))
  if ($remaining -ne 0) { throw "Temporary smoke session cleanup verification failed." }
  Write-Host "[OK] Temporary smoke session revoked and verified removed."
}

$SmokeWebSession = $null

function Get-SmokeCookieValue {
  param([string]$CookieHeader)
  foreach ($part in ($CookieHeader -split ";")) {
    $trimmed = $part.Trim()
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 0) { continue }
    $name = $trimmed.Substring(0, $separator)
    $value = $trimmed.Substring($separator + 1)
    if ($name -eq "vanara_session" -and $value) { return $value }
  }
  throw "Smoke cookie must include vanara_session."
}

function New-SmokeWebSession {
  param([string]$CookieHeader)
  $uri = [Uri]$BaseUrl
  $tokenValue = Get-SmokeCookieValue $CookieHeader
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $cookie = New-Object System.Net.Cookie("vanara_session", $tokenValue, "/", $uri.Host)
  $session.Cookies.Add($cookie)
  return $session
}

function Invoke-SmokeGet {
  param(
    [string]$Path,
    [bool]$Json = $true
  )
  if ($null -eq $SmokeWebSession) { throw "Smoke web session was not initialized." }
  $uri = "$BaseUrl$Path"
  $maxAttempts = if ($Path -eq "/") { 1 } else { 5 }
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -Uri $uri -Method GET -WebSession $SmokeWebSession -Headers @{ Accept = "application/json" } -UseBasicParsing -TimeoutSec 30
      if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "GET $Path returned HTTP $($response.StatusCode)"
      }
      Write-Host ("[OK] GET {0}: HTTP {1}" -f $Path, $response.StatusCode)
      if (-not $Json) { return $response }
      return $response.Content | ConvertFrom-Json
    } catch {
      $status = $null
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $status = [int]$_.Exception.Response.StatusCode
      }
      if ($attempt -lt $maxAttempts) {
        Start-Sleep -Milliseconds 750
        continue
      }
      if ($status) {
        Write-Host ("[FAILED] GET {0}: HTTP {1}" -f $Path, $status)
        throw "GET $Path failed with HTTP $status"
      }
      Write-Host ("[FAILED] GET {0}: request failed" -f $Path)
      throw
    }
  }
}

function Assert-JsonSuccess {
  param(
    [object]$Body,
    [string]$Label
  )
  if (-not $Body.success) { throw "$Label returned success=false" }
}

function Get-Section {
  param(
    [object]$Overview,
    [string]$Id
  )
  return @($Overview.data.sections | Where-Object { $_.id -eq $Id }) | Select-Object -First 1
}

function Get-StaffCard {
  param(
    [object]$Overview,
    [string]$Id
  )
  return @($Overview.data.cards | Where-Object { $_.id -eq $Id }) | Select-Object -First 1
}

function Get-RoomByName {
  param(
    [object]$Overview,
    [string]$Name
  )
  return @($Overview.data.rooms | Where-Object { $_.roomName -eq $Name }) | Select-Object -First 1
}

function Get-FirstRoom {
  param(
    [object]$Overview,
    [scriptblock]$Predicate
  )
  return @($Overview.data.rooms | Where-Object $Predicate) | Select-Object -First 1
}

if ($UseTemporarySmokeSession -and $Cookie) {
  Write-Host "Smoke authentication: explicit temporary session flag provided; VANARA_SMOKE_COOKIE will be ignored."
}

$temporarySession = $null

try {
  if ($UseTemporarySmokeSession) {
    $temporarySession = New-TemporarySmokeSession
    $Cookie = [string]$temporarySession.Cookie
  } elseif (-not $Cookie) {
    Write-Host "[FAILED] Smoke authentication: missing Vanara session cookie."
    Write-Host "SETUP ACTION: Sign in to production with an authorized Vanara account, set VANARA_SMOKE_COOKIE in this shell to the full 'vanara_session=...' cookie value, rerun the smoke, then clear the variable. Or run with --temporary-smoke-session to create a short-lived Owner smoke session."
    exit 1
  }

  $SmokeWebSession = New-SmokeWebSession $Cookie

  Write-Host ("Vanara production smoke: {0}" -f $BaseUrl)

  Invoke-SmokeGet "/" $false | Out-Null

  $currentUser = Invoke-SmokeGet "/api/current-user"
  Assert-JsonSuccess $currentUser "Current user"
  Write-Host ("[OK] Authenticated user role: {0}" -f $currentUser.data.role)

  $messagesInbox = Invoke-SmokeGet "/api/messages/conversations"
  Assert-JsonSuccess $messagesInbox "Guest Messages inbox"
  foreach ($key in @("needsReply", "waitingGuest", "closed")) {
    if (-not $messagesInbox.data.groups.PSObject.Properties.Name.Contains($key)) { throw "Guest Messages inbox missing $key group" }
  }
  Write-Host ("[OK] Guest Messages inbox read-only groups: {0} conversations" -f @($messagesInbox.data.conversations).Count)

  $summary = Invoke-SmokeGet "/api/housekeeping/v2/summary"
  Assert-JsonSuccess $summary "Housekeeping summary"
  foreach ($key in @("toClean", "cleaningInProgress", "completedCleaningToday", "waterDue")) {
    if (-not $summary.data.PSObject.Properties.Name.Contains($key)) { throw "Housekeeping summary missing $key" }
  }
  if ($summary.data.PSObject.Properties.Name.Contains("blockedRooms")) { throw "Housekeeping summary must not expose blockedRooms" }
  Write-Host "[OK] Housekeeping Summary structure"
  Write-Host ("[OK] Housekeeping Summary values: {0} To Clean / {1} Cleaning In Progress / {2} Completed Cleaning Today / {3} Water Due" -f $summary.data.toClean, $summary.data.cleaningInProgress, $summary.data.completedCleaningToday, $summary.data.waterDue)

  $staffOverview = Invoke-SmokeGet "/api/staff/overview"
  Assert-JsonSuccess $staffOverview "Staff overview"
  $housekeepingCard = Get-StaffCard $staffOverview "housekeeping"
  if (-not $housekeepingCard) { throw "Staff overview missing Housekeeping card" }
  $labels = @($housekeepingCard.metrics | ForEach-Object { $_.label })
  $expectedLabels = @("To Clean", "Cleaning In Progress", "Completed Cleaning Today", "Water Due")
  if ($labels.Count -gt 0 -and $labels[0] -eq "Priority Turnover") {
    $expectedLabels = @("Priority Turnover", "Normal To Clean", "Cleaning In Progress", "Water Due")
  }
  if ($labels.Count -ne $expectedLabels.Count) {
    throw ("Staff Home Housekeeping summary must expose approved housekeeping metrics. Received: {0}" -f ($labels -join ", "))
  }
  for ($i = 0; $i -lt $expectedLabels.Count; $i += 1) {
    if ($labels[$i] -ne $expectedLabels[$i]) { throw "Unexpected Staff Home Housekeeping metric '$($labels[$i])'" }
  }
  if ($labels -contains "Blocked") { throw "Staff Home Housekeeping summary must not expose Blocked" }
  if ($labels -contains "Completed Today") { throw "Staff Home Housekeeping summary must not expose generic Completed Today" }
  if ($labels -contains "Water Completed Today") { throw "Staff Home Housekeeping summary must not expose Water Completed Today" }
  $metricValues = @{}
  foreach ($metric in @($housekeepingCard.metrics)) {
    $metricValues[[string]$metric.label] = [int]$metric.value
  }
  if ($metricValues.ContainsKey("Priority Turnover") -and $metricValues["Priority Turnover"] -lt 1) { throw "Staff Home Priority Turnover metric must be positive when present" }
  if ($metricValues.ContainsKey("To Clean") -and $metricValues["To Clean"] -ne [int]$summary.data.toClean) { throw "Staff Home To Clean does not match Housekeeping summary" }
  if ($metricValues["Cleaning In Progress"] -ne [int]$summary.data.cleaningInProgress) { throw "Staff Home Cleaning In Progress does not match Housekeeping summary" }
  if ($metricValues.ContainsKey("Completed Cleaning Today") -and $metricValues["Completed Cleaning Today"] -ne [int]$summary.data.completedCleaningToday) { throw "Staff Home Completed Cleaning Today does not match Housekeeping summary" }
  if ($metricValues["Water Due"] -ne [int]$summary.data.waterDue) { throw "Staff Home Water Due does not match Housekeeping summary" }
  Write-Host "[OK] Staff Home Housekeeping summary uses approved cleaning and water counters"

  $roomsOverview = Invoke-SmokeGet "/api/rooms"
  Assert-JsonSuccess $roomsOverview "Rooms workspace"
  if (@($roomsOverview.data.rooms).Count -ne 19) { throw "Rooms workspace must return 19 rooms" }
  $roomsTotal = [int]$roomsOverview.data.summary.occupied + [int]$roomsOverview.data.summary.vacant + [int]$roomsOverview.data.summary.maintenanceBlocked + [int]$roomsOverview.data.summary.seasonClosed
  if ($roomsTotal -ne [int]$roomsOverview.data.summary.total) { throw "Rooms summary categories do not reconcile to total" }
  Write-Host ("[OK] GET /api/rooms: 19 rooms, summary reconciles to {0}" -f $roomsOverview.data.summary.total)

  $bungalow7 = Get-RoomByName $roomsOverview "Bungalow 7"
  if (-not $bungalow7) { throw "Bungalow 7 missing from Rooms workspace" }
  if ($bungalow7.operational.maintenance.state -ne "BLOCKING") { throw "Bungalow 7 must be Maintenance blocked" }
  if (-not $bungalow7.operational.maintenance.primaryTitle) { throw "Bungalow 7 must expose the primary Maintenance ticket title" }
  Write-Host ("[OK] Bungalow 7 terminal source: Out of Service / {0}" -f $bungalow7.operational.maintenance.primaryTitle)

  $villa13 = Get-RoomByName $roomsOverview "Villa 13"
  if (-not $villa13) { throw "Villa 13 missing from Rooms workspace" }
  if ($villa13.operational.availability.state -ne "NOT_OPERATING") { throw "Villa 13 must be Season Closed / Not Operating" }
  $villa13Detail = if ($villa13.operational.availability.endDate) { $villa13.operational.availability.endDate } else { $villa13.operational.availability.reason }
  Write-Host ("[OK] Villa 13 terminal source: Season Closed / {0}" -f $villa13Detail)

  $seasonalTent = Get-FirstRoom $roomsOverview { $_.accommodationType -eq "Tent" -and $_.operational.availability.state -eq "NOT_OPERATING" }
  if (-not $seasonalTent) { throw "At least one seasonal Tent must be present" }
  Write-Host ("[OK] Seasonal tent terminal source: {0}" -f $seasonalTent.roomName)

  $occupiedClean = Get-FirstRoom $roomsOverview { $_.operational.availability.state -eq "OPERATING" -and $_.operational.maintenance.state -ne "BLOCKING" -and $_.operational.occupancy.state -eq "OCCUPIED" -and $_.operational.housekeeping.condition -eq "READY" }
  if (-not $occupiedClean) { throw "No operating occupied clean room found for production Rooms validation" }
  Write-Host ("[OK] Occupied clean source order candidate: {0}" -f $occupiedClean.roomName)

  $vacantRoom = Get-FirstRoom $roomsOverview { $_.operational.availability.state -eq "OPERATING" -and $_.operational.maintenance.state -ne "BLOCKING" -and $_.operational.occupancy.state -eq "VACANT" }
  if (-not $vacantRoom) { throw "No operating vacant room found for production Rooms validation" }
  Write-Host ("[OK] Vacant room source order candidate: {0}" -f $vacantRoom.roomName)

  $villa10 = Get-RoomByName $roomsOverview "Villa 10"
  if ($villa10 -and $villa10.operational.housekeeping.workState -eq "IN_PROGRESS") {
    Write-Host "[OK] Villa 10 active task source: Cleaning In Progress"
  } else {
    Write-Host "[OK] Villa 10 Cleaning In Progress case not active in production; covered by regression tests."
  }

  $nonBlockingMaintenance = Get-FirstRoom $roomsOverview { $_.operational.maintenance.state -eq "ACTIVE" }
  if ($nonBlockingMaintenance) {
    Write-Host ("[OK] Non-blocking Maintenance source: {0}" -f $nonBlockingMaintenance.roomName)
  } else {
    Write-Host "[OK] Non-blocking Maintenance case unavailable in production; covered by regression tests."
  }

  $turnoverToday = Get-FirstRoom $roomsOverview { $_.reception.today.checkIn -or $_.reception.today.checkOut }
  if ($turnoverToday) {
    Write-Host ("[OK] Same-day Reception source available: {0}" -f $turnoverToday.roomName)
  } else {
    Write-Host "[OK] Turnover today case unavailable in production; covered by regression tests."
  }

  $receptionAttention = Get-FirstRoom $roomsOverview { @($_.reception.alerts).Count -gt 0 }
  if ($receptionAttention) {
    Write-Host ("[OK] Reception alert source available: {0}" -f $receptionAttention.roomName)
  } else {
    Write-Host "[OK] Passport/Deposit alert case unavailable in production; covered by regression tests."
  }

  $tasks = Invoke-SmokeGet "/api/housekeeping/v2/tasks"
  Assert-JsonSuccess $tasks "Housekeeping tasks"

  $priority = Get-Section $tasks "priority-turnover"
  $normal = Get-Section $tasks "normal-cleaning"
  $water = Get-Section $tasks "water-refill"
  if (-not $priority) { throw "Priority section missing" }
  if (-not $normal) { throw "Normal section missing" }
  if (-not $water) { throw "Water section missing" }
  Write-Host ("[OK] Priority section: {0} cards" -f @($priority.cards).Count)
  Write-Host ("[OK] Normal section: {0} cards" -f @($normal.cards).Count)
  Write-Host ("[OK] Water section: {0} cards" -f @($water.cards).Count)

  $seenTaskIds = @{}
  foreach ($card in @($tasks.data.tasks)) {
    $key = [string]$card.taskId
    if ($seenTaskIds.ContainsKey($key)) { throw "Task $key appears more than once in the read model" }
    $seenTaskIds[$key] = $true
  }
  Write-Host "[OK] Task queue uniqueness"

  foreach ($card in @($water.cards)) {
    if ($null -eq $card.waterQuantity -or @("2", "4") -notcontains [string]$card.waterQuantity) {
      throw "Water task $($card.taskId) has invalid quantity $($card.waterQuantity)"
    }
  }
  Write-Host "[OK] Water quantities are fixed room-type values when water work is present"

  $escalated = @($priority.cards | Where-Object { $_.reasonCodes -contains "standard_cleaning_previous_day" -or $_.reasonCodes -contains "on_demand_previous_day" })
  Write-Host ("[OK] Priority escalation read model: {0} carried-over cards currently present" -f $escalated.Count)

  if ($RoomId -le 0 -and $env:VANARA_SMOKE_ROOM_ID) {
    $RoomId = [int]$env:VANARA_SMOKE_ROOM_ID
  }
  if ($RoomId -le 0) { $RoomId = 1 }

  $room = Invoke-SmokeGet ("/api/housekeeping/v2/rooms/{0}" -f $RoomId)
  Assert-JsonSuccess $room "Room Workspace"
  if ($room.data.room.unitId -ne $RoomId) { throw "Room Workspace returned unexpected unit id" }
  Write-Host ("[OK] Room Workspace: unit {0}" -f $RoomId)

  Write-Host "[OK] On-Demand creation path is room-owned; read-only smoke does not create operational tasks."
  Write-Host "[OK] Standard Cleaning and Full Cleaning completion paths are covered by validation tests before deploy."
  Write-Host "SMOKE GREEN"
} finally {
  if ($null -ne $temporarySession) {
    Remove-TemporarySmokeSession $temporarySession
  }
}
