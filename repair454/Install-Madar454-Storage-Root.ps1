# Madar v4.49-v4.52 -> v4.54 one-click storage-root update.
# Exact baseline hashes, program-only backup, local health/path verification, rollback.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$targetVersion = 'v4.54'
$targetBuild = 'v4.54 14050824 SU GPT-6 PORTABLE_STORAGE_ROOT_D'
$healthURL = 'http://127.0.0.1:8765/api/health'
$script:pythonExe = $null
$script:base = $null
$script:app = $null
$script:launcher = $null
$script:backup = $null
$script:originalFiles = @{}
$script:changed = $false
$script:hadServer = $false
$script:oldVersion = $null
$result = 'FAIL'
$reason = 'PRECHECK'
$healthStatus = 'NOT_TESTED'
$storageStatus = 'NOT_TESTED'
$assetsStatus = 'NOT_TESTED'
$pdfModuleStatus = 'NOT_TESTED'
$pdfModuleAction = 'NOT_TESTED'
$reportStatus = 'NOT_WRITTEN'

$new = @{
 'BUILD.txt'='__HASH_BUILD__'
 'madar_launcher.py'='__HASH_LAUNCHER__'
 'vault_server.py'='__HASH_VAULT__'
 'madar_ai_server.py'='__HASH_SERVER__'
 'local_pdf.py'='__HASH_LOCAL_PDF__'
}
$oldByVersion = @{
 'v4.49'=@{
  'BUILD.txt'='409d259359fec8d790a7f1839c78adcef897256ac7793af513f9902acfc69648'
  'madar_launcher.py'='108484e2edddfb79932dcd6212e885f3a37169d44ad9bd2d55fa19e120e5dbcd'
  'vault_server.py'='4d4e1ba4e0b90fbca5013746e05704d8484fa1d2841b8b70884f5eb435742199'
  'madar_ai_server.py'='27cdf0b1382de8ef3ddf2a24c481baa92f41574f881ea1d6e7de2b3a5c845160'
 }
 'v4.50'=@{
  'BUILD.txt'='438ab6d3127d6c96ae9fd49c9434700e2c08d02733f1cef2bbca55bf325c70ef'
  'madar_launcher.py'='108484e2edddfb79932dcd6212e885f3a37169d44ad9bd2d55fa19e120e5dbcd'
  'vault_server.py'='4d4e1ba4e0b90fbca5013746e05704d8484fa1d2841b8b70884f5eb435742199'
  'madar_ai_server.py'='557aa84265ff0b4a8d7dbc73a9568d89567f9fe839e3aa54ad52410c00f8cc32'
 }
 'v4.51'=@{
  'BUILD.txt'='414f2e94bb86ca3a5139aa969894e10a91279ff86a6407e8a63427d28139a1d2'
  'madar_launcher.py'='108484e2edddfb79932dcd6212e885f3a37169d44ad9bd2d55fa19e120e5dbcd'
  'vault_server.py'='4d4e1ba4e0b90fbca5013746e05704d8484fa1d2841b8b70884f5eb435742199'
  'madar_ai_server.py'='be0a109abc4a06c38534105625e2b99d7144661412a51d8dc2c06bc6831a3e38'
 }
 'v4.52'=@{
  'BUILD.txt'='d0db42a734ee3b73f97aa0338424610f1b883fd74948a75e0851847a576f6f55'
  'madar_launcher.py'='108484e2edddfb79932dcd6212e885f3a37169d44ad9bd2d55fa19e120e5dbcd'
  'vault_server.py'='4d4e1ba4e0b90fbca5013746e05704d8484fa1d2841b8b70884f5eb435742199'
  'madar_ai_server.py'='cc2ad43fa436b59927c5bfd9f6ea8652ddbcf9157169a1a0d66d9f76bf6a1ad5'
 }

}

$legacyPdfHashes = @{
 'v4.51'='4938d67ab359a3e587e0db7dda0e03afd7a045bf90ffbadfa0d914b05236b7f0'
 'v4.52'='4938d67ab359a3e587e0db7dda0e03afd7a045bf90ffbadfa0d914b05236b7f0'
}

