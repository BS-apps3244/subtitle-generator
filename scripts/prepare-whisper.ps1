$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$vendorDir = Join-Path $root "vendor\whisper"
$ffmpegVendorDir = Join-Path $root "vendor\ffmpeg"
$binDir = Join-Path $vendorDir "bin"
$releaseDir = Join-Path $binDir "Release"
$zipPath = Join-Path $vendorDir "whisper-bin-x64.zip"
$cliPath = Join-Path $releaseDir "whisper-cli.exe"
$modelPath = Join-Path $vendorDir "ggml-base.en.bin"
$ffmpegZipPath = Join-Path $ffmpegVendorDir "ffmpeg-release-essentials.zip"
$ffmpegBinDir = Join-Path $ffmpegVendorDir "bin"
$ffmpegPath = Join-Path $ffmpegBinDir "ffmpeg.exe"

$whisperZipUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
$ffmpegZipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null
New-Item -ItemType Directory -Force -Path $ffmpegVendorDir | Out-Null

if (!(Test-Path $cliPath)) {
  Write-Host "Downloading whisper.cpp Windows x64 runtime..."
  Invoke-WebRequest -Uri $whisperZipUrl -OutFile $zipPath
  if (Test-Path $binDir) {
    Remove-Item -LiteralPath $binDir -Recurse -Force
  }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $binDir -Force
  Remove-Item -LiteralPath $zipPath -Force
}

if (!(Test-Path $modelPath)) {
  Write-Host "Downloading Whisper base.en model..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
}

if (!(Test-Path $ffmpegPath)) {
  Write-Host "Downloading FFmpeg Windows x64 runtime..."
  Invoke-WebRequest -Uri $ffmpegZipUrl -OutFile $ffmpegZipPath
  $extractDir = Join-Path $ffmpegVendorDir "extract"
  if (Test-Path $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  Expand-Archive -LiteralPath $ffmpegZipPath -DestinationPath $extractDir -Force
  $downloadedFfmpeg = Get-ChildItem -Path $extractDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
  if (!$downloadedFfmpeg) {
    throw "FFmpeg download did not contain ffmpeg.exe"
  }
  New-Item -ItemType Directory -Force -Path $ffmpegBinDir | Out-Null
  Copy-Item -LiteralPath $downloadedFfmpeg.FullName -Destination $ffmpegPath -Force
  Remove-Item -LiteralPath $extractDir -Recurse -Force
  Remove-Item -LiteralPath $ffmpegZipPath -Force
}

Write-Host "Local Whisper and FFmpeg assets are ready."
