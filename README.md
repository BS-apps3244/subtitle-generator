# Based Subtitle Generator

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

## Notes

Gladia accepts audio and video files through `/v2/upload`, so the first version uploads the editor's MP4/MOV file directly and lets Gladia process the media. A later version can add local FFmpeg extraction if smaller uploads become important.
