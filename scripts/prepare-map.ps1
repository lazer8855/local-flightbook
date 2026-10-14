param([string]$PMTilesExecutable = '.cache\pmtiles-tool\pmtiles.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'map-manifest.json') -Raw | ConvertFrom-Json
$toolPath = if ([System.IO.Path]::IsPathRooted($PMTilesExecutable)) { $PMTilesExecutable } else { Join-Path $projectRoot $PMTilesExecutable }
$output = Join-Path $projectRoot $manifest.file
if (Test-Path -LiteralPath $output) { throw "Map already exists: $output. Move it aside explicitly before recreating it." }
& $toolPath extract $manifest.source $output '--bbox=-25,34,45,72' '--minzoom=0' '--maxzoom=10'
if ($LASTEXITCODE -ne 0) { throw 'Map extraction failed' }
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $manifest.sha256) { throw "Map checksum differs from the recorded extraction: $hash. Review the archive before use." }
"Prepared $output ($(Get-Item -LiteralPath $output | Select-Object -ExpandProperty Length) bytes)."
