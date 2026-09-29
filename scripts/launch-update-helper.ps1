param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$ClientScript,
    [Parameter(Mandatory = $true)][string]$InstallRoot
)
$ErrorActionPreference = 'Stop'
foreach ($file in @($NodePath, $ClientScript)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Thieu file cap nhat: $file" }
}
if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'shared\current.json') -PathType Leaf)) {
    throw 'Thu muc cai dat chua co con tro phien ban.'
}

# This short-lived PowerShell process exits before the updater stops the old
# backend. Its child is then outside the backend's taskkill /T process tree.
$arguments = @('"' + $ClientScript + '"', 'apply', '"' + $InstallRoot + '"')
$client = Start-Process -FilePath $NodePath -ArgumentList $arguments -WorkingDirectory (Split-Path -Parent $ClientScript) -WindowStyle Hidden -PassThru
if (-not $client -or -not $client.Id) { throw 'Khong khoi chay duoc trinh cap nhat doc lap.' }
Write-Output "Updater PID $($client.Id)"
