param(
  [string]$TaskName = "EmployeeActivityMonitor",
  [string]$ApiUrl = "http://localhost:8080/api/system-events/ingest",
  [Parameter(Mandatory = $true)][string]$CollectorToken,
  [Parameter(Mandatory = $true)][string]$EmployeeId,
  [Parameter(Mandatory = $true)][string]$EmployeeName
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$npmLookup = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmCommand = if ($npmLookup) { $npmLookup.Source } else { "" }
if (-not $npmCommand) {
  $npmCommand = (Get-Command npm -ErrorAction Stop).Source
}

$argumentList = @(
  "/c",
  "cd /d `"$projectRoot`" && `"$npmCommand`" run py:system-events -- --api-url `"$ApiUrl`" --collector-token `"$CollectorToken`" --employee-id `"$EmployeeId`" --employee-name `"$EmployeeName`""
) -join " "

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $argumentList
$triggerAtLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerAtStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($triggerAtLogon, $triggerAtStartup) `
  -Settings $settings `
  -Description "Runs the employee Windows activity monitor and reconnects it after login, restart, or failure." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName'."
