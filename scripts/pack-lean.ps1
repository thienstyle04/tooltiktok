# Tao file nen portable de chuyen sang may khac.
# Chay: powershell -ExecutionPolicy Bypass -File scripts/pack-lean.ps1
# Output: Desktop\dalat-tiktok-carousel-tool-portable-YYYYMMDD-HHMM.zip

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$projectName = Split-Path -Leaf $root
$timestamp = Get-Date -Format 'yyyyMMdd-HHmm'
$desktop = [Environment]::GetFolderPath('Desktop')
$outZip = Join-Path $desktop "$projectName-portable-$timestamp.zip"
$stagingRoot = Join-Path $env:TEMP "dalat-pack-$timestamp"
$staging = Join-Path $stagingRoot $projectName
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$stagingRoot = [IO.Path]::GetFullPath($stagingRoot)
$staging = [IO.Path]::GetFullPath($staging)
$tempPrefix = $tempBase + [IO.Path]::DirectorySeparatorChar
if (-not $stagingRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $stagingRoot) -notlike 'dalat-pack-*') {
    throw "Thu muc staging khong an toan: $stagingRoot"
}

Write-Host '=============================================================='
Write-Host "  PACK PORTABLE - $projectName"
Write-Host '=============================================================='
Write-Host "Nguon : $root"
Write-Host "Dich  : $outZip"
Write-Host ''

$outDir = Split-Path -Parent $outZip
Write-Host 'Giu nguyen cac file portable cu tren Desktop.'
Write-Host ''

$excludeDirs = @(
    'node_modules',
    '.git',
    '.claude',
    '.cursor',
    '.next',
    'export-quality-test-output',
    'drive-file-cache',
    'drive-file-cache-sim-othermachine',
    '.codex',
    '.codex-dev-logs',
    '.codex-runtime',
    '.test-runtime',
    '.test-runtime-e2e',
    '.omx',
    'agent-transcripts',
    'mcps'
)

# Loại mọi thư mục cache ảnh Drive (kể cả bản giả lập máy khác)
$extraCacheDirs = Get-ChildItem -Path $root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'drive-file-cache*' } |
    ForEach-Object { $_.Name }
$excludeDirs += $extraCacheDirs
$excludeDirs = @($excludeDirs | Select-Object -Unique)

$frontendNext = Get-ChildItem -Path (Join-Path $root 'frontend') -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '.next*' } |
    ForEach-Object { $_.Name }
$excludeDirs += $frontendNext
$excludeDirs = @($excludeDirs | Select-Object -Unique)

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
$robocopyArgs += @(
    '*.log',
    'dev-log*.txt',
    '.env',
    '__*-markup.mjs',
    '*.backup.json',
    # Workbook runtime là dữ liệu theo máy/người dùng. Bản mặc định đã nằm trong
    # backend/resources/workbooks nên không mang cache XLSX cũ sang máy khác.
    'workbook-cache.*.xlsx',
    'workbook-source-meta.*.json',
    # Metadata nay chi dung cho may da probe Drive. Portable khong mang file
    # cache anh that, nen may moi phai tu xac minh lai thay vi ke thua ket qua cu.
    'drive-access-cache*.json'
)

Write-Host '[1/4] Copy source (bo qua node_modules, .git, .next*, cache anh, test output)...'
$null = & robocopy @robocopyArgs
if ($LASTEXITCODE -gt 7) { throw "Robocopy that bai (exit $LASTEXITCODE)" }

$requiredWorkbooks = @(
    (Join-Path $staging 'backend\resources\workbooks\dalat.xlsx'),
    (Join-Path $staging 'backend\resources\workbooks\greenland.xlsx')
)
foreach ($workbook in $requiredWorkbooks) {
    if (-not (Test-Path -LiteralPath $workbook -PathType Leaf)) {
        throw "Thieu workbook XLSX mac dinh trong goi portable: $workbook"
    }
}

