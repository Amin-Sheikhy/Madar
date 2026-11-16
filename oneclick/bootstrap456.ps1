# v4.56 one-click bootstrap. The EXE carries a hash-verified payload.
$ErrorActionPreference = 'Stop'
$work = $null
$outcome = 1
try {
 Write-Host 'MADAR v4.56 - One Click SIWC Repair' -ForegroundColor Cyan
 $exe = $env:MADAR456_INSTALLER_FILE
 if (-not $exe -or -not [IO.File]::Exists($exe)) { throw 'The one-click installer file could not be identified.' }
 $bytes = [IO.File]::ReadAllBytes($exe)
 if ($bytes.Length -lt 24) { throw 'The installer package is incomplete.' }
 $marker = [Text.Encoding]::ASCII.GetString($bytes,$bytes.Length-24,16)
 if ($marker -cne 'MADAR456_ZIPEND!') { throw 'The installer package marker is invalid.' }
 $length = [BitConverter]::ToInt64($bytes,$bytes.Length-8)
 if ($length -lt 100 -or $length -gt 8388608 -or ($bytes.Length-24-$length) -lt 0) { throw 'The embedded package size is invalid.' }
 $stream = [IO.MemoryStream]::new($bytes,[int]($bytes.Length-24-$length),[int]$length,$false)
 $expectedHash = '__PAYLOAD_SHA256__'
 $sha = [Security.Cryptography.SHA256]::Create()
 try { $actualHash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
 finally { $sha.Dispose(); $stream.Position = 0 }
 if ($actualHash -cne $expectedHash) { throw 'The embedded package SHA-256 check failed.' }
 Add-Type -AssemblyName System.IO.Compression
 $archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Read)
 $expectedEntries = @('Install-Madar456-SIWC-Repair.ps1','patch/BUILD.txt','patch/chatgpt_plan.py','patch/madar_ai_server.py','patch/chatgpt_ui.js','patch/dashboard_v452.js','patch/sw.js')
 if ($archive.Entries.Count -ne $expectedEntries.Count) { throw 'The embedded package has an unexpected file count.' }
 $seen = @{}
 foreach ($entry in $archive.Entries) {
  $name=[string]$entry.FullName
  if (-not $name -or $name.StartsWith('/') -or $name.Contains('\') -or $name.Contains(':') -or ($name -split '/') -contains '..' -or $name.EndsWith('/')) { throw 'An unsafe package path was rejected.' }
  if ($expectedEntries -cnotcontains $name -or $seen.ContainsKey($name)) { throw 'An unexpected or duplicate package entry was rejected.' }
  $seen[$name]=$true
 }
 foreach ($name in $expectedEntries) { if (-not $seen.ContainsKey($name)) { throw 'A required installer component is missing.' } }
 $work=Join-Path ([IO.Path]::GetTempPath()) ('Madar456-'+[Guid]::NewGuid().ToString('N'))
 [IO.Directory]::CreateDirectory($work) | Out-Null
 $prefix=[IO.Path]::GetFullPath($work).TrimEnd('\')+'\'
 try {
  foreach ($entry in $archive.Entries) {
   $relative=$entry.FullName.Replace('/','\')
   $destination=[IO.Path]::GetFullPath((Join-Path $work $relative))
   if (-not $destination.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'The package attempted to write outside its temporary folder.' }
   [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
   $inputStream=$entry.Open(); $outputStream=[IO.File]::Create($destination)
   try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
  }
 } finally { $archive.Dispose(); $stream.Dispose() }
 $setup=Join-Path $work 'Install-Madar456-SIWC-Repair.ps1'
 if (-not [IO.File]::Exists($setup)) { throw 'The v4.56 update script is missing.' }
 & $setup
 if ($LASTEXITCODE -ne 0) { throw 'The v4.56 update did not pass local verification. Read the local Reports folder.' }
 Write-Host 'Madar v4.56 passed its local checks.' -ForegroundColor Green
 $outcome=0
} catch {
 Write-Host ('Update stopped: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'No learner data or managed books were uploaded.' -ForegroundColor Yellow
 [void](Read-Host 'Press Enter to close')
} finally {
 if ($work -and [IO.Directory]::Exists($work)) { try { [IO.Directory]::Delete($work,$true) } catch {} }
}
exit $outcome
