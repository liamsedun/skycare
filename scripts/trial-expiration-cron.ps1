# trial-expiration-cron.ps1
# Calls the platform cron endpoint to auto-suspend expired trials.
# Run via Windows Task Scheduler every 15 minutes.

$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3000"
$endpoint = "$baseUrl/api/platform/cron/check-expired-trials"
$secret = "E_M6aIrS20NelunG_az-z9bL75_neXBbFphj9hegIwM"

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Headers @{
        "Authorization" = "Bearer $secret"
        "Content-Type"  = "application/json"
        "User-Agent"    = "SkyCare-Cron/1.0"
    } -Body "{}" -TimeoutSec 30

    $log = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Trial check OK: $($response.suspendedCount) suspended"
    Add-Content -Path "C:\Users\Admin\Downloads\skycare--saas-hosp\logs\trial-cron.log" -Value $log
} catch {
    $log = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Trial check FAILED: $($_.Exception.Message)"
    Add-Content -Path "C:\Users\Admin\Downloads\skycare--saas-hosp\logs\trial-cron.log" -Value $log
}
