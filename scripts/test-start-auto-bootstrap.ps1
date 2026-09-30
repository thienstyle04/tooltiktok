$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) "dalat-start-bootstrap-test-$([guid]::NewGuid().ToString('N'))"
$scripts = Join-Path $root 'scripts'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'start.bat') -Destination (Join-Path $root 'start.bat')

@'
param([string]$InstallRoot, [string]$PackageRoot)
$shared = Join-Path $InstallRoot 'shared'
New-Item -ItemType Directory -Path $shared -Force | Out-Null
Add-Content -LiteralPath (Join-Path $shared 'bootstrap-count.txt') -Value 'once'
[IO.File]::WriteAllText((Join-Path $shared 'current.json'), '{"version":"0.8.09","release":"0.8.09-00000000"}')
'@ | Set-Content -LiteralPath (Join-Path $scripts 'bootstrap-updates.ps1')
@'
param([string]$InstallRoot)
Add-Content -LiteralPath (Join-Path $InstallRoot 'shared\launch-count.txt') -Value 'launched'
'@ | Set-Content -LiteralPath (Join-Path $scripts 'launch-current.ps1')

$previousInstallRoot = $env:DALAT_INSTALL_ROOT
try {
    Remove-Item Env:DALAT_INSTALL_ROOT -ErrorAction SilentlyContinue
    & (Join-Path $root 'start.bat')
    if ($LASTEXITCODE -ne 0) { throw "First start failed: $LASTEXITCODE" }
    & (Join-Path $root 'start.bat')
    if ($LASTEXITCODE -ne 0) { throw "Second start failed: $LASTEXITCODE" }
    $bootstrapCount = @(Get-Content -LiteralPath (Join-Path $root 'shared\bootstrap-count.txt'))
    $launchCount = @(Get-Content -LiteralPath (Join-Path $root 'shared\launch-count.txt'))
    if ($bootstrapCount.Count -ne 1 -or $launchCount.Count -ne 2) {
        throw "Unexpected calls: bootstrap=$($bootstrapCount.Count), launch=$($launchCount.Count)"
    }
    Write-Host "PASS start.bat auto-bootstrap once; fixture: $root"
} finally {
    if ($null -eq $previousInstallRoot) {
        Remove-Item Env:DALAT_INSTALL_ROOT -ErrorAction SilentlyContinue
    } else {
        $env:DALAT_INSTALL_ROOT = $previousInstallRoot
    }
}
