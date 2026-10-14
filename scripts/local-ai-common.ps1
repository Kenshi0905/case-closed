Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$LocalAiDirectory = Join-Path $ProjectDirectory '.local-ai'
$RuntimeExecutable = Join-Path $LocalAiDirectory 'runtime\llama-server.exe'
$ModelFile = Join-Path $LocalAiDirectory 'qwen2.5-1.5b-instruct-q4_k_m.gguf'
$RelayScript = Join-Path $PSScriptRoot 'local-ai-relay.mjs'
$ProtectedConfig = Join-Path $LocalAiDirectory 'relay.secrets'

function Get-NodeExecutable {
    $programFilesDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles)
    if ([string]::IsNullOrEmpty($programFilesDirectory)) { $programFilesDirectory = 'C:\Program Files' }
    $installedNode = Join-Path $programFilesDirectory 'nodejs\node.exe'
    if (Test-Path -LiteralPath $installedNode -PathType Leaf) { return $installedNode }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand -and (Test-Path -LiteralPath $nodeCommand.Source -PathType Leaf)) { return $nodeCommand.Source }
    throw 'Node.js was not found. Install Node.js or restore its path before starting the local relay.'
}

function Get-LocalPidPath([string]$Kind) {
    if ($Kind -notin @('server', 'relay')) { throw 'Unknown local AI process kind.' }
    return Join-Path $LocalAiDirectory ($Kind + '.pid')
}

function Get-VerifiedLocalProcess([string]$Kind) {
    $pidPath = Get-LocalPidPath $Kind
    if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf)) { return $null }
    $pidText = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    if ($pidText -notmatch '^\d{1,10}$') { throw "The saved $Kind process record is invalid. No process was changed." }
    $savedProcessId = [int]$pidText
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$savedProcessId" -ErrorAction Stop
    if ($null -eq $candidate) { return $null }
    if (-not $candidate.ExecutablePath -or -not $candidate.CommandLine) { throw "Windows could not verify the saved $Kind process. No process was changed." }
    $actualExecutable = [IO.Path]::GetFullPath($candidate.ExecutablePath)
    $expectedExecutable = if ($Kind -eq 'server') { $RuntimeExecutable } else { Get-NodeExecutable }
    if (-not [string]::Equals($actualExecutable, [IO.Path]::GetFullPath($expectedExecutable), [StringComparison]::OrdinalIgnoreCase)) {
        throw "The saved $Kind process ID belongs to a different program. It was left running."
    }
    $requiredArgument = if ($Kind -eq 'server') { $ModelFile } else { $RelayScript }
    $normalizedCommand = $candidate.CommandLine.Replace('/', '\')
    $normalizedArgument = $requiredArgument.Replace('/', '\')
    if ($normalizedCommand.IndexOf($normalizedArgument, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "The saved $Kind process does not belong to this project. It was left running."
    }
    if ($Kind -eq 'server' -and ($candidate.CommandLine -notmatch '--host(?:\s+|=)"?127\.0\.0\.1' -or $candidate.CommandLine -notmatch '--port(?:\s+|=)"?8081(?:\s|"|$)')) {
        throw 'The saved model process does not match the expected loopback service. It was left running.'
    }
    return $candidate
}

function Test-LocalModelHealth {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8081/health' -Method Get -TimeoutSec 2
        return $health.status -eq 'ok'
    } catch { return $false }
}

function Save-LocalProcessId([string]$Kind, [int]$ProcessIdValue) {
    [IO.File]::WriteAllText((Get-LocalPidPath $Kind), [string]$ProcessIdValue, [Text.Encoding]::ASCII)
}
