# The embedded payload is a short ZIP overlay in the EXE itself.
# No user extraction, no elevation, no remote downloads, no automatic upload.
$ErrorActionPreference='Stop'
$work=$null
$outcome=1
try {
 Write-Host 'MADAR v4.53 - One Click Update' -ForegroundColor Cyan
 $exe=$env:MADAR453_INSTALLER_FILE
 if(-not $exe -or -not [IO.File]::Exists($exe)){throw 'Installer file cannot be located.'}
 if(-not $env:MADAR_HOME){
  $exeRoot=Split-Path -Parent $exe
  if(Test-Path -LiteralPath (Join-Path $exeRoot 'App\madar_launcher.py') -PathType Leaf){$env:MADAR_HOME=$exeRoot}
 }
 $bytes=[IO.File]::ReadAllBytes($exe)
 if($bytes.Length -lt 24){throw 'Installer is incomplete.'}
 $mark=[Text.Encoding]::ASCII.GetString($bytes,$bytes.Length-24,16)
 if($mark -cne 'MADAR453_ZIPEND!'){throw 'Installer package marker is invalid.'}
 $len=[BitConverter]::ToInt64($bytes,$bytes.Length-8)
 if($len -lt 100 -or $len -gt 8388608 -or ($bytes.Length-24-$len) -lt 0){throw 'Installer package size is invalid.'}
 $stream=[IO.MemoryStream]::new($bytes,[int]($bytes.Length-24-$len),[int]$len,$false)
 $expected='__PAYLOAD_SHA256__'
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
 finally{$sha.Dispose();$stream.Position=0}
 if($actual -cne $expected){throw 'Embedded package hash verification failed.'}
 Add-Type -AssemblyName System.IO.Compression
 $archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read)
 $work=Join-Path ([IO.Path]::GetTempPath()) ('Madar453-'+[Guid]::NewGuid().ToString('N'))
 [IO.Directory]::CreateDirectory($work) | Out-Null
 $prefix=[IO.Path]::GetFullPath($work).TrimEnd('\')+'\'
 try{
  foreach($entry in $archive.Entries){
   $name=$entry.FullName.Replace('/','\')
   if(-not $name -or $name.EndsWith('\')){continue}
   $dest=[IO.Path]::GetFullPath((Join-Path $work $name))
   if(-not $dest.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe package entry.'}
   [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest)) | Out-Null
   $inputStream=$entry.Open();$outputStream=[IO.File]::Create($dest)
   try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose();$inputStream.Dispose()}
  }
 }finally{$archive.Dispose();$stream.Dispose()}
 $setup=Join-Path $work 'Install-Madar453-Books-Delete.ps1'
 if(-not [IO.File]::Exists($setup)){throw 'Upgrade script is missing.'}
 & $setup
 if($LASTEXITCODE -ne 0){throw 'Upgrade did not pass local verification. See the privacy-safe report in the installation root Reports folder.'}
 Write-Host 'Madar v4.53 is ready.' -ForegroundColor Green
 $outcome=0
}catch{
 Write-Host ('Upgrade stopped: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'Existing books and learning records were not modified.' -ForegroundColor Yellow
 [void](Read-Host 'Press Enter to close')
}finally{
 if($work -and [IO.Directory]::Exists($work)){
  try{[IO.Directory]::Delete($work,$true)}catch{}
 }
}
exit $outcome
