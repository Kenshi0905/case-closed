[CmdletBinding()]
param(
    [switch]$ModelOnly,
    [switch]$Check
)

. (Join-Path $PSScriptRoot 'local-ai-common.ps1')

try {
    Write-Host ''
    Write-Host 'CASE CLOSED - LOCAL AI' -ForegroundColor Cyan
    Write-Host ''
    foreach ($requiredFile in @($RuntimeExecutable, $ModelFile)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) { throw 'The portable model or runtime is missing. Complete the local AI download first.' }
    }
    if (-not $ModelOnly) {
        $nodeExecutable = Get-NodeExecutable
        if (-not (Test-Path -LiteralPath $ProtectedConfig -PathType Leaf)) { throw 'The protected relay configuration is missing. Complete Site setup first.' }
        if (-not (Test-Path -LiteralPath $RelayScript -PathType Leaf)) { throw 'The local relay script is missing from this project.' }
    }
    if ($Check) {
        Write-Host 'Model and portable runtime: ready.'
        if (-not $ModelOnly) { Write-Host 'Node.js and protected relay configuration: ready.' }
        if (Test-LocalModelHealth) { Write-Host 'Local model health: ready on this computer.' -ForegroundColor Green }
        else { Write-Host 'Local model health: stopped or still loading.' -ForegroundColor Yellow }
        Write-Host 'Check complete. No service was started and no credentials were decrypted.'
        exit 0
    }

    if (-not (Test-Path -LiteralPath $LocalAiDirectory -PathType Container)) { New-Item -ItemType Directory -Path $LocalAiDirectory | Out-Null }
    $existingServer = Get-VerifiedLocalProcess 'server'
    if ($null -eq $existingServer) {
        $occupiedPort = Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue
        if ($null -ne $occupiedPort) { throw 'Port 8081 is already in use by an unverified program. It was left running.' }
        $statusDirectory = Join-Path $ProjectDirectory 'local-ai\status'
        $serverArguments = @('--model', ('"' + $ModelFile + '"'), '--host', '127.0.0.1', '--port', '8081', '-c', '4096', '-ngl', '99', '-t', '6', '--parallel', '1', '--alias', 'case-closed-local', '--path', ('"' + $statusDirectory + '"'))
        $serverProcess = Start-Process -FilePath $RuntimeExecutable -ArgumentList $serverArguments -WorkingDirectory $ProjectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LocalAiDirectory 'server.stdout.log') -RedirectStandardError (Join-Path $LocalAiDirectory 'server.stderr.log')
        Save-LocalProcessId 'server' $serverProcess.Id
        Write-Host 'Loading the local model with GPU acceleration...'
    } else { Write-Host 'The local model is already running.' }

    $ready = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (Test-LocalModelHealth) { $ready = $true; break }
        if ($null -eq (Get-VerifiedLocalProcess 'server')) { throw 'The model stopped during startup. See .local-ai\server.stderr.log.' }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'The model is still loading. Wait a moment and run Start Local AI again. See .local-ai\server.stderr.log if it continues.' }
    Write-Host 'Local model ready.' -ForegroundColor Green
    Write-Host 'Open http://127.0.0.1:8081 for the local model status page.'
    if ($ModelOnly) { Write-Host 'Model-only mode: the hosted relay was not started.'; exit 0 }

    $existingRelay = Get-VerifiedLocalProcess 'relay'
    if ($null -eq $existingRelay) {
        # Credentials remain in the protected file. The normal Windows account decrypts them only inside Node memory.
        $relayProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $RelayScript + '"') -WorkingDirectory $ProjectDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LocalAiDirectory 'relay.stdout.log') -RedirectStandardError (Join-Path $LocalAiDirectory 'relay.stderr.log')
        Save-LocalProcessId 'relay' $relayProcess.Id
        Start-Sleep -Seconds 3
        if ($null -eq (Get-VerifiedLocalProcess 'relay')) { throw 'The relay could not start. See .local-ai\relay.stderr.log, and run this launcher from the Windows account used during setup.' }
        Write-Host 'The workshop relay is running.' -ForegroundColor Green
    } else { Write-Host 'The workshop relay is already running.' }
    Write-Host ''
    Write-Host 'You can close this window. Keep this computer awake during the workshop.'
    Write-Host 'Use Stop Local AI when the session is finished.'
    exit 0
} catch {
    Write-Host ('Local AI could not start: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
