# Thay the boi scripts/pack-migration.cjs: goi cu bo du lieu nguoi dung, mang ban
# 0.9.02 (shared\current.json + releases) va chep cache Color Edit hai lan.
# Giu file nay de lenh cu van chay: chuyen tiep sang goi chuyen may moi.
# Chay: powershell -ExecutionPolicy Bypass -File scripts/pack-lean.ps1 [tham so cua pack-migration]
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'pack-migration.cjs') @args
exit $LASTEXITCODE
