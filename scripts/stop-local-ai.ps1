[CmdletBinding()]
param([switch]$Check)

. (Join-Path $PSScriptRoot 'local-ai-common.ps1')

$failed = $false
Write-Host ''
Write-Host 'CASE CLOSED - STOP LOCAL AI' -ForegroundColor Cyan
foreach ($kind in @('relay', 'server')) {
    try {
        $ownedProcess = Get-VerifiedLocalProcess $kind
        if ($null -eq $ownedProcess) {
            Write-Host ("The $kind process is already stopped.")
            if (-not $Check) {
                $staleRecord = Get-LocalPidPath $kind
                if (Test-Path -LiteralPath $staleRecord -PathType Leaf) { Remove-Item -LiteralPath $staleRecord }
            }
            continue
        }
        if ($Check) { Write-Host ("Verified the $kind process. Check mode leaves it running."); continue }
        # Re-query immediately before termination to verify the executable and project command again.
        $verifiedAgain = Get-VerifiedLocalProcess $kind
        if ($null -eq $verifiedAgain -or $verifiedAgain.ProcessId -ne $ownedProcess.ProcessId -or $verifiedAgain.CreationDate -ne $ownedProcess.CreationDate) {
            throw 'The process changed while checking it. Nothing was stopped.'
        }
        Stop-Process -Id $verifiedAgain.ProcessId -Force -ErrorAction Stop
        Remove-Item -LiteralPath (Get-LocalPidPath $kind)
        Write-Host ("Stopped the $kind process.") -ForegroundColor Green
    } catch {
        $failed = $true
        Write-Host $_.Exception.Message -ForegroundColor Yellow
    }
}
if ($Check) { Write-Host 'Read-only check complete.' }
elseif (-not $failed) { Write-Host 'Local AI is stopped. Recorded workshop dialogue remains available in the app.' }
if ($failed) { exit 1 }
exit 0