# An toan: xoa cache anh / Next build / test output neu van lot vao staging
Get-ChildItem -Path $staging -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -like 'drive-file-cache*' -or
        $_.Name -eq 'export-quality-test-output' -or
        $_.Name -like '.next*' -or
        $_.Name -eq 'node_modules' -or
        $_.Name -eq '.git'
    } |
    ForEach-Object {
        $stagingChild = [IO.Path]::GetFullPath($_.FullName)
        $stagingPrefix = $staging.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        if (-not $stagingChild.StartsWith($stagingPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Tu choi xoa thu muc ngoai staging: $stagingChild"
        }
        Write-Host "  Go staging: $($stagingChild.Substring($staging.Length))"
        Remove-Item -LiteralPath $stagingChild -Recurse -Force -ErrorAction SilentlyContinue
    }

$readmeLines = @(
    'HUONG DAN CAI TREN MAY MOI',
    '==========================',
    '',
    "1. Giai nen thu muc nay (vi du: C:\Tools\$projectName)",
    '2. Cai Node.js LTS (https://nodejs.org) neu chua co',
    '3. Chay thang: start.bat',
    '   Tool tu dung lai thu vien va backend/.env cua phien ban truoc tren cung may.',
    '4. Chi can mang/cai dependencies mot lan neu package-lock da thay doi.',
    '5. Mo trinh duyet: http://localhost:3001',
    '',
    'LUU Y VE ANH:',
    '- Du lieu dia diem mac dinh doc tu XLSX dong kem cho Da Lat va Green Land.',
    '- Anh dia diem lay tu Google Drive luc chay (khong dong san trong zip).',
    '- Khi start.bat, backend TU TAO cache anh vao backend/data/drive-file-cache (chay nen).',
    '- May moi can mang lan dau de tai anh; lan sau dung lai cache local.',
    '- Tat tu-warm: DALAT_AUTO_WARM_DRIVE_CACHE=0 trong backend/.env',
    '- Neu anh bi xam: kiem tra mang toi drive.google.com, copy dung backend/.env, khoi dong lai tool.',
    '',
    'LUU Y KHAC:',
    '- Goi nay KHONG co node_modules. start.bat tu tao/tai su dung kho thu vien tren cung o dia voi tool.',
    '- Goi nay KHONG co backend/.env. start.bat tu khoi phuc cau hinh da luu tren cung may.',
    '- XLSX la nguon chinh. Google Sheet chi la du phong va chi tai khi bam "Tai moi tu Google Sheet".',
    '- Co the nhap hoac thay file XLSX trong muc Cai dat ma khong can sua Google Sheet.',
    '',
    "Tao luc: $timestamp"
)
Set-Content -Path (Join-Path $staging 'HUONG_DAN_MAY_MOI.txt') -Value ($readmeLines -join [Environment]::NewLine) -Encoding UTF8

Write-Host '[2/4] Tao file huong dan HUONG_DAN_MAY_MOI.txt'
Write-Host '[2b/4] Bo qua toan bo drive-file-cache* (may moi tu tao khi chay)'

# Uu tien 7-Zip neu co (nho hon Compress-Archive)
Write-Host '[3/4] Nen thanh ZIP...'
if (Test-Path $outZip) { Remove-Item $outZip -Force }
$sevenZip = @(
    "${env:ProgramFiles}\7-Zip\7z.exe",
    "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($sevenZip) {
    Write-Host "  Dung 7-Zip: $sevenZip"
    & $sevenZip a -tzip -mx=9 $outZip $staging | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7-Zip that bai (exit $LASTEXITCODE)" }
} else {
    Write-Host '  Dung Compress-Archive (chua cai 7-Zip)'
    Compress-Archive -Path $staging -DestinationPath $outZip -CompressionLevel Optimal
}

Write-Host '[4/4] Don temp...'
if (Test-Path -LiteralPath $stagingRoot) {
    $resolvedStagingRoot = (Resolve-Path -LiteralPath $stagingRoot).Path
    if (-not $resolvedStagingRoot.Equals($stagingRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not $resolvedStagingRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Tu choi xoa thu muc temp khong hop le: $resolvedStagingRoot"
    }
    Remove-Item -LiteralPath $resolvedStagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$sizeMB = [math]::Round((Get-Item $outZip).Length / 1MB, 1)
Write-Host ''
Write-Host '=============================================================='
Write-Host '  XONG!'
Write-Host "  File: $outZip"
Write-Host "  Dung luong: $sizeMB MB"
Write-Host '  Cache anh: may moi tu tao khi start'
Write-Host '=============================================================='
Write-Host ''
Write-Host 'Tren may da tung cai: giai nen -> start.bat (khong can setup lai)'
