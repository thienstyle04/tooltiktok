# Tao file nen portable de chuyen sang may khac.
# Chay: powershell -ExecutionPolicy Bypass -File scripts/pack-lean.ps1
# Output: ../dalat-tiktok-carousel-tool-portable-YYYYMMDD-HHMM.zip

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$projectName = Split-Path -Leaf $root
$timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$outZip = Join-Path (Split-Path -Parent $root) "$projectName-portable-$timestamp.zip"
$stagingRoot = Join-Path $env:TEMP "dalat-pack-$timestamp"
$staging = Join-Path $stagingRoot $projectName

Write-Host '=============================================================='
Write-Host "  PACK PORTABLE - $projectName"
Write-Host '=============================================================='
Write-Host "Nguon : $root"
Write-Host "Dich  : $outZip"
Write-Host ''

$excludeDirs = @(
    'node_modules',
    '.git',
    '.next',
    'export-quality-test-output',
    '.codex',
    '.codex-dev-logs',
    '.codex-runtime',
    '.omx'
)

$frontendNext = Get-ChildItem -Path (Join-Path $root 'frontend') -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '.next*' } |
    ForEach-Object { Join-Path 'frontend' $_.Name }
$excludeDirs += $frontendNext

$robocopyArgs = @(
    $root,
    $staging,
    '/E',
    '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP'
)
foreach ($d in $excludeDirs) {
    $robocopyArgs += '/XD'
    $robocopyArgs += $d
}
$robocopyArgs += '/XF'
$robocopyArgs += @('*.log', '.env', '__*-markup.mjs', '*.backup.json')

Write-Host '[1/4] Copy source (bo qua node_modules, .git, .next*, cache test)...'
$null = & robocopy @robocopyArgs
if ($LASTEXITCODE -gt 7) { throw "Robocopy that bai (exit $LASTEXITCODE)" }

$readmeLines = @(
    'HUONG DAN CAI TREN MAY MOI',
    '==========================',
    '',
    "1. Giai nen thu muc nay (vi du: C:\Tools\$projectName)",
    '2. Cai Node.js LTS (https://nodejs.org) neu chua co',
    '3. Mo thu muc goc, chay: setup.bat',
    '4. Copy file backend/.env tu may cu (API key / cau hinh Sheet)',
    '   Neu chua co: sua backend/.env sau khi setup (tu .env.example)',
    '5. Chay: start.bat',
    '6. Mo trinh duyet: http://localhost:3001',
    '',
    'LUU Y:',
    '- Goi nay KHONG co node_modules. setup.bat se tu cai.',
    '- Goi nay KHONG co backend/.env (bao mat). Copy tay tu may cu.',
    '- Du lieu Sheet tu dong sync neu DALAT_AUTO_SYNC_SHEET=true va co mang.',
    '',
    "Tao luc: $timestamp"
)
Set-Content -Path (Join-Path $staging 'HUONG_DAN_MAY_MOI.txt') -Value ($readmeLines -join [Environment]::NewLine) -Encoding UTF8

Write-Host '[2/4] Tao file huong dan HUONG_DAN_MAY_MOI.txt'
Write-Host '[3/4] Nen thanh ZIP...'
if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path $staging -DestinationPath $outZip -CompressionLevel Optimal

Write-Host '[4/4] Don temp...'
Remove-Item $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue

$sizeMB = [math]::Round((Get-Item $outZip).Length / 1MB, 1)
Write-Host ''
Write-Host '=============================================================='
Write-Host '  XONG!'
Write-Host "  File: $outZip"
Write-Host "  Dung luong: $sizeMB MB"
Write-Host '=============================================================='
Write-Host ''
Write-Host 'Tren may moi: giai nen -> setup.bat -> copy backend/.env -> start.bat'
