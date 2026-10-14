param([string]$PMTilesExecutable = '.cache\pmtiles-tool\pmtiles.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'terrain-manifest.json') -Raw | ConvertFrom-Json
$tool = if ([System.IO.Path]::IsPathRooted($PMTilesExecutable)) { $PMTilesExecutable } else { Join-Path $projectRoot $PMTilesExecutable }
$output = Join-Path $projectRoot $manifest.file
if (Test-Path -LiteralPath $output) { throw "Terrain already exists: $output. Move it aside explicitly before recreating it." }
$sourceHeaders = Invoke-WebRequest -Uri $manifest.source -Method Head -UseBasicParsing
if ($sourceHeaders.Headers['ETag'] -ne $manifest.sourceETag) { throw 'The upstream terrain archive has changed. Review the new source and update its provenance before extraction.' }
& $tool extract $manifest.source $output '--bbox=5,43,17,49' '--minzoom=0' '--maxzoom=12'
if ($LASTEXITCODE -ne 0) { throw 'Terrain extraction failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $manifest.sha256) { throw "Terrain checksum differs from the recorded extraction: $hash. Review the archive before use." }
"Prepared $output ($(Get-Item -LiteralPath $output | Select-Object -ExpandProperty Length) bytes)."
