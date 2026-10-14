param(
  [string]$PMTilesExecutable = '.cache\pmtiles-tool\pmtiles.exe',
  [ValidateSet('europe', 'switzerland', 'world')][string]$Map = 'europe'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestFile = if ($Map -eq 'europe') { 'map-manifest.json' } else { "map-$Map-manifest.json" }
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot $manifestFile) -Raw | ConvertFrom-Json
$toolPath = if ([System.IO.Path]::IsPathRooted($PMTilesExecutable)) { $PMTilesExecutable } else { Join-Path $projectRoot $PMTilesExecutable }
$output = Join-Path $projectRoot $manifest.file
if (Test-Path -LiteralPath $output) { throw "Map already exists: $output. Move it aside explicitly before recreating it." }
$extractArgs = @('extract', $manifest.source, $output, "--minzoom=$($manifest.minZoom)", "--maxzoom=$($manifest.maxZoom)")
if ($Map -ne 'world') { $extractArgs += '--bbox=' + ($manifest.bounds -join ',') }
& $toolPath @extractArgs
if ($LASTEXITCODE -ne 0) { throw 'Map extraction failed' }
if ($manifest.maxBytes -and (Get-Item -LiteralPath $output).Length -gt $manifest.maxBytes) { throw 'Map exceeds the recorded size limit. Do not distribute this archive.' }
& $toolPath verify $output
if ($LASTEXITCODE -ne 0) { throw 'Map archive verification failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $manifest.sha256) { throw "Map checksum differs from the recorded extraction: $hash. Review the archive before use." }
"Prepared $output ($(Get-Item -LiteralPath $output | Select-Object -ExpandProperty Length) bytes)."
