param(
  [ValidateSet('world', 'terrain-world', 'all')][string]$Map = 'all',
  [string]$Directory = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
$directoryPath = [System.IO.Path]::GetFullPath($Directory)
$expected = @{
  'world' = '9ed7c66a7ace082742e93b2245dd99c4911fc98992bea504c3e86d39ae96ba6b'
  'terrain-world' = '68ba733173ef03508537fc450c957ba045415cda33b53bf8aac7e362ec5c28e9'
}
$maps = if ($Map -eq 'all') { @('world', 'terrain-world') } else { @($Map) }
foreach ($name in $maps) {
  $destination = Join-Path $directoryPath "$name.pmtiles"
  if (Test-Path -LiteralPath $destination) { throw "Already exists: $destination. Move it aside before joining." }
  $parts = @(Join-Path $directoryPath "$name.pmtiles.part01"; Join-Path $directoryPath "$name.pmtiles.part02")
  foreach ($part in $parts) {
    if (-not (Test-Path -LiteralPath $part -PathType Leaf)) { throw "Missing download: $part" }
  }
  $outputStream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew)
  try {
    foreach ($part in $parts) {
      $inputStream = [System.IO.File]::OpenRead($part)
      try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose() }
    }
  } finally { $outputStream.Dispose() }
  $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Checksum failed for $destination. Do not use it; remove the incomplete output and download the parts again." }
  Write-Output "Verified: $destination"
}
