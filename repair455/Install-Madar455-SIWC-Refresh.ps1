# Madar v4.54 -> v4.55 Sign in with ChatGPT refresh-window repair.
# Replaces only three verified program files; Data and Books are read-only here.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$targetVersion = 'v4.55'
$base = 'D:\AWHQ CENTER\MADAR'
$app = Join-Path $base 'App'
$launcher = Join-Path $app 'madar_launcher.py'
$healthURL = 'http://127.0.0.1:8765/api/health'
$reportDir = Join-Path $base 'Reports'
$reportPath = Join-Path $reportDir 'Madar455-SIWC-Refresh-SafeToShare.json'
$files = @('BUILD.txt','chatgpt_plan.py','madar_ai_server.py')
$new = @{'BUILD.txt'='__HASH_BUILD__';'chatgpt_plan.py'='__HASH_CHATGPT_PLAN__';'madar_ai_server.py'='__HASH_SERVER__'}
$old = @{
 'BUILD.txt'='8a2ee471df63da20c6bc1e3b43fe72dee7ead9dc'
 'chatgpt_plan.py'='a9f9edb8ba7d9e4d840e24f2b2f9c951158d424f'
 'madar_ai_server.py'='46351320bb453344761af0f8578328c407e6270a'
}
$script:pythonExe=$null; $script:backup=$null; $script:changed=$false; $script:hadServer=$false
$sourceVersion=$null; $result='FAIL'; $failureCategory='PRECHECK'
$localHealth='NOT_TESTED'; $storagePaths='NOT_TESTED'; $chatgptModels='NOT_TESTED'
$chatgptModelCount=0; $chatgptSafeError=''; $chatgptRequestId=''

