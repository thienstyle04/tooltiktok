$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localEnv = Join-Path $projectRoot 'backend\.env'
$sharedEnv = Join-Path $env:LOCALAPPDATA 'DalatTikTokCarouselTool\config\backend.env'

Write-Host '=============================================================='
Write-Host 'KIEM TRA VA SUA CACHE API KEY (DEEPSEEK)'
Write-Host '=============================================================='
Write-Host ''

if (-not (Test-Path -LiteralPath $localEnv)) {
    Write-Host "[LOI] Khong tim thay $localEnv"
    Write-Host 'Hay chay start.bat truoc de tao file .env, roi dien API key vao.'
    exit 1
}

$envText = Get-Content -LiteralPath $localEnv -Raw
$match = [regex]::Match($envText, '(?m)^DEEPSEEK_API_KEY=(.*)$')
if (-not $match.Success) {
    Write-Host '[LOI] backend\.env khong co dong DEEPSEEK_API_KEY='
    exit 1
}
$key = $match.Groups[1].Value.Trim()

while ($key -match '^(?i)DEEPSEEK_API_KEY=') {
    $key = ($key -replace '^(?i)DEEPSEEK_API_KEY=', '').Trim()
    Write-Host '> Phat hien key bi dan lap ten bien (DEEPSEEK_API_KEY=DEEPSEEK_API_KEY=...), da tu cat lai.'
    $envText = $envText -replace '(?m)^DEEPSEEK_API_KEY=.*$', "DEEPSEEK_API_KEY=$key"
    Set-Content -LiteralPath $localEnv -Value $envText -NoNewline -Encoding UTF8
}

if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host '[LOI] DEEPSEEK_API_KEY dang de trong trong backend\.env'
    exit 1
}

$suffix = if ($key.Length -ge 4) { $key.Substring($key.Length - 4) } else { $key }
Write-Host "> Key trong backend\.env hien tai: do dai $($key.Length), 4 so cuoi: $suffix"

Write-Host ''
Write-Host '> Dang test key nay voi DeepSeek...'
try {
    $resp = Invoke-WebRequest -Uri 'https://api.deepseek.com/v1/models' -Headers @{ Authorization = "Bearer $key" } -UseBasicParsing
    Write-Host "> HTTP status: $($resp.StatusCode) -> Key HOP LE."
    $keyIsValid = $true
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "> HTTP status: $status -> Key KHONG HOP LE (bi tu choi boi DeepSeek)."
    $keyIsValid = $false
}

Write-Host ''
if (Test-Path -LiteralPath $sharedEnv) {
    Remove-Item -LiteralPath $sharedEnv -Force
    Write-Host "> Da xoa cache dung chung cu: $sharedEnv"
} else {
    Write-Host '> Khong co cache dung chung cu (khong can xoa).'
}

Write-Host ''
if ($keyIsValid) {
    Write-Host 'XONG. Key hien tai hop le va cache cu da duoc xoa.'
    Write-Host 'Chay start.bat de khoi dong tool - lan nay se dung dung key trong backend\.env.'
} else {
    Write-Host 'CHU Y: Key trong backend\.env hien tai KHONG hop le voi DeepSeek.'
    Write-Host 'Hay vao platform.deepseek.com tao key moi, dan vao backend\.env (dong DEEPSEEK_API_KEY=...),'
    Write-Host 'roi chay lai fix-api-key.bat nay de xac nhan lai truoc khi chay start.bat.'
}
Write-Host ''
