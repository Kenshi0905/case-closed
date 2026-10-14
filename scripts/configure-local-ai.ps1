param(
    [Parameter(Mandatory=$true)][string]$SiteUrl,
    [string]$Model = 'case-closed-local'
)
$ErrorActionPreference = 'Stop'
$origin = [Uri]$SiteUrl
if ($origin.Scheme -ne 'https' -and -not ($origin.IsLoopback -and $origin.Scheme -eq 'http')) {
    throw 'Use an HTTPS site, or HTTP only on loopback for development.'
}
if ($origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -ne '/') {
    throw 'Supply the site origin only, without credentials, a path or query.'
}
$secret = Read-Host 'Relay token from your own server configuration (hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($token.Length -lt 32) { throw 'Use a random relay token of at least 32 characters.' }
    $config = @{ siteUrl=$origin.GetLeftPart([UriPartial]::Authority); relayToken=$token; localUrl='http://127.0.0.1:8081/v1/chat/completions'; model=$Model } | ConvertTo-Json -Compress
    Add-Type -AssemblyName System.Security
    $bytes = [Text.Encoding]::UTF8.GetBytes($config)
    $protected = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $projectRoot = Split-Path $PSScriptRoot -Parent
    $settingsDirectory = Join-Path $projectRoot '.local-ai'
    New-Item -ItemType Directory -Force -Path $settingsDirectory | Out-Null
    [IO.File]::WriteAllText((Join-Path $settingsDirectory 'relay.secrets'),[Convert]::ToBase64String($protected))
    Write-Host 'Saved encrypted configuration for this Windows account. No model or relay was started.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
    $token=$null; $config=$null
    $secret.Dispose()
}
