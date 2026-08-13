[CmdletBinding()]
param(
  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string] $AssetDirectory = (Join-Path (Get-Location) "public\stockfish"),

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string] $ManifestPath = (Join-Path (Get-Location) "fixtures\phase2\stockfish-manifest.json")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw "Stockfish manifest no encontrado: $ManifestPath"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) {
  throw "schemaVersion no soportada: $($manifest.schemaVersion)"
}
if ($manifest.engine -ne "Stockfish" -or $manifest.engineVersion -ne "18") {
  throw "El manifest no describe Stockfish 18"
}
if ($manifest.packageVersion -ne "18.0.5" -or $manifest.flavor -ne "lite-single-threaded") {
  throw "El manifest no describe el paquete lite single-threaded aprobado"
}
if ($manifest.license -ne "GPL-3.0") {
  throw "Licencia incompatible o ausente: $($manifest.license)"
}
if ([string]::IsNullOrWhiteSpace([string] $manifest.browserBuild.licenseUrl)) {
  throw "El manifest no contiene la URL de la licencia"
}

$assets = @($manifest.assets)
if ($assets.Count -ne 2) {
  throw "Se esperaban exactamente dos assets Stockfish; encontrados: $($assets.Count)"
}

$expectedFiles = @("stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm")
$actualFiles = @($assets | ForEach-Object { [string] $_.file })
if (@(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles).Count -ne 0) {
  throw "Los nombres de assets no coinciden con la variante aprobada"
}

foreach ($asset in $assets) {
  $fileName = [string] $asset.file
  if ([string]::IsNullOrWhiteSpace($fileName) -or
      [System.IO.Path]::GetFileName($fileName) -ne $fileName) {
    throw "Nombre de asset inválido o con ruta: $fileName"
  }

  $assetPath = Join-Path $AssetDirectory $fileName
  if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
    throw "Asset Stockfish ausente: $assetPath"
  }

  $item = Get-Item -LiteralPath $assetPath
  $actualBytes = [int64] $item.Length
  $actualSha256 = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $expectedBytes = [int64] $asset.bytes
  $expectedSha256 = ([string] $asset.sha256).ToLowerInvariant()

  if ($actualBytes -ne $expectedBytes) {
    throw "${fileName}: tamaño inesperado. Esperado $expectedBytes, encontrado $actualBytes"
  }
  if ($actualSha256 -ne $expectedSha256) {
    throw "${fileName}: SHA-256 inesperado. Esperado $expectedSha256, encontrado $actualSha256"
  }

  Write-Output ("PASS {0} bytes={1} sha256={2}" -f $fileName, $actualBytes, $actualSha256)
}

Write-Output "PASS manifest Stockfish $($manifest.engineVersion) $($manifest.flavor)"
