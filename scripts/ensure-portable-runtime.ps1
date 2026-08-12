param(
    [switch]$ForceInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRuntimeRoot = Join-Path $env:LOCALAPPDATA 'DalatTikTokCarouselTool'
$configRoot = Join-Path $localRuntimeRoot 'config'

# Next.js/Webpack không xử lý ổn junction node_modules trỏ sang ổ đĩa khác
# (ví dụ source ở D: nhưng dependencies ở C:\Users\...\AppData). Luôn đặt kho
# dependencies trên cùng ổ với source để đường dẫn module không bị biến thành
# "./C:/Users/..." và gây HTTP 500 trên máy khác.
$projectDriveRoot = [IO.Path]::GetPathRoot($projectRoot)
if ([string]::IsNullOrWhiteSpace($projectDriveRoot)) {
    throw "Khong xac dinh duoc o dia cua tool: $projectRoot"
}
$localAppDriveRoot = [IO.Path]::GetPathRoot($env:LOCALAPPDATA)
$runtimeRoot = if ($projectDriveRoot.Equals($localAppDriveRoot, [StringComparison]::OrdinalIgnoreCase)) {
    $localRuntimeRoot
} else {
    [IO.Path]::Combine($projectDriveRoot, 'DalatTikTokCarouselToolRuntime')
}
$dependencyRoot = Join-Path $runtimeRoot 'dependencies'

function Get-DependencySignature {
    $dependencySpecs = foreach ($name in @('backend', 'frontend')) {
        $package = Get-Content -LiteralPath (Join-Path $projectRoot "$name\package.json") -Raw | ConvertFrom-Json
        # Windows PowerShell 5.1 không ConvertFrom-Json được package-lock có
        # property tên rỗng (packages[""]). Băm trực tiếp lockfile để tương thích.
        $lockHash = (Get-FileHash -LiteralPath (Join-Path $projectRoot "$name\package-lock.json") -Algorithm SHA256).Hash
        [ordered]@{
            name = $name
            dependencies = $package.dependencies
            devDependencies = $package.devDependencies
            optionalDependencies = $package.optionalDependencies
            overrides = $package.overrides
            lockHash = $lockHash
        } | ConvertTo-Json -Depth 20 -Compress
    }
    # Không đưa version ứng dụng vào chữ ký. Bản mới chỉ đổi VERSION nhưng giữ
    # nguyên dependencies phải tái sử dụng kho cũ, không npm ci lại.
    $hashText = $dependencySpecs -join '|'
    $bytes = [Text.Encoding]::UTF8.GetBytes($hashText)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').Substring(0, 16).ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Test-LocalDependencies {
    $backendModules = Join-Path $projectRoot 'backend\node_modules'
    $frontendModules = Join-Path $projectRoot 'frontend\node_modules'
    if (-not (Test-Path -LiteralPath (Join-Path $backendModules 'typescript'))) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $frontendModules 'next'))) { return $false }

    foreach ($modulesPath in @($backendModules, $frontendModules)) {
        $item = Get-Item -LiteralPath $modulesPath -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
            continue
        }
        $target = @($item.Target)[0]
        if ([string]::IsNullOrWhiteSpace($target)) { return $false }
        $targetDrive = [IO.Path]::GetPathRoot([string]$target)
        if (-not $targetDrive.Equals($projectDriveRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "> Phat hien node_modules dang tro sang o dia khac: $target"
            return $false
        }
    }
    return $true
}

