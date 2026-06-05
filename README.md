# Subtitle Generator

Desktop app for creating editable SRT subtitle files from audio/video files. It defaults to ElevenLabs Scribe v2 transcription, with bundled local Whisper and Gladia still available as optional providers.

## Setup

```powershell
npm install
```

## Run

```powershell
npm start
```

## Verify

```powershell
npm run check
```

The app stores preferences in Electron's user data directory on the local machine. An API key is needed when the transcription provider is set to ElevenLabs or Gladia.

## Build Installer

Create a local Windows installer:

```powershell
npm run dist
```

The installer is written to `dist/`. The local Whisper model is bundled into the installer, so the installer is much larger than a cloud-only build.

## Update Prompts

The app checks the latest GitHub Release on startup:

```text
https://github.com/BS-apps3244/subtitle-generator/releases/latest
```

If the installed version is older than the newest release tag, the app shows an update prompt with Update Now and Later options. Editors can continue working if they choose Later. The app checks on startup and then once per minute while open. In packaged releases, Update Now downloads the latest installer inside the app and restarts to install it.

The release tag should match the version in `package.json`, such as `v0.1.1` for version `0.1.1`. Do not embed GitHub tokens in the app. Packaged Electron apps can be unpacked, and embedded tokens can be extracted.

## Current Features

- Batch audio/video file queue with picker and drag-and-drop
- ElevenLabs Scribe v2 transcription with word-level timestamps
- Free local Whisper transcription through bundled `whisper.cpp`
- Optional reference script assist that aligns Whisper output to a pasted script or selectable-text PDF and fixes close recognition misses while preserving subtitle timing
- Optional Gladia v2 upload and pre-recorded transcription flow
- SRT generation with configurable subtitle limits
- Global custom vocabulary and custom spelling rules
- Settings screen with saved defaults
- Windows Save As dialog for SRT export
- Editable SRT preview before export
- Per-user local job history with clear history action

## Editor Install/Update Flow

Editors can install Node.js, clone or download this repository, then run:

```powershell
npm install
npm start
```

When updates are available, pull the latest repository changes and run:

```powershell
npm install
npm run check
npm start
```

Editors can use Local Whisper without an API key or internet connection after install. ElevenLabs and Gladia modes require each editor to save their own API key in settings. API keys are stored locally and should not be committed to GitHub.

## Publish a Release

Update the version in `package.json`, commit the change, then create and push a matching tag:

```powershell
git add .
git commit -m "Release v0.1.1"
git tag v0.1.1
git push
git push origin v0.1.1
```

GitHub Actions will build the Windows installer and attach it to a GitHub Release. Editors can download the `.exe` from the repository's Releases page.

## Notes

ElevenLabs mode uploads the selected audio/video file directly to ElevenLabs, requests Scribe v2 word timestamps, then runs the app's own subtitle builder and QA rules. Local Whisper is powered by `whisper.cpp` and currently bundles the CPU x64 binary plus the `base.en` model. This keeps transcription free and offline, but the packaged installer is larger and transcription speed depends on the user's computer. The app also bundles FFmpeg for Windows so video inputs such as MP4/MOV/MKV are normalized to temporary MP3 audio before Whisper runs. End users do not need to install Whisper, Python, FFmpeg, or provide an API key when using the local Whisper provider.
