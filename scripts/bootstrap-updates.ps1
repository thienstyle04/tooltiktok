param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [string]$PackageRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$IsolatedTest
)
$ErrorActionPreference = 'Stop'

function Full([string]$value) { return [IO.Path]::GetFullPath($value).TrimEnd('\', '/') }
function Child([string]$root, [string]$target) {
    $base = (Full $root) + [IO.Path]::DirectorySeparatorChar
    return (Full $target).StartsWith($base, [StringComparison]::OrdinalIgnoreCase)
}
function Copy-Code([string]$source, [string]$target) {
    if (-not (Child $install $target)) { throw "Thu muc release vuot khoi noi cai dat: $target" }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    $excludes = @('.git', 'node_modules', '.next', 'outputs', 'shared', 'releases', '.codex', '.test-runtime', '.codex-runtime')
    $excludedPaths = @($excludes | ForEach-Object { Join-Path $source $_ })
    $excludedPaths += @((Join-Path $source 'backend\data'), (Join-Path $source 'backend\node_modules'), (Join-Path $source 'frontend\node_modules'), (Join-Path $source 'frontend\.next'))
    $args = @($source, $target, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP', '/XJ', '/XD') + $excludedPaths + @('/XF', '.env', '*.log')
    & robocopy @args | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Sao chep ban phat hanh that bai ($LASTEXITCODE)." }
}
function Version([string]$root) {
    $raw = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
    if ($raw -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "VERSION khong hop le: $raw" }
    return '{0}.{1}.{2:00}' -f [int]$Matches[1], [int]$Matches[2], [int]$Matches[3]
}
function Commit8([string]$root) {
    $manifest = Join-Path $root 'build-manifest.json'
    if (Test-Path -LiteralPath $manifest) {
        $commit = [string](Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).commit
        if ($commit -match '^[a-f0-9]{40}$') { return $commit.Substring(0, 8) }
    }
    if (Test-Path -LiteralPath (Join-Path $root '.git')) {
        $commit = (& git -C $root rev-parse HEAD 2>$null | Select-Object -First 1).Trim()
        if ($commit -match '^[a-f0-9]{40}$') { return $commit.Substring(0, 8) }
    }
    return '00000000'
}

$install = Full $InstallRoot
$package = Full $PackageRoot
if (-not (Test-Path -LiteralPath (Join-Path $install 'start.bat') -PathType Leaf)) { throw 'Khong thay start.bat trong ban cai cu.' }
if (-not (Test-Path -LiteralPath (Join-Path $package 'scripts\launch-current.ps1') -PathType Leaf)) { throw 'Goi moi thieu trinh cap nhat.' }
if (-not (Test-Path -LiteralPath (Join-Path $package 'backend\src\main.ts') -PathType Leaf)) { throw 'Goi moi thieu backend.' }
if (Test-Path -LiteralPath (Join-Path $install 'shared\current.json')) { throw 'May da cai trinh cap nhat; khong chay bootstrap lan nua.' }
if ($IsolatedTest -and -not (Child ([IO.Path]::GetTempPath()) $install)) { throw 'IsolatedTest chi cho phep thu muc trong TEMP.' }
if (-not $IsolatedTest) {
    foreach ($port in @(3000, 3001)) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Hay tat tool dang chay tren cong $port truoc khi chuyen du lieu." }
    }
}
$shared = Full (Join-Path $install 'shared')
$releases = Full (Join-Path $install 'releases')
$oldData = Full (Join-Path $install 'backend\data')
$newData = Full (Join-Path $shared 'data')
if (-not (Child $install $shared) -or -not (Child $install $releases) -or -not (Child $install $newData) -or -not (Child $install $oldData)) { throw 'Duong dan cai dat khong an toan.' }
if (Test-Path -LiteralPath $newData) { throw 'shared/data da ton tai; can kiem tra thu cong de tranh ghi de.' }
if ((Test-Path -LiteralPath $oldData) -and ((Get-Item -LiteralPath $oldData -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'backend/data la junction; can kiem tra dich truoc khi chuyen.' }
New-Item -ItemType Directory -Path $shared, $releases -Force | Out-Null

$legacyVersion = Version $install
$legacyName = "$legacyVersion-$(Commit8 $install)"
$newVersion = Version $package
$newName = "$newVersion-$(Commit8 $package)"
if ($package -ne $install -and $legacyName -eq $newName) { $legacyName = "$legacyVersion-00000000" }
$legacyRelease = Join-Path $releases $legacyName
$newRelease = Join-Path $releases $newName
if (Test-Path -LiteralPath $legacyRelease) { throw "Release cu da ton tai: $legacyRelease" }
if (Test-Path -LiteralPath $newRelease) { throw "Release moi da ton tai: $newRelease" }

if ($package -ne $install) { Copy-Code $install $legacyRelease }
Copy-Code $package $newRelease
foreach ($relative in @('start.bat', 'VERSION', 'scripts\dev.js', 'scripts\update-client.js', 'backend\package.json', 'frontend\package.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $newRelease $relative) -PathType Leaf)) { throw "Release moi thieu $relative" }
}

if (Test-Path -LiteralPath $oldData -PathType Container) {
    $before = Get-ChildItem -LiteralPath $oldData -Recurse -File -Force | Measure-Object -Property Length -Sum
    Move-Item -LiteralPath $oldData -Destination $newData
    $after = Get-ChildItem -LiteralPath $newData -Recurse -File -Force | Measure-Object -Property Length -Sum
    if ($before.Count -ne $after.Count -or $before.Sum -ne $after.Sum) { throw 'So luong/kich thuoc du lieu thay doi sau khi chuyen. Dung lai de kiem tra.' }
    New-Item -ItemType Junction -Path $oldData -Target $newData | Out-Null
} else {
    New-Item -ItemType Directory -Path $newData -Force | Out-Null
}
if ($package -ne $install) {
    New-Item -ItemType Junction -Path (Join-Path $legacyRelease 'backend\data') -Target $newData | Out-Null
}
$oldEnv = Join-Path $install 'backend\.env'
if (Test-Path -LiteralPath $oldEnv -PathType Leaf) {
    $config = Join-Path $env:LOCALAPPDATA 'DalatTikTokCarouselTool\config'
    New-Item -ItemType Directory -Path $config -Force | Out-Null
    $sharedEnv = Join-Path $config 'backend.env'
    if (-not (Test-Path -LiteralPath $sharedEnv)) { Copy-Item -LiteralPath $oldEnv -Destination $sharedEnv }
    if ($package -ne $install) { Copy-Item -LiteralPath $oldEnv -Destination (Join-Path $legacyRelease 'backend\.env') }
}
Copy-Item -LiteralPath (Join-Path $install 'start.bat') -Destination (Join-Path $shared 'legacy-start.bat')
if ($package -ne $install) {
    Copy-Item -LiteralPath (Join-Path $package 'start.bat') -Destination (Join-Path $install 'start.bat') -Force
    Copy-Item -LiteralPath (Join-Path $package 'scripts\launch-current.ps1') -Destination (Join-Path $install 'scripts\launch-current.ps1') -Force
}
$pointer = @{ release = $newName; version = $newVersion } | ConvertTo-Json -Compress
$temporary = Join-Path $shared 'current.json.tmp'
[IO.File]::WriteAllText($temporary, $pointer, [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination (Join-Path $shared 'current.json')
Write-Host "Da cai launcher cap nhat: $install"
Write-Host "Du lieu giu tai: $newData"
Write-Host "Phien ban dang dung: $newName"
if ($package -ne $install) { Write-Host "Ban cu co the khoi phuc tai: $legacyRelease" }