function Hash-File([string]$path) { return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Assert-PlainPath([string]$path) {
 if (Test-Path -LiteralPath $path) {
  $item=Get-Item -LiteralPath $path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "A protected path is a junction or symbolic link: $($item.Name)" }
 }
}
function Get-MadarProcesses {
 return @(Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine -match ([regex]::Escape($launcher)) -and $_.CommandLine -match '--server'
 })
}
function Current-Health { try { return Invoke-RestMethod -Uri $healthURL -TimeoutSec 3 } catch { return $null } }
function Test-PortBusy {
 $client=New-Object Net.Sockets.TcpClient
 try { $attempt=$client.BeginConnect('127.0.0.1',8765,$null,$null); return ($attempt.AsyncWaitHandle.WaitOne(400) -and $client.Connected) }
 finally { $client.Close() }
}
function Start-Madar {
 if (-not $script:pythonExe -or -not (Test-Path -LiteralPath $script:pythonExe -PathType Leaf)) { throw 'A verified Python runtime was not identified.' }
 $env:MADAR_HOME=$base; $env:MADAR_DATA_DIR=Join-Path $base 'Data'; $env:MADAR_PORT='8765'
 $env:PYTHONIOENCODING='utf-8:backslashreplace'
 Start-Process -FilePath $script:pythonExe -ArgumentList ('"' + $launcher + '" --server') -WorkingDirectory $app -WindowStyle Hidden
}
function Wait-ForV455 {
 for ($i=0; $i -lt 100; $i++) {
  $h=Current-Health
  if ($h -and $h.applicationId -eq 'madar-local' -and $h.version -eq $targetVersion -and
      $h.pdfReaderAssetsReady -eq $true -and $h.learningDashboardAssetsReady -eq $true -and $h.bookDeletionReady -eq $true) { return $h }
  Start-Sleep -Milliseconds 300
 }
 throw 'The v4.55 local health checks did not pass.'
}
function Test-StorageLayout {
 $expectedData=[IO.Path]::GetFullPath((Join-Path $base 'Data')).TrimEnd('\')
 $expectedBooks=[IO.Path]::GetFullPath((Join-Path $base 'Books')).TrimEnd('\')
 $vault=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/vault/list' -TimeoutSec 8
 $books=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/local-pdf/list' -TimeoutSec 8
 $actualData=[IO.Path]::GetFullPath([string]$vault.dataFolder).TrimEnd('\')
 $actualBooks=[IO.Path]::GetFullPath([string]$books.folder).TrimEnd('\')
 if (-not [string]::Equals($actualData,$expectedData,[StringComparison]::OrdinalIgnoreCase)) { throw 'The active learning data path is not the installation Data folder.' }
 if (-not [string]::Equals($actualBooks,$expectedBooks,[StringComparison]::OrdinalIgnoreCase)) { throw 'The managed PDF path is not the installation Books folder.' }
 return 'PASS'
}
function Test-ChatGPTModelCatalog {
 try {
  $response=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/chatgpt/models' -TimeoutSec 40
  $models=@($response.models)
  if ($models.Count -lt 1) { $script:chatgptModels='FAIL'; $script:chatgptSafeError='MODEL_CATALOG_EMPTY' }
  else { $script:chatgptModels='PASS'; $script:chatgptModelCount=$models.Count }
 } catch {
  $script:chatgptModels='FAIL'; $raw=[string]$_.ErrorDetails.Message; $safe=''
  if ($raw) { try { $body=$raw | ConvertFrom-Json -ErrorAction Stop; if ($body.error -is [string]) { $safe=[string]$body.error } } catch {} }
  if (-not $safe) { $safe=[string]$_.Exception.Message }
  $safe=$safe -replace '(?i)Bearer\s+[A-Za-z0-9._~-]+','Bearer [REDACTED]'
  $safe=$safe -replace '(?i)(access_token|refresh_token|authorization_code)\s*[:=]\s*\S+','$1=[REDACTED]'
  if ($safe.Length -gt 500) { $safe=$safe.Substring(0,500) }
  $script:chatgptSafeError=$safe
  $match=[regex]::Match($safe,'requestId=([A-Za-z0-9_.:-]+)')
  if ($match.Success) { $script:chatgptRequestId=$match.Groups[1].Value }
 }
}

try {
 Write-Host 'MADAR v4.55 | ChatGPT plan refresh repair' -ForegroundColor Cyan
 if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Madar was not found at D:\AWHQ CENTER\MADAR\App.' }
 foreach ($folder in @('Data','Books','Backups','Reports')) {
  $path=Join-Path $base $folder
  if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw "The protected $folder folder is missing; no data folders were created or changed." }
  Assert-PlainPath $path
 }
 if ($env:MADAR_DATA_DIR) {
  $configured=[IO.Path]::GetFullPath([string]$env:MADAR_DATA_DIR)
  $expected=[IO.Path]::GetFullPath((Join-Path $base 'Data'))
  if (-not [string]::Equals($configured,$expected,[StringComparison]::OrdinalIgnoreCase)) { throw 'MADAR_DATA_DIR points outside the protected Data folder.' }
 }
 $buildPath=Join-Path $app 'BUILD.txt'
 if (-not (Test-Path -LiteralPath $buildPath -PathType Leaf)) { throw 'BUILD.txt is missing.' }
 $build=(Get-Content -LiteralPath $buildPath -Raw -Encoding UTF8).Trim()
 if ($build -notmatch '^(v4\.\d+)\b') { throw 'The installed Madar version is not recognized.' }
 $sourceVersion=$Matches[1]
 if ($sourceVersion -notin @('v4.54','v4.55')) { throw "This repair accepts only v4.54 or v4.55; detected $sourceVersion." }
 foreach ($name in $files) {
  $target=Join-Path $app $name
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Required program file is missing: $name" }
  Assert-PlainPath $target
  $digest=Hash-File $target
  $expectedHash=if ($sourceVersion -eq 'v4.55') { $new[$name] } else { $old[$name] }
  if ($digest -ne $expectedHash) { throw "Program file $name does not match the verified $sourceVersion baseline; no file was replaced." }
  $payload=Join-Path $PSScriptRoot ('patch\' + $name)
  if (-not (Test-Path -LiteralPath $payload -PathType Leaf) -or (Hash-File $payload) -ne $new[$name]) { throw "The embedded payload failed its integrity check: $name" }
 }
 $health=Current-Health; $running=@(Get-MadarProcesses)
 if ($running.Count -gt 1) { throw 'Multiple Madar server processes were found; update stopped.' }
 if ($health -and ($health.applicationId -ne 'madar-local' -or $health.version -ne $sourceVersion)) { throw 'Port 8765 is serving a different or unknown Madar version.' }
 if ($running.Count -eq 1 -and -not $health) { throw 'The current Madar service is not healthy enough to update safely.' }
 if ($running.Count -eq 0 -and $health) { throw 'Port 8765 is not owned by the verified Madar launcher.' }
 if ($running.Count -eq 0 -and (Test-PortBusy)) { throw 'Port 8765 is occupied by an unverified service; no process was stopped.' }
 if ($running.Count -eq 1 -and $running[0].ExecutablePath) { $script:pythonExe=[string]$running[0].ExecutablePath }
 if (-not $script:pythonExe) {
  $cmd=Get-Command 'pythonw.exe' -ErrorAction SilentlyContinue
  if (-not $cmd) { $cmd=Get-Command 'python.exe' -ErrorAction SilentlyContinue }
  if ($cmd) { $script:pythonExe=$cmd.Source }
 }
 if (-not $script:pythonExe -or -not (Test-Path -LiteralPath $script:pythonExe -PathType Leaf)) { throw 'A Python runtime was not found; no program files were changed.' }
 $script:hadServer=($running.Count -eq 1)
 if ($sourceVersion -eq 'v4.54') {
  $script:backup=Join-Path (Join-Path $base 'Backups') ('Madar455-Before-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $script:backup -Force | Out-Null
  foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $app $name) -Destination (Join-Path $script:backup $name) -ErrorAction Stop }
  if ($script:hadServer) {
   Stop-Process -Id $running[0].ProcessId -ErrorAction Stop
   for ($i=0; $i -lt 30; $i++) { if (-not (Get-Process -Id $running[0].ProcessId -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 150 }
   if (Get-Process -Id $running[0].ProcessId -ErrorAction SilentlyContinue) { throw 'Madar did not stop cleanly; no application file was replaced.' }
  }
  $script:changed=$true
  foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('patch\' + $name)) -Destination (Join-Path $app $name) -Force -ErrorAction Stop }
 }
 if (-not $health -or $sourceVersion -eq 'v4.54') { Start-Madar }
 $null=Wait-ForV455
 $localHealth='PASS'
 $storagePaths=Test-StorageLayout
 # Non-billable metadata request only; no Responses inference is sent.
 Test-ChatGPTModelCatalog
 $result='PASS'; $failureCategory='NONE'
 Write-Host 'PASS: v4.55 installed; Data and Books were not modified.' -ForegroundColor Green
 Write-Host ('ChatGPT model catalog: ' + $chatgptModels + ' | models: ' + $chatgptModelCount) -ForegroundColor Cyan
 if ($chatgptModels -ne 'PASS') { Write-Host ('Safe diagnostic: ' + $chatgptSafeError) -ForegroundColor Yellow }
 Start-Process 'http://127.0.0.1:8765/?v=455'
} catch {
 Write-Host ('Update stopped: ' + $_.Exception.Message) -ForegroundColor Red
 if ($script:changed -and $script:backup) {
  try {
   foreach ($proc in @(Get-MadarProcesses)) { Stop-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue }
   Start-Sleep -Milliseconds 350
   foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $script:backup $name) -Destination (Join-Path $app $name) -Force -ErrorAction Stop }
   if ($script:hadServer) { Start-Madar }
   Write-Host 'The previous verified program files were restored from Backups.' -ForegroundColor Yellow
  } catch { Write-Host 'Automatic rollback did not fully complete; the verified backup remains in Backups.' -ForegroundColor Red }
 }
} finally {
 try {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
  [pscustomobject]@{
   schema='madar.siwc.refresh.repair.v1'; target=$targetVersion; sourceVersion=$sourceVersion
   result=$result; failureCategory=$failureCategory; localHealth=$localHealth; storagePaths=$storagePaths
   chatgptModels=$chatgptModels; chatgptModelCount=$chatgptModelCount
   chatgptSafeError=$chatgptSafeError; chatgptRequestId=$chatgptRequestId
   programFiles=$files; programBackupCreated=[bool]$script:backup
   learnerDataModified=$false; managedBooksModified=$false; automaticUpload=$false
   generatedAt=(Get-Date).ToString('o')
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  Write-Host 'Privacy-safe report saved locally. No tokens, learner data, or books were uploaded.' -ForegroundColor Gray
 } catch { Write-Host 'The local diagnostic report could not be saved.' -ForegroundColor Yellow }
}
if ($result -eq 'PASS') { exit 0 }
exit 1