function Install-SharedProjectDependencies([string]$name, [string]$sharedVersionRoot) {
    $source = Join-Path $projectRoot $name
    $target = Join-Path $sharedVersionRoot $name
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'package.json') -Destination $target -Force
    Copy-Item -LiteralPath (Join-Path $source 'package-lock.json') -Destination $target -Force
    Write-Host "  Cai thu vien dung chung cho $name (chi can mot lan)..."
    Push-Location $target
    try {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci $name that bai (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

function Connect-SharedNodeModules([string]$name, [string]$sharedVersionRoot) {
    $localModules = Join-Path $projectRoot "$name\node_modules"
    $sharedModules = Join-Path $sharedVersionRoot "$name\node_modules"
    if (Test-Path -LiteralPath $localModules) {
        $localItem = Get-Item -LiteralPath $localModules -Force
        if (($localItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Remove-Item -LiteralPath $localModules -Force
        } else {
            Remove-Item -LiteralPath $localModules -Recurse -Force
        }
    }
    New-Item -ItemType Junction -Path $localModules -Target $sharedModules | Out-Null
}

function Ensure-NodeJs {
    if ((Get-Command node.exe -ErrorAction SilentlyContinue) -and (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        return
    }
    Write-Host '> Chua co Node.js/npm. Dang tim Windows Package Manager (winget)...'
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'Chua cai Node.js va khong co winget. Hay cai Node.js LTS mot lan tu https://nodejs.org roi chay lai.'
    }
    Write-Host '> Dang tu dong cai Node.js LTS. Vui long cho...'
    & winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw 'Winget khong cai duoc Node.js LTS. Kiem tra mang hoac quyen cai dat.'
    }
    $env:PATH = "$env:ProgramFiles\nodejs;$env:PATH"
    if (-not ((Get-Command node.exe -ErrorAction SilentlyContinue) -and (Get-Command npm.cmd -ErrorAction SilentlyContinue))) {
        throw 'Da cai Node.js nhung cua so nay chua nhan PATH moi. Hay dong cua so nay va mo lai start.bat.'
    }
    Write-Host '> Da cai Node.js LTS thanh cong.'
}

Ensure-NodeJs

New-Item -ItemType Directory -Path $dependencyRoot -Force | Out-Null
New-Item -ItemType Directory -Path $configRoot -Force | Out-Null
Write-Host "> Kho dependencies cung o dia voi tool: $dependencyRoot"

$localEnv = Join-Path $projectRoot 'backend\.env'
$sharedEnv = Join-Path $configRoot 'backend.env'
if (Test-Path -LiteralPath $localEnv) {
    Copy-Item -LiteralPath $localEnv -Destination $sharedEnv -Force
} elseif (Test-Path -LiteralPath $sharedEnv) {
    Copy-Item -LiteralPath $sharedEnv -Destination $localEnv -Force
    Write-Host '> Da khoi phuc backend\.env tu cau hinh dung chung cua may.'
} else {
    Copy-Item -LiteralPath (Join-Path $projectRoot 'backend\.env.example') -Destination $localEnv -Force
    Copy-Item -LiteralPath $localEnv -Destination $sharedEnv -Force
    Write-Host '> Da tao backend\.env. Hay cap nhat API key neu day la lan chay dau tien.'
}

$envText = Get-Content -LiteralPath $localEnv -Raw
if ($envText -notmatch '(?m)^DALAT_AUTO_SYNC_SHEET=') {
    Add-Content -LiteralPath $localEnv -Value 'DALAT_AUTO_SYNC_SHEET=false'
}
if ($envText -notmatch '(?m)^DALAT_SESSION_STICKY_DATASET=') {
    Add-Content -LiteralPath $localEnv -Value 'DALAT_SESSION_STICKY_DATASET=true'
}
Copy-Item -LiteralPath $localEnv -Destination $sharedEnv -Force

function Set-EnvValue([string]$path, [string]$name, [string]$value) {
    $text = Get-Content -LiteralPath $path -Raw
    $pattern = "(?m)^$name=.*$"
    if ($text -match $pattern) {
        $text = $text -replace $pattern, "$name=$value"
    } else {
        if ($text.Length -gt 0 -and $text -notmatch "[\r\n]$") { $text += [Environment]::NewLine }
        $text += "$name=$value" + [Environment]::NewLine
    }
    Set-Content -LiteralPath $path -Value $text -NoNewline -Encoding UTF8
}

function Strip-ApiKeyNamePrefix([string]$value) {
    while ($value -match '^(?i)DEEPSEEK_API_KEY=') {
        $value = $value -replace '^(?i)DEEPSEEK_API_KEY=', ''
    }
    return $value.Trim()
}

function Test-DeepSeekApiKey([string]$key) {
    try {
        $resp = Invoke-WebRequest -Uri 'https://api.deepseek.com/v1/models' -Headers @{ Authorization = "Bearer $key" } -UseBasicParsing -TimeoutSec 15
        if ($resp.StatusCode -eq 200) { return $true }
        return $false
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 401) { return $false }
        return $null
    }
}

function Ensure-DeepSeekApiKey([string]$envPath) {
    $text = Get-Content -LiteralPath $envPath -Raw
    $lineMatch = [regex]::Match($text, '(?m)^DEEPSEEK_API_KEY=(.*)$')
    $current = if ($lineMatch.Success) { $lineMatch.Groups[1].Value.Trim() } else { '' }
    $fixed = Strip-ApiKeyNamePrefix $current

    if ($fixed -ne $current) {
        Write-Host '> Phat hien DEEPSEEK_API_KEY bi dan lap ten bien, da tu sua lai gia tri.'
        Set-EnvValue $envPath 'DEEPSEEK_API_KEY' $fixed
        $current = $fixed
    }

    $isPlaceholder = [string]::IsNullOrWhiteSpace($current) -or $current -eq 'sk-your-deepseek-api-key-here' -or ($current -notmatch '^sk-')
    if (-not $isPlaceholder) {
        Write-Host '> Da co DEEPSEEK_API_KEY trong backend\.env, bo qua nhap lai.'
        return
    }

    Write-Host ''
    Write-Host '> Chua co DEEPSEEK_API_KEY hop le trong backend\.env.'
    Write-Host '> Lay key tai: https://platform.deepseek.com/api_keys'
    while ($true) {
        $inputKey = Read-Host '> Dan DEEPSEEK_API_KEY vao day (chi dan gia tri key, khong dan ten bien)'
        $inputKey = Strip-ApiKeyNamePrefix $inputKey
        if ([string]::IsNullOrWhiteSpace($inputKey) -or $inputKey -eq 'sk-your-deepseek-api-key-here') {
            Write-Host '> Key rong hoac chua thay doi, vui long dan lai.'
            continue
        }
        Write-Host '> Dang kiem tra key voi DeepSeek...'
        $ok = Test-DeepSeekApiKey $inputKey
        if ($ok -eq $false) {
            Write-Host '> Key bi DeepSeek tu choi (khong hop le). Vui long kiem tra lai va dan key khac.'
            continue
        }
        if ($null -eq $ok) {
            Write-Host '> Khong ket noi duoc DeepSeek de kiem tra (co the do mang). Van luu key nay.'
        } else {
            Write-Host '> Key hop le!'
        }
        Set-EnvValue $envPath 'DEEPSEEK_API_KEY' $inputKey
        break
    }
}

Ensure-DeepSeekApiKey $localEnv
Copy-Item -LiteralPath $localEnv -Destination $sharedEnv -Force
Write-Host '> Cau hinh backend\.env va DEEPSEEK_API_KEY da san sang.'

$signature = Get-DependencySignature
if ((Test-LocalDependencies) -and -not $ForceInstall) {
    Write-Host "> Thu vien trong thu muc hien tai da san sang; bo qua cai dat ($signature)."
    Write-Host '> THIET LAP HOAN TAT. Dang khoi dong tool...'
    exit 0
}

$sharedVersionRoot = Join-Path $dependencyRoot $signature
$readyMarker = Join-Path $sharedVersionRoot '.ready'

if (-not (Test-Path -LiteralPath $readyMarker) -or $ForceInstall) {
    if (Test-Path -LiteralPath $sharedVersionRoot) {
        Remove-Item -LiteralPath $sharedVersionRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $sharedVersionRoot -Force | Out-Null
    Install-SharedProjectDependencies 'backend' $sharedVersionRoot
    Install-SharedProjectDependencies 'frontend' $sharedVersionRoot
    Set-Content -LiteralPath $readyMarker -Value $signature -Encoding ASCII
} else {
    Write-Host "> Tai su dung thu vien da cai tu phien ban truoc ($signature)."
}

Connect-SharedNodeModules 'backend' $sharedVersionRoot
Connect-SharedNodeModules 'frontend' $sharedVersionRoot
Write-Host '> Moi truong san sang. Cac ban cung dependencies chi can chay start.bat.'
Write-Host '> THIET LAP HOAN TAT. Dang khoi dong tool...'
