# Cho start.bat: doi frontend san sang roi mo Chrome (hoac trinh duyet mac dinh).
$ErrorActionPreference = 'SilentlyContinue'
$displayUrlHost = 'localhost'
$probeHost = '127.0.0.1'
$ports = 3001..3005
$maxAttemptsPerPort = 90
$sleepSeconds = 2

function Find-ChromePath {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  return $null
}

function Open-ToolUrl([string]$Url) {
  $chrome = Find-ChromePath
  if ($chrome) {
    Start-Process -FilePath $chrome -ArgumentList $Url
    return 'chrome'
  }
  Start-Process $Url
  return 'default'
}

foreach ($port in $ports) {
  $url = "http://${displayUrlHost}:$port/"
  for ($attempt = 0; $attempt -lt $maxAttemptsPerPort; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://${probeHost}:$port/" -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $openedWith = Open-ToolUrl $url
        Write-Host "[start] Da mo trinh duyet ($openedWith): $url"
        exit 0
      }
    } catch {
      Start-Sleep -Seconds $sleepSeconds
    }
  }
}

Write-Host "[start] Khong mo duoc trinh duyet tu dong. Hay mo thu cong: http://localhost:3001/"
