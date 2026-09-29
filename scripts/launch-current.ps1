param([Parameter(Mandatory = $true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
$pointer = Join-Path $root 'shared\current.json'
$current = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
$release = [string]$current.release
if ($release -notmatch '^\d+\.\d+\.\d+-[a-f0-9]{8}$') { throw 'Con tro phien ban khong hop le.' }
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $root "releases\$release"))
$releasesRoot = [IO.Path]::GetFullPath((Join-Path $root 'releases')).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $releaseRoot.StartsWith($releasesRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Duong dan phien ban vuot khoi thu muc cai dat.' }
$start = Join-Path $releaseRoot 'start.bat'
if (-not (Test-Path -LiteralPath $start -PathType Leaf)) { throw "Thieu start.bat cua phien ban $release" }
$env:DALAT_INSTALL_ROOT = $root
$env:DALAT_DATA_DIR = Join-Path $root 'shared\data'
& $start
exit $LASTEXITCODE
