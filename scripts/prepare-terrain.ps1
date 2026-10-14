param(
  [string]$PMTilesExecutable = '.cache\pmtiles-tool\pmtiles.exe',
  [ValidateSet('alps', 'world')][string]$Map = 'alps'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestFile = if ($Map -eq 'world') { 'terrain-world-manifest.json' } else { 'terrain-manifest.json' }
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot $manifestFile) -Raw | ConvertFrom-Json
$tool = if ([System.IO.Path]::IsPathRooted($PMTilesExecutable)) { $PMTilesExecutable } else { Join-Path $projectRoot $PMTilesExecutable }
$output = Join-Path $projectRoot $manifest.file
if (Test-Path -LiteralPath $output) { throw "Terrain already exists: $output. Move it aside explicitly before recreating it." }
$sourceHeaders = Invoke-WebRequest -Uri $manifest.source -Method Head -UseBasicParsing
if ($sourceHeaders.Headers['ETag'] -ne $manifest.sourceETag) { throw 'The upstream terrain archive has changed. Review the new source and update its provenance before extraction.' }
$extractArgs = @('extract', $manifest.source, $output, "--minzoom=$($manifest.minZoom)", "--maxzoom=$($manifest.maxZoom)")
if ($Map -ne 'world') { $extractArgs += '--bbox=' + ($manifest.bounds -join ',') }
& $tool @extractArgs
if ($LASTEXITCODE -ne 0) { throw 'Terrain extraction failed' }
if ($manifest.maxBytes -and (Get-Item -LiteralPath $output).Length -gt $manifest.maxBytes) { throw 'Terrain exceeds the recorded size limit' }
& $tool verify $output
if ($LASTEXITCODE -ne 0) { throw 'Terrain archive verification failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $manifest.sha256) { throw "Terrain checksum differs from the recorded extraction: $hash. Review the archive before use." }
"Prepared $output ($(Get-Item -LiteralPath $output | Select-Object -ExpandProperty Length) bytes)."