function Get-RootFromLauncher([string]$path) {
 if ([string]::IsNullOrWhiteSpace($path)) { return $null }
 try {
  $full = [IO.Path]::GetFullPath($path.Trim('"'))
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return $null }
  $appDir = Split-Path -Parent $full
  if ((Split-Path -Leaf $appDir) -ine 'App') { return $null }
  $candidate = Split-Path -Parent $appDir
  if (Test-Path -LiteralPath (Join-Path $candidate 'App\madar_launcher.py') -PathType Leaf) {
   return [IO.Path]::GetFullPath($candidate)
  }
 } catch {}
 return $null
}

function Resolve-MadarInstall {
 if ($env:MADAR_HOME) {
  $configured = [IO.Path]::GetFullPath([string]$env:MADAR_HOME)
  if (Test-Path -LiteralPath (Join-Path $configured 'App\madar_launcher.py') -PathType Leaf) {
   return [pscustomobject]@{ Base=$configured; Python=$null }
  }
 }
 $roots = @()
 $python = $null
 try {
  foreach ($proc in @(Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'")) {
   $cmd = [string]$proc.CommandLine
   if (-not $cmd -or $cmd -notmatch '--server') { continue }
   $match = [regex]::Match($cmd,'(?i)"(?<launcher>[^"]*madar_launcher\.py)"')
   if (-not $match.Success) { continue }
   $root = Get-RootFromLauncher $match.Groups['launcher'].Value
   if ($root) {
    $roots += $root
    if (-not $python -and $proc.ExecutablePath) { $python = [string]$proc.ExecutablePath }
   }
  }
 } catch {}
 if ($roots.Count -eq 0) {
  $folders = @(
   [Environment]::GetFolderPath('DesktopDirectory'),
   [Environment]::GetFolderPath('Programs'),
   [Environment]::GetFolderPath('Startup'),
   (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
   (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Select-Object -Unique
  try {
   $wsh = New-Object -ComObject WScript.Shell
   foreach ($folder in $folders) {
    foreach ($name in @('Madar.lnk','Madar-Service.lnk')) {
     $link = Join-Path $folder $name
     if (-not (Test-Path -LiteralPath $link -PathType Leaf)) { continue }
     $shortcut = $wsh.CreateShortcut($link)
     $match = [regex]::Match([string]$shortcut.Arguments,'(?i)"(?<launcher>[^"]*madar_launcher\.py)"')
     if (-not $match.Success) { continue }
     $root = Get-RootFromLauncher $match.Groups['launcher'].Value
     if ($root) {
      $roots += $root
      if (-not $python -and $shortcut.TargetPath) { $python = [string]$shortcut.TargetPath }
     }
    }
   }
  } catch {}
 }
 $unique = @($roots | Select-Object -Unique)
 if ($unique.Count -eq 0) {
  throw 'Madar installation could not be located safely. Start Madar once or set MADAR_HOME, then run this one-click updater again. No files were changed.'
 }
 if ($unique.Count -gt 1) {
  throw 'More than one Madar installation was detected. Update stopped to avoid changing the wrong installation.'
 }
 return [pscustomobject]@{ Base=$unique[0]; Python=$python }
}

function Hash-File([string]$path) {
 return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Test-LegacyPdfModule {
 $path = Join-Path $script:app 'local_pdf.py'
 if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
  if ($script:oldVersion -in @('v4.49','v4.50')) { return 'CREATE' }
  throw "The known $($script:oldVersion) baseline is missing App/local_pdf.py."
 }
 Assert-NotReparse $path
 $digest = Hash-File $path
 if ($digest -eq $new['local_pdf.py']) { return 'ALREADY_TARGET' }
 if ($legacyPdfHashes.ContainsKey($script:oldVersion)) {
  if ($digest -ne $legacyPdfHashes[$script:oldVersion]) {
   throw "The installed local_pdf.py differs from the known $($script:oldVersion) baseline. No replacement was made."
  }
  return 'REPLACE'
 }
 $source = Get-Content -LiteralPath $path -Raw -Encoding UTF8
 $required = @(
  '(?m)^\s*def\s+_root\s*\(',
  '(?m)^\s*def\s+valid_name\s*\(',
  '(?m)^\s*def\s+list_books\s*\(',
  '(?m)^\s*def\s+read_book\s*\(',
  '(?m)^\s*def\s+import_book\s*\('
 )
 foreach ($pattern in $required) {
  if ($source -notmatch $pattern) {
   throw "The $($script:oldVersion) PDF module is not a recognized baseline; no replacement was made."
  }
 }
 if ($source -match '(?m)^\s*def\s+delete_book\s*\(') {
  throw 'The existing PDF module contains an unrecognized delete_book implementation; no replacement was made.'
 }
 return 'REPLACE'
}
function Current-Health {
 try { return Invoke-RestMethod -Uri $healthURL -TimeoutSec 2 } catch { return $null }
}
function Get-MadarProcesses {
 return @(Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine -match ([regex]::Escape($script:launcher)) -and $_.CommandLine -match '--server'
 })
}
function Test-PortBusy {
 $client = New-Object Net.Sockets.TcpClient
 try {
  $attempt = $client.BeginConnect('127.0.0.1',8765,$null,$null)
  return ($attempt.AsyncWaitHandle.WaitOne(400) -and $client.Connected)
 } finally { $client.Close() }
}
function Assert-NotReparse([string]$path) {
 if (Test-Path -LiteralPath $path) {
  $item = Get-Item -LiteralPath $path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
   throw "A managed storage folder is a junction/symlink; update stopped: $($item.Name)"
  }
 }
}
function Start-Madar {
 if (-not $script:pythonExe -or -not (Test-Path -LiteralPath $script:pythonExe -PathType Leaf)) {
  throw 'A working Python runtime was not identified; previous program files remain available.'
 }
 $env:MADAR_HOME = $script:base
 $env:MADAR_DATA_DIR = Join-Path $script:base 'Data'
 $env:MADAR_PORT = '8765'
 $env:PYTHONIOENCODING = 'utf-8:backslashreplace'
 Start-Process -FilePath $script:pythonExe -ArgumentList ('"' + $script:launcher + '" --server') -WorkingDirectory $script:app -WindowStyle Hidden
}
function Wait-ForV454 {
 for ($i=0; $i -lt 100; $i++) {
  $h = Current-Health
  if ($h -and $h.applicationId -eq 'madar-local' -and $h.version -eq $targetVersion -and
      $h.pdfReaderAssetsReady -eq $true -and $h.learningDashboardAssetsReady -eq $true -and
      $h.bookDeletionReady -eq $true) { return $h }
  Start-Sleep -Milliseconds 300
 }
 throw 'The v4.54 local health checks did not pass.'
}
function Test-StorageLayout {
 $expectedData = [IO.Path]::GetFullPath((Join-Path $script:base 'Data')).TrimEnd('\')
 $expectedBooks = [IO.Path]::GetFullPath((Join-Path $script:base 'Books')).TrimEnd('\')
 $vault = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/vault/list' -TimeoutSec 8
 $books = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/local-pdf/list' -TimeoutSec 8
 $actualData = [IO.Path]::GetFullPath([string]$vault.dataFolder).TrimEnd('\')
 $actualBooks = [IO.Path]::GetFullPath([string]$books.folder).TrimEnd('\')
 if (-not [string]::Equals($actualData,$expectedData,[StringComparison]::OrdinalIgnoreCase)) {
  throw 'The active vault is not using the installation Data folder.'
 }
 if (-not [string]::Equals($actualBooks,$expectedBooks,[StringComparison]::OrdinalIgnoreCase)) {
  throw 'The managed PDF library is not using the installation Books folder.'
 }
 return 'PASS'
}
function Test-StaticAssets {
 foreach ($file in @('pdf_simple.js','pdf_simple.css','dashboard_v452.js','dashboard_v452.css')) {
  $response = Invoke-WebRequest -Uri ('http://127.0.0.1:8765/' + $file) -UseBasicParsing -TimeoutSec 8
  if ($response.StatusCode -ne 200 -or $response.Content.Length -lt 100) {
   throw "A required local asset did not load: $file"
  }
 }
 return 'PASS'
}

try {
 Write-Host 'MADAR v4.54 | portable storage root + one-click update' -ForegroundColor Cyan
 $reason = 'ROOT_DISCOVERY'
 $install = Resolve-MadarInstall
 $script:base = [IO.Path]::GetFullPath([string]$install.Base)
 $script:app = Join-Path $script:base 'App'
 $script:launcher = Join-Path $script:app 'madar_launcher.py'
 if ($install.Python) { $script:pythonExe = $install.Python }
 if (-not (Test-Path -LiteralPath $script:launcher -PathType Leaf)) {
  throw 'The resolved Madar App folder is incomplete.'
 }
 $buildPath = Join-Path $script:app 'BUILD.txt'
 if (-not (Test-Path -LiteralPath $buildPath -PathType Leaf)) { throw 'BUILD.txt is missing.' }
 $build = (Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8).Trim()
 if ($build -notmatch '^(v4\.\d+)\b') { throw 'The installed Madar build identity is not recognized.' }
 $script:oldVersion = $Matches[1]
 $reason = 'PACKAGE_INTEGRITY'
 foreach ($name in @($new.Keys)) {
  $source = Join-Path $PSScriptRoot ('patch\' + $name)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Hash-File $source) -ne $new[$name]) {
   throw "The embedded v4.54 payload failed its file-integrity check: $name"
  }
 }
 $reason = 'INSTALLED_INTEGRITY'
 if ($script:oldVersion -eq $targetVersion) {
  foreach ($name in @($new.Keys)) {
   $target = Join-Path $script:app $name
   if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Hash-File $target) -ne $new[$name]) {
    throw "The installed v4.54 file is not the exact verified build: $name"
   }
  }
 } else {
  if (-not $oldByVersion.ContainsKey($script:oldVersion)) {
   throw "This updater accepts exact v4.49-v4.52 installations. Detected $($script:oldVersion); no files were changed."
  }
  foreach ($name in @($oldByVersion[$script:oldVersion].Keys)) {
   $target = Join-Path $script:app $name
   if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Hash-File $target) -ne $oldByVersion[$script:oldVersion][$name]) {
    throw "A protected program file differs from the known $($script:oldVersion) baseline: $name. No replacement was made."
   }
  }
 }
 $reason = 'PDF_MODULE_PREFLIGHT'
 if ($script:oldVersion -eq $targetVersion) {
  $pdfModuleAction = 'ALREADY_TARGET'
 } else {
  $pdfModuleAction = Test-LegacyPdfModule
 }
 $pdfModuleStatus = 'PASS'
 $reason = 'STORAGE_PREFLIGHT'
 foreach ($folder in @('Data','Books','Backups','Reports','Logs')) {
  $path = Join-Path $script:base $folder
  Assert-NotReparse $path
  if (-not (Test-Path -LiteralPath $path -PathType Container)) {
   New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
 }
 $dataFolder = Join-Path $script:base 'Data'
 $booksFolder = Join-Path $script:base 'Books'
 if ($env:MADAR_DATA_DIR) {
  $configuredData = [IO.Path]::GetFullPath([string]$env:MADAR_DATA_DIR)
  if (-not [string]::Equals($configuredData,[IO.Path]::GetFullPath($dataFolder),[StringComparison]::OrdinalIgnoreCase)) {
   throw 'A custom MADAR_DATA_DIR is configured outside the installation Data folder. Update stopped to avoid making existing records appear missing.'
  }
 }
 $health = Current-Health
 $running = @(Get-MadarProcesses)
 if ($running.Count -gt 1) { throw 'Multiple Madar server processes were found; update stopped.' }
 if ($health -and ($health.applicationId -ne 'madar-local' -or $health.version -ne $script:oldVersion)) {
  throw 'Port 8765 is serving a different or unknown Madar version.'
 }
 if ($running.Count -eq 1 -and -not $health) {
  throw 'The detected Madar server is not healthy enough to verify its current Data and Books paths. Restart Madar and retry.'
 }
 if ($health) {
  $reason = 'EXISTING_STORAGE_PATH_PREFLIGHT'
  $storageStatus = Test-StorageLayout
 }
 if ($running.Count -eq 0 -and $health) {
  throw 'The health endpoint is not owned by the detected Madar launcher; update stopped.'
 }
 if ($running.Count -eq 0 -and (Test-PortBusy)) {
  throw 'Port 8765 is occupied by an unverified service; no process was stopped.'
 }
 if ($running.Count -eq 1 -and $running[0].ExecutablePath) { $script:pythonExe = [string]$running[0].ExecutablePath }
 if (-not $script:pythonExe) {
  $pythonw = Get-Command 'pythonw.exe' -ErrorAction SilentlyContinue
  if ($pythonw) { $script:pythonExe = $pythonw.Source }
  else {
   $python = Get-Command 'python.exe' -ErrorAction SilentlyContinue
   if ($python) { $script:pythonExe = $python.Source }
  }
 }
 if (-not $script:pythonExe -or -not (Test-Path -LiteralPath $script:pythonExe -PathType Leaf)) {
  throw 'Python 3 was not found. No program files were changed.'
 }
 $script:hadServer = ($running.Count -eq 1)
 if ($script:oldVersion -ne $targetVersion) {
  $reason = 'PROGRAM_BACKUP'
  $script:backup = Join-Path (Join-Path $script:base 'Backups') ('Madar454-Before-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $script:backup -Force | Out-Null
  foreach ($name in @($new.Keys)) {
   $target = Join-Path $script:app $name
   $script:originalFiles[$name] = Test-Path -LiteralPath $target -PathType Leaf
   if ($script:originalFiles[$name]) {
    Copy-Item -LiteralPath $target -Destination (Join-Path $script:backup $name) -ErrorAction Stop
   }
  }
  $reason = 'SERVICE_STOP'
  if ($script:hadServer) {
   Stop-Process -Id $running[0].ProcessId -ErrorAction Stop
   for ($i=0; $i -lt 30; $i++) {
    if (-not (Get-Process -Id $running[0].ProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 150
   }
   if (Get-Process -Id $running[0].ProcessId -ErrorAction SilentlyContinue) {
    throw 'The Madar service did not stop cleanly; no application file was replaced.'
   }
  }
  $reason = 'ACTIVATION'
  $script:changed = $true
  foreach ($name in @($new.Keys)) {
   Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('patch\' + $name)) -Destination (Join-Path $script:app $name) -Force -ErrorAction Stop
  }
 }
 $reason = 'RUNTIME_HEALTH'
 if ($script:oldVersion -ne $targetVersion -or ($running.Count -eq 0 -and -not $health)) { Start-Madar }
 $verifiedHealth = Wait-ForV454
 $healthStatus = 'PASS'
 $reason = 'STORAGE_PATH_ACCEPTANCE'
 $storageStatus = Test-StorageLayout
 $reason = 'STATIC_ASSET_ACCEPTANCE'
 $assetsStatus = Test-StaticAssets
 $result = 'PASS'
 $reason = 'NONE'
 Write-Host 'PASS: v4.54 is running; Data and Books resolve under the detected installation root.' -ForegroundColor Green
 Start-Process 'http://127.0.0.1:8765/?v=454'
} catch {
 Write-Host ('Update stopped: ' + $_.Exception.Message) -ForegroundColor Red
 if ($script:changed -and $script:backup) {
  try {
   foreach ($proc in @(Get-MadarProcesses)) { Stop-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue }
   Start-Sleep -Milliseconds 350
   foreach ($name in @($new.Keys)) {
    $target = Join-Path $script:app $name
    if ($script:originalFiles.ContainsKey($name) -and $script:originalFiles[$name]) {
     Copy-Item -LiteralPath (Join-Path $script:backup $name) -Destination $target -Force -ErrorAction Stop
    } else {
     Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }
   }
   if ($script:hadServer) { Start-Madar }
   Write-Host 'The previous program files were restored from Backups.' -ForegroundColor Yellow
  } catch {
   Write-Host 'Automatic rollback did not fully complete; the verified program backup remains in Backups.' -ForegroundColor Red
  }
 }
} finally {
 if ($script:base) {
  try {
   $reportDir = Join-Path $script:base 'Reports'
   New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
   $report = Join-Path $reportDir 'Madar454-Storage-Root-SafeToShare.json'
   [pscustomobject]@{
    schema='madar.storage-root.update.v1'
    target=$targetVersion
    sourceVersion=$script:oldVersion
    result=$result
    failureCategory=$reason
    localHealth=$healthStatus
    storagePaths=$storageStatus
    staticAssets=$assetsStatus
    pdfModule=$pdfModuleStatus
    pdfModuleAction=$pdfModuleAction
    programFiles=@($new.Keys | Sort-Object)
    programBackupCreated=[bool]$script:backup
    learnerDataModified=$false
    managedBooksModified=$false
    automaticUpload=$false
    generatedAt=(Get-Date).ToString('o')
   } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $report -Encoding UTF8
   $reportStatus='PASS'
   Write-Host 'A privacy-safe report was saved locally in Reports; nothing was uploaded.' -ForegroundColor Gray
  } catch {
   $reportStatus='FAIL'
   Write-Host 'The local diagnostic report could not be saved.' -ForegroundColor Yellow
  }
 }
}
if ($result -eq 'PASS') { exit 0 }
exit 1
