[CmdletBinding()]
param([switch]$Once)
. (Join-Path $PSScriptRoot 'local-ai-common.ps1')
Write-Host 'Case Closed local AI monitor. Ctrl+C closes this viewer; the model keeps running.' -ForegroundColor Cyan
do {
    Write-Host "`n--- $(Get-Date -Format 'HH:mm:ss') ---" -ForegroundColor Cyan
    Write-Host 'Qwen 2.5 1.5B Q4_K_M / llama.cpp / Radeon Vulkan'
    Write-Host 'Model endpoint: http://127.0.0.1:8081'
    foreach ($kind in @('server','relay')) {
        try { $process = Get-VerifiedLocalProcess $kind; if ($null -ne $process) { Write-Host "$kind running (PID $($process.ProcessId))" -ForegroundColor Green } else { Write-Host "$kind stopped" -ForegroundColor Yellow } }
        catch { Write-Host "$kind verification unavailable; no process changed." -ForegroundColor Yellow }
    }
    Write-Host ('Model health: ' + $(if (Test-LocalModelHealth) {'ready'} else {'not ready'}))
    $relayLog = Join-Path $LocalAiDirectory 'relay.stdout.log'
    if (Test-Path -LiteralPath $relayLog) {
        Get-Content -LiteralPath $relayLog -Tail 8 | ForEach-Object {
            try {
                $row = $_ | ConvertFrom-Json
                $shown = [ordered]@{time=$row.time;event=$row.event}
                foreach ($field in @('latencyMs','promptTokens','completionTokens','source','reason','attempt','status')) {
                    if ($row.PSObject.Properties.Name -contains $field) { $shown[$field] = $row.$field }
                }
                Write-Host ($shown | ConvertTo-Json -Compress)
            } catch { Write-Host 'A log entry could not be read.' }
        }
    }
    Write-Host "Logs folder: $LocalAiDirectory"
    if (-not $Once) { Start-Sleep -Seconds 3 }
} while (-not $Once)
