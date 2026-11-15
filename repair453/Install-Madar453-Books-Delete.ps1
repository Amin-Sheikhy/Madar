# Madar v4.51/v4.52 -> v4.53 one-click update. Exact hash precheck + rollback.
# Only known app files under D:\Madar\App are replaced.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$base='D:\Madar'
$app=Join-Path $base 'App'
$payload=Join-Path $PSScriptRoot 'patch'
$launcher=Join-Path $app 'madar_launcher.py'
$healthURL='http://127.0.0.1:8765/api/health'
$report=Join-Path $base 'Reports\Madar453-Books-Delete-SafeToShare.json'
$new=@{
 'BUILD.txt'='51cbf184980987d7f71a0b9b8d4e4e66d9114387bb65602ec7c8e55f734806a3'
 'index.html'='5e90fbf7d85e4bf04ef671c828e81a31cdffcfcb77997dc182cb23ba758929fa'
 'sw.js'='3951c0202d3a5960cfa1814adceabfc6dd12ac3d438bbb6ad00c23e44e414adc'
 'madar_ai_server.py'='89575e24f07415514b638c2ab8ed0beb5731b7d28193b408c2f38655cfa6cdf9'
 'local_pdf.py'='cd4c310e775cd51a5ddc17b3a57aa2dc20494e2b1f773d73b580afbc13680596'
 'pdf_simple.js'='6baf0fa6c997130899d0cd14bdf97c125662d5f08feba543fc80606357e2f045'
 'pdf_simple.css'='126a45aa26bf8508d36c42fdf9366c07ff05c0943efedad90a56101ac5886515'
 'dashboard_v452.js'='3ac067be7d4a04291b4fd5f8af9d1c1123192f4fc8951e83f2966658cb094d9e'
 'dashboard_v452.css'='9fe524aa20977cb999883269404d0e2ebd8ec5fa1b81f9efec65f8f5414b6a7d'
}
$oldByVersion=@{
 'v4.51'=@{
  'BUILD.txt'='414f2e94bb86ca3a5139aa969894e10a91279ff86a6407e8a63427d28139a1d2'
  'index.html'='bff833edb7ad11e9c5aec0cb5e323abaa7f589bee719bd233d7e6dfc48d569ec'
  'sw.js'='7c9f7b223f6fd0628f502ea2db63bab520d109be0de3c63ce4c2707b7da8a6c8'
  'madar_ai_server.py'='be0a109abc4a06c38534105625e2b99d7144661412a51d8dc2c06bc6831a3e38'
  'local_pdf.py'='4938d67ab359a3e587e0db7dda0e03afd7a045bf90ffbadfa0d914b05236b7f0'
  'pdf_simple.js'='76bbbcb1111334ca30fe677844ea10c3afb317a3b84d5ad4ff7d185c53385697'
  'pdf_simple.css'='a57894d0c12a85dee60741b14e8ed1f16f4607bfee3ba7bcb4a145d98bc34512'
 }
 'v4.52'=@{
  'BUILD.txt'='d0db42a734ee3b73f97aa0338424610f1b883fd74948a75e0851847a576f6f55'
  'index.html'='21084a361ffc879b17c185e4f958567dc877cb48c31f535a8b62fb1056c4e84b'
  'sw.js'='62be4840b23b1e52e86678b7af855c537e8ab1d770f3724651e24fecda8294af'
  'madar_ai_server.py'='cc2ad43fa436b59927c5bfd9f6ea8652ddbcf9157169a1a0d66d9f76bf6a1ad5'
  'local_pdf.py'='4938d67ab359a3e587e0db7dda0e03afd7a045bf90ffbadfa0d914b05236b7f0'
  'pdf_simple.js'='76bbbcb1111334ca30fe677844ea10c3afb317a3b84d5ad4ff7d185c53385697'
  'pdf_simple.css'='a57894d0c12a85dee60741b14e8ed1f16f4607bfee3ba7bcb4a145d98bc34512'
  'dashboard_v452.js'='3ac067be7d4a04291b4fd5f8af9d1c1123192f4fc8951e83f2966658cb094d9e'
  'dashboard_v452.css'='9fe524aa20977cb999883269404d0e2ebd8ec5fa1b81f9efec65f8f5414b6a7d'
 }
}
$result='FAIL';$reason='PRECHECK';$healthStatus='NOT_TESTED';$assetsStatus='NOT_TESTED';$deleteApiStatus='NOT_TESTED'
$backup=$null;$changed=$false;$hadServer=$false;$python=$null;$original=@{}
function Hash([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function CurrentHealth{try{return Invoke-RestMethod -Uri $healthURL -TimeoutSec 2}catch{return $null}}
function Get-MadarProcesses{
 return @(Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine -match ([regex]::Escape($launcher)) -and $_.CommandLine -match '--server'
 })
}
function Start-Madar{
 if(-not $python){throw 'Python runtime was not identified.'}
 Start-Process -FilePath $python -ArgumentList ('"'+$launcher+'" --server') -WorkingDirectory $app -WindowStyle Hidden
}
function Check-Version{
 for($i=0;$i -lt 100;$i++){
  $h=CurrentHealth
  if($h -and $h.applicationId -eq 'madar-local' -and $h.version -eq 'v4.53' -and
     $h.pdfReaderAssetsReady -eq $true -and $h.learningDashboardAssetsReady -eq $true -and $h.bookDeletionReady -eq $true){return $h}
  Start-Sleep -Milliseconds 300
 }
 throw 'Madar v4.53 health checks did not pass.'
}
function Test-DeleteEndpoint{
 $books=Join-Path $base 'Books'
 New-Item -ItemType Directory -Path $books -Force | Out-Null
 $name='Madar453-Delete-Test-'+[Guid]::NewGuid().ToString('N')+'.pdf'
 $path=Join-Path $books $name
 $created=$false
 try{
  [IO.File]::WriteAllBytes($path,[byte[]](0x25,0x50,0x44,0x46,0x2D,0x31,0x2E,0x34,0x0A));$created=$true
  $body=@{name=$name;confirm=$true}|ConvertTo-Json -Compress
  $headers=@{Origin='http://127.0.0.1:8765'}
  $response=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8765/api/local-pdf/delete' -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 8
  if($response.deleted -ne $true -or (Test-Path -LiteralPath $path)){throw 'The test PDF was not deleted by the local endpoint.'}
  return 'PASS'
 }finally{
  if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue}
 }
}
try{
 Write-Host 'MADAR v4.53 | Books delete + direct update' -ForegroundColor Cyan
 if(-not (Test-Path -LiteralPath $launcher -PathType Leaf)){throw 'Madar installation was not found in D:\Madar.'}
 $build=(Get-Content -LiteralPath (Join-Path $app 'BUILD.txt') -Raw -Encoding UTF8).Trim()
 $version=if($build -like 'v4.51 *'){'v4.51'}elseif($build -like 'v4.52 *'){'v4.52'}elseif($build -like 'v4.53 *'){'v4.53'}else{$null}
 if(-not $version){throw 'This one-click update supports Madar v4.51, v4.52 or the exact v4.53 target.'}
 $reason='PACKAGE_INTEGRITY'
 foreach($name in @($new.Keys)){
  $src=Join-Path $payload $name
  if(-not (Test-Path -LiteralPath $src -PathType Leaf) -or (Hash $src) -ne $new[$name]){throw "Invalid embedded file: $name"}
 }
 $reason='INSTALLED_INTEGRITY'
 if($version -eq 'v4.53'){
  foreach($name in @($new.Keys)){
   $target=Join-Path $app $name
   if(-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Hash $target) -ne $new[$name]){throw "v4.53 file is not the expected verified version: $name"}
  }
 }else{
  foreach($name in @($oldByVersion[$version].Keys)){
   $target=Join-Path $app $name
   if(-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Hash $target) -ne $oldByVersion[$version][$name]){throw "Unexpected local change in $name. Nothing was replaced."}
  }
  foreach($name in @('dashboard_v452.js','dashboard_v452.css')){
   $target=Join-Path $app $name;$original[$name]=(Test-Path -LiteralPath $target -PathType Leaf)
   if($version -eq 'v4.52'){
    if(-not $original[$name] -or (Hash $target) -ne $oldByVersion['v4.52'][$name]){throw "Unexpected dashboard file: $name"}
   }elseif($original[$name]){
    # v4.51 normally lacks the overview assets; if already present, accept only known v4.52 hashes.
    if((Hash $target) -ne $oldByVersion['v4.52'][$name]){throw "Unknown dashboard file on v4.51: $name"}
   }
  }
 }
 $h=CurrentHealth;$hadServer=($null -ne $h)
 if($h -and ($h.applicationId -ne 'madar-local' -or $h.version -ne $version)){throw 'Port 8765 is running a different or unknown Madar version.'}
 if(-not $h){
  $client=New-Object Net.Sockets.TcpClient
  try{$attempt=$client.BeginConnect('127.0.0.1',8765,$null,$null);if($attempt.AsyncWaitHandle.WaitOne(400) -and $client.Connected){throw 'Port 8765 is occupied by an unverified service.'}}
  finally{$client.Close()}
 }
 $running=@(Get-MadarProcesses)
 if($hadServer -and $running.Count -eq 0){throw 'The running Madar server could not be matched to the D: launcher.'}
 if($running.Count -gt 1){throw 'Multiple Madar server processes were found; update stopped for safety.'}
 if($running.Count -eq 1 -and $running[0].ExecutablePath){$python=$running[0].ExecutablePath}
 if(-not $python){$command=Get-Command 'pythonw.exe' -ErrorAction SilentlyContinue;if(-not $command){$command=Get-Command 'python.exe' -ErrorAction SilentlyContinue};if($command){$python=$command.Source}}
 if(-not $python){throw 'Python runtime not found; no changes were made.'}
 if($version -eq 'v4.53' -and -not $h){Start-Madar}
 if($version -ne 'v4.53'){
  $reason='BACKUP'
  $backup=Join-Path $base ('Backups\Madar453-Before-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  foreach($name in @($new.Keys)){
   $target=Join-Path $app $name
   if(Test-Path -LiteralPath $target -PathType Leaf){Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) -ErrorAction Stop;$original[$name]=$true}
   else{$original[$name]=$false}
  }
  Write-Host 'Program-file backup created; user courses and book originals are not changed.'
  $reason='SERVICE_STOP'
  if($running.Count -eq 1){Stop-Process -Id $running[0].ProcessId -ErrorAction Stop;Start-Sleep -Milliseconds 500}
  $reason='ACTIVATION';$changed=$true
  foreach($name in @($new.Keys)){Copy-Item -LiteralPath (Join-Path $payload $name) -Destination (Join-Path $app $name) -Force -ErrorAction Stop}
 }
 $reason='RUNTIME_HEALTH'
 $health=Check-Version;$healthStatus='PASS'
 foreach($file in @('pdf_simple.js','pdf_simple.css','dashboard_v452.js','dashboard_v452.css')){
  $response=Invoke-WebRequest -Uri ('http://127.0.0.1:8765/'+$file) -UseBasicParsing -TimeoutSec 6
  if($response.StatusCode -ne 200 -or $response.Content.Length -lt 100){throw "Static asset failed: $file"}
 }
 $assetsStatus='PASS'
 $reason='BOOK_DELETE_ACCEPTANCE'
 $deleteApiStatus=Test-DeleteEndpoint
 $result='PASS';$reason='NONE'
 Write-Host 'PASS: dashboard, PDF assets and managed-book deletion endpoint verified.' -ForegroundColor Green
 Start-Process 'http://127.0.0.1:8765/?v=453'
}catch{
 Write-Host ('Update stopped: '+$_.Exception.Message) -ForegroundColor Red
 if($changed -and $backup){
  try{
   foreach($proc in @(Get-MadarProcesses)){Stop-Process -Id $proc.ProcessId -ErrorAction Stop};Start-Sleep -Milliseconds 350
   foreach($name in @($new.Keys)){
    $target=Join-Path $app $name
    if($original[$name]){Copy-Item -LiteralPath (Join-Path $backup $name) -Destination $target -Force -ErrorAction Stop}
    else{Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue}
   }
   if($hadServer){Start-Madar}
   Write-Host 'Previous Madar files were restored.' -ForegroundColor Yellow
  }catch{Write-Host 'Automatic rollback did not fully complete; use the Backups folder.' -ForegroundColor Red}
 }
}finally{
 try{
  New-Item -ItemType Directory -Path (Join-Path $base 'Reports') -Force | Out-Null
  [pscustomobject]@{schema='madar.books.delete.update.v1';target='v4.53';result=$result;failureCategory=$reason;
   localHealth=$healthStatus;staticAssets=$assetsStatus;deleteEndpoint=$deleteApiStatus;
   userCourseFilesModified=$false;sourceOriginalsPreserved=$true;temporaryDeleteTest=$deleteApiStatus;
   uploaded=$false;generatedAt=(Get-Date).ToString('o')}|ConvertTo-Json -Depth 2|Set-Content -LiteralPath $report -Encoding UTF8
  Write-Host 'A privacy-safe report was saved locally under MADAR\Reports.'
 }catch{Write-Host 'Local diagnostic report could not be saved.'}
}
if($result -eq 'PASS'){exit 0};exit 1
