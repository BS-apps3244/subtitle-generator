# Subtitle Generator

Desktop app for creating editable SRT subtitle files from MP4/MOV files using Gladia.

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

The app stores the Gladia API key and preferences in Electron's user data directory on the local machine.

## Build Installer

Create a local Windows installer:

```powershell
npm run dist
```

The installer is written to `dist/`.

## Update Prompts

The app checks the latest GitHub Release on startup:

```text
https://github.com/BS-apps3244/subtitle-generator/releases/latest
```

If the installed version is older than the newest release tag, the app shows an update prompt with Update Now and Later options. Editors can continue working if they choose Later. The app checks on startup and then once per minute while open. In packaged releases, Update Now downloads the latest installer inside the app and restarts to install it.

The release tag should match the version in `package.json`, such as `v0.1.1` for version `0.1.1`. Do not embed GitHub tokens in the app. Packaged Electron apps can be unpacked, and embedded tokens can be extracted.

## Current Features

- Batch MP4/MOV/M4V/audio file queue
- Gladia v2 upload and pre-recorded transcription flow
- SRT generation with configurable subtitle limits
- Global custom vocabulary and custom spelling rules
- Settings screen with saved defaults
- Output folder selection
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

Each editor needs their own Gladia API key saved in the app settings. API keys are stored locally and should not be committed to GitHub.

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

Gladia accepts audio and video files through `/v2/upload`, so the first version uploads the editor's MP4/MOV file directly and lets Gladia process the media. A later version can add local FFmpeg extraction if smaller uploads become important.
