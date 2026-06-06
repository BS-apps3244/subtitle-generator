# Subtitle Generator

Desktop app for creating editable SRT subtitle files from audio/video files. It defaults to ElevenLabs Scribe v2 transcription through a Supabase proxy, with bundled local Whisper available as a backup/offline provider.

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

The app stores preferences in Electron's user data directory on the local machine. End users do not need an ElevenLabs key because cloud transcription goes through the Supabase proxy.

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
- ElevenLabs Scribe v2 transcription with word-level timestamps through a Supabase Edge Function
- Free local Whisper transcription through bundled `whisper.cpp`
- SRT generation with configurable subtitle limits
- Synced global vocabulary and spelling rules through Supabase
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

Editors can use the default ElevenLabs provider without receiving the ElevenLabs API key because the key is stored in Supabase Edge Function secrets. Local Whisper works without an API key or internet connection after install. Server-only keys should not be committed to GitHub.

## Supabase Backend

The app uses Supabase project `errixvxrtwfevsarputx` for:

- `transcribe` Edge Function: proxies uploads to ElevenLabs without exposing the ElevenLabs API key in the desktop app.
- `dictionary` Edge Function: syncs global vocabulary and spelling rules across users.
- `dictionary_entries` and `dictionary_audit_log` tables.

Safe-to-ship client config lives in `src/main.cjs`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Server-only secrets are stored in Supabase and must not be committed:

- `ELEVENLABS_API_KEY`
- `SERVICE_ROLE_KEY`
- `ADMIN_SECRET`

Users are identified by a generated local `userId`; no login is required. User-added dictionary entries become active globally immediately. Pending entries can be edited/removed by their creator, while approved entries are locked for regular users. Admin mode is enabled by entering the admin secret in Settings.

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

ElevenLabs mode uploads the selected audio/video file to the Supabase proxy, which forwards it to ElevenLabs, requests Scribe v2 word timestamps, then returns the result to the app's own subtitle builder and QA rules. Local Whisper is powered by `whisper.cpp` and currently bundles the CPU x64 binary plus the `base.en` model. This keeps transcription free and offline, but the packaged installer is larger and transcription speed depends on the user's computer. The app also bundles FFmpeg for Windows so video inputs such as MP4/MOV/MKV are normalized to temporary MP3 audio before Whisper runs. End users do not need to install Whisper, Python, FFmpeg, or provide an API key when using the local Whisper provider.
