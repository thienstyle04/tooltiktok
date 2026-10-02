$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) "dalat-update-bootstrap-test-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path (Join-Path $root 'backend\data'), (Join-Path $root 'scripts') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $root 'VERSION'), "0.7.03`n")
[IO.File]::WriteAllText((Join-Path $root 'start.bat'), "@echo off`r`n")
[IO.File]::WriteAllText((Join-Path $root 'backend\data\generated-caption-lists.dalat.json'), '{"lists":[{"id":"keep-me"}]}')
[IO.File]::WriteAllBytes((Join-Path $root 'backend\data\workbook-cache.dalat.xlsx'), [byte[]](1, 2, 3, 4))
[IO.File]::WriteAllText((Join-Path $root 'backend\data\automation-schedules.json'), '{"schedules":[{"id":"keep-schedule"}]}')
New-Item -ItemType Directory -Path (Join-Path $root 'backend\data\drive-file-cache') -Force | Out-Null
[IO.File]::WriteAllBytes((Join-Path $root 'backend\data\drive-file-cache\keep.png'), [byte[]](137, 80, 78, 71, 13, 10, 26, 10))
$before = @{}
Get-ChildItem -LiteralPath (Join-Path $root 'backend\data') -Recurse -File | ForEach-Object {
  $before[$_.FullName.Substring((Join-Path $root 'backend\data').Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
}
& (Join-Path $PSScriptRoot 'bootstrap-updates.ps1') -InstallRoot $root -PackageRoot (Split-Path -Parent $PSScriptRoot) -IsolatedTest
$shared = Join-Path $root 'shared\data\generated-caption-lists.dalat.json'
$legacy = Join-Path $root 'backend\data\generated-caption-lists.dalat.json'
if (-not (Test-Path -LiteralPath $shared) -or -not (Test-Path -LiteralPath $legacy)) { throw 'Du lieu khong con qua shared va junction.' }
if ((Get-Content -LiteralPath $shared -Raw) -notmatch 'keep-me') { throw 'Du lieu test da bi thay doi.' }
$after = @{}
Get-ChildItem -LiteralPath (Join-Path $root 'shared\data') -Recurse -File | ForEach-Object {
  $after[$_.FullName.Substring((Join-Path $root 'shared\data').Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
}
if ($before.Count -ne $after.Count) { throw 'So file du lieu khong khop.' }
foreach ($relative in $before.Keys) { if ($after[$relative] -ne $before[$relative]) { throw "File du lieu bi thay doi: $relative" } }
$current = Get-Content -LiteralPath (Join-Path $root 'shared\current.json') -Raw | ConvertFrom-Json
$pointerBytes = [IO.File]::ReadAllBytes((Join-Path $root 'shared\current.json'))
if ($pointerBytes.Length -ge 3 -and $pointerBytes[0] -eq 0xEF -and $pointerBytes[1] -eq 0xBB -and $pointerBytes[2] -eq 0xBF) { throw 'Con tro phien ban van co UTF-8 BOM.' }
if (-not (Test-Path -LiteralPath (Join-Path $root "releases\$($current.release)\scripts\update-client.js"))) { throw 'Release moi thieu updater.' }
Write-Host "PASS bootstrap isolated; evidence: $root"

# A git clone uses the same directory for PackageRoot and InstallRoot.
$clone = Join-Path ([IO.Path]::GetTempPath()) "dalat-update-clone-test-$([guid]::NewGuid().ToString('N'))"
$source = Split-Path -Parent $PSScriptRoot
foreach ($relative in @('scripts', 'backend\src', 'backend\data', 'frontend')) {
  New-Item -ItemType Directory -Path (Join-Path $clone $relative) -Force | Out-Null
}
foreach ($relative in @('start.bat', 'VERSION', 'scripts\bootstrap-updates.ps1', 'scripts\launch-current.ps1', 'scripts\dev.js', 'scripts\update-client.js', 'backend\package.json', 'backend\src\main.ts', 'frontend\package.json')) {
  Copy-Item -LiteralPath (Join-Path $source $relative) -Destination (Join-Path $clone $relative)
}
[IO.File]::WriteAllText((Join-Path $clone 'backend\data\generated-caption-lists.dalat.json'), '{"lists":[{"id":"clone-keep-me"}]}')
[IO.File]::WriteAllText((Join-Path $clone 'backend\.env'), 'DEEPSEEK_API_KEY=clone-test-key')
$previousLocalAppData = $env:LOCALAPPDATA
try {
  $env:LOCALAPPDATA = Join-Path $clone 'test-profile'
  & (Join-Path $clone 'scripts\bootstrap-updates.ps1') -InstallRoot $clone -PackageRoot $clone -IsolatedTest
  $cloneCurrent = Get-Content -LiteralPath (Join-Path $clone 'shared\current.json') -Raw | ConvertFrom-Json
  $cloneData = Join-Path $clone 'shared\data\generated-caption-lists.dalat.json'
  $cloneEnv = Join-Path $env:LOCALAPPDATA 'DalatTikTokCarouselTool\config\backend.env'
  if (-not (Test-Path -LiteralPath $cloneData) -or (Get-Content -LiteralPath $cloneData -Raw) -notmatch 'clone-keep-me') { throw 'Clone bootstrap lost saved list.' }
  if (-not (Test-Path -LiteralPath $cloneEnv) -or (Get-Content -LiteralPath $cloneEnv -Raw) -notmatch 'clone-test-key') { throw 'Clone bootstrap lost backend config.' }
  if (-not (Test-Path -LiteralPath (Join-Path $clone "releases\$($cloneCurrent.release)\start.bat"))) { throw 'Clone bootstrap did not create a complete release.' }
  Write-Host "PASS same-root clone bootstrap; evidence: $clone"
} finally {
  $env:LOCALAPPDATA = $previousLocalAppData
}
