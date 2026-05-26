const electron = process.versions.electron ? require("electron") : {};
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const packageInfo = require("../package.json");
let autoUpdater = null;
if (process.versions.electron) {
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    autoUpdater = null;
  }
}

const GLADIA_BASE_URL = "https://api.gladia.io/v2";
const RELEASES_API_URL = "https://api.github.com/repos/BS-apps3244/subtitle-generator/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/BS-apps3244/subtitle-generator/releases/latest";
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 450;
const MAX_SRT_REPAIR_PASSES = 8;
const LOCAL_WHISPER_MODEL_FILE = "ggml-base.en.bin";
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "aac", "m4a", "flac", "ogg", "oga", "opus", "wma", "aiff", "aif", "amr"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mpeg", "mpg", "mpe", "mov", "m4v", "avi", "wmv", "webm", "mkv", "flv", "3gp", "3g2"]);
const DEFAULT_GLOSSARY_RULES = [
  { original: "base supplies", replacement: "Based Supplies" },
  { original: "based supplies", replacement: "Based Supplies" },
  { original: "baste supplies", replacement: "Based Supplies" },
  { original: "face supplies", replacement: "Based Supplies" },
  { original: "tallow and honey balm", replacement: "Tallow and Honey Balm" },
  { original: "tallow and honey bomb", replacement: "Tallow and Honey Balm" },
  { original: "beef tallow bomb", replacement: "beef tallow balm" },
  { original: "the bomb", replacement: "the balm" },
  { original: "this bomb", replacement: "this balm" },
  { original: "grass fed", replacement: "grass-fed" },
  { original: "grain, fed", replacement: "grain-fed" },
  { original: "drop shipping", replacement: "dropshipping" },
  { original: "onion, hydrosol", replacement: "onion hydrosol" },
  { original: "onion, hydrosoil", replacement: "onion hydrosol" },
  { original: "hydrosoil", replacement: "hydrosol" },
  { original: "beef, tallow", replacement: "beef tallow" },
  { original: "sulfur-rich, formula", replacement: "sulfur-rich formula" },
  { original: "hit back, when you carry menopause and menopause", replacement: "hit perimenopause and menopause" },
  { original: "hit back, when you carry", replacement: "hit perimenopause and" },
  { original: "hit back when you carry", replacement: "hit perimenopause and" },
  { original: "menopause and menopause", replacement: "menopause" },
  { original: "where dermatologists can't", replacement: "my dermatologist can't" },
  { original: "threw up the gentle cleanser", replacement: "threw out the gentle cleanser" },
  { original: "in my week three", replacement: "by week three" },
  { original: "does it your", replacement: "does your" },
  { original: "mining my own business", replacement: "minding my own business" },
  { original: "trim-fat", replacement: "trim fat" }
];
const DEFAULT_KEEP_TOGETHER_PHRASES = [
  "beef tallow",
  "raw honey",
  "olive oil",
  "prescription cream",
  "tallow balm",
  "grass-fed tallow",
  "vitamin A"
];
const GENERIC_LOWERCASE_TERMS = [
  "Tallow Company",
  "Tallow brand",
  "Tallow Balm",
  "Tallow",
  "Suet Fat",
  "Suet Tallow",
  "Suet",
  "Trim Fat",
  "Beef Tallow",
  "Raw Honey",
  "Olive Oil",
  "Grass Fed",
  "Grass-Fed",
  "Grass-fed"
];
const ARTICLES = new Set(["a", "an", "the"]);
const QUANTIFIER_DETERMINERS = new Set(["any", "every", "each", "some"]);
const COORDINATING_CONJUNCTIONS = new Set(["and", "or", "but", "so"]);
const SUBORDINATING_CONJUNCTIONS = new Set(["because", "if", "when", "while", "until", "than", "that", "which", "who", "whose"]);
const PREPOSITIONS = new Set([
  "of", "to", "in", "on", "at", "by", "for", "from", "with", "without",
  "into", "onto", "over", "under", "between", "about", "as", "off",
  "behind", "before", "after", "during", "through"
]);
const PHRASAL_VERB_PARTICLES = new Set([
  "up", "down", "in", "out", "away", "back", "through", "around", "over", "off"
]);
const AUXILIARY_VERBS = new Set([
  "is", "was", "were", "are", "be", "been", "being", "has", "have", "had",
  "can", "could", "would", "should", "will", "may", "might", "must", "do",
  "does", "did"
]);
const NEGATIONS = new Set(["not", "no"]);
const TEMPORAL_SENTENCE_STARTS = new Set(["after", "back", "before", "first", "finally", "for", "today"]);
const TEMPORAL_NOUNS = new Set(["night", "morning", "afternoon", "evening", "day", "week", "month", "year", "time"]);
const DEGREE_MODIFIERS = new Set(["very", "more", "most"]);
const POSSESSIVE_DETERMINERS = new Set(["my", "your", "his", "her", "its", "our", "their"]);
const DEMONSTRATIVE_DETERMINERS = new Set(["this", "these", "that", "those"]);
const SUBJECT_PRONOUNS = new Set(["i", "you", "we", "they", "he", "she", "it"]);
const OBJECT_PRONOUNS = new Set(["me", "you", "us", "them", "him", "her", "it"]);
const SENTENCE_START_CONTRACTIONS = new Set(["i'm", "i've", "i'll", "you're", "you'll", "you've", "it's", "that's", "there's", "they're", "we're"]);
const QUESTION_SENTENCE_STARTS = new Set(["what", "why", "how", "where"]);
const INCOMPLETE_END_CONTRACTIONS = new Set(["i'm", "you're", "we're", "they're", "he's", "she's", "it's", "that's", "i've", "you've", "we've", "they've", "i'll", "you'll", "we'll", "they'll"]);
const RELATIVE_CLAUSE_ANTECEDENTS = new Set(["one", "thing", "way", "reason", "time", "place", "person"]);
const COMPLEMENT_TAKING_VERBS = new Set(["let", "make", "help", "want", "need", "tell", "ask", "allow"]);
const DISCOURSE_SENTENCE_STARTS = new Set(["so", "and", "but", "now", "then"]);
const WEAK_END_WORDS = new Set([
  "kept", "applied", "mixed", "fades", "pulls", "gets", "used", "started",
  "added", "built", "seal", "keep", "put", "tried", "recommended", "said",
  "forget", "render", "burn", "make", "making", "using", "came", "went",
  "get", "got",
  "being", "became", "causes", "caused", "has", "have", "had"
]);
const PAIR_START_WORDS = new Set([
  "social", "premiere", "video", "audio", "subtitle", "custom", "project",
  "source", "review", "export", "caption", "timeline"
]);
const PAIR_END_WORDS = new Set([
  "pro", "file", "files", "editor", "rule",
  "rules", "generator", "dictionary", "years", "days", "months", "seconds",
  "minutes", "hours", "timeline", "track", "notes", "settings", "workflow"
]);
const UNIT_WORDS = new Set([
  "second", "seconds", "minute", "minutes", "hour", "hours", "day", "days",
  "week", "weeks", "month", "months", "year", "years", "percent", "dollars",
  "pounds", "ounces", "feet", "inches"
]);
const NUMBER_TERMS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "first", "second", "third", "fourth", "fifth", "sixth",
  "seventh", "eighth", "ninth", "tenth"
]);
const CAPITALIZED_NUMBER_TERMS = new Set(["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]);
const SINGLE_WORD_DETERMINERS = new Set(["single", "only", "same"]);
const CLAUSE_SUBJECT_STARTS = new Set([
  "people", "teams", "projects", "captions", "subtitles", "files", "clips",
  "we", "our", "she", "he", "they", "it", "this", "that", "your", "maya", "estrogen",
  "editors", "reviewers", "clients", "producers", "captions"
]);
const CLAUSE_VERBS = new Set([
  "was", "wasn't", "were", "weren't", "is", "isn't", "are", "aren't",
  "became", "came", "went", "gets", "used", "started", "added", "built",
  "tried", "worked", "said", "told", "tells",
  "learned", "had", "would", "crack", "bleed", "make", "recognize",
  "presented", "reviewed", "approved", "adjusted", "organized"
]);
const IMPERATIVE_START_VERBS = new Set([
  "try", "get", "look", "watch", "take", "use", "apply", "put", "stop", "start",
  "tell", "remember", "imagine", "think", "listen", "see"
]);

let mainWindow;
let autoUpdaterConfigured = false;

const defaultSettings = {
  apiKey: "",
  transcriptionProvider: "local-whisper",
  outputFolder: "",
  subtitleDefaults: {
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 3,
    caption_gap: 0,
    split_on_silence_gap: 0.5,
    maximum_characters_per_row: 45,
    maximum_rows_per_caption: 1,
    style: "compliance"
  },
  vocabularyDefaultIntensity: 0.4,
  vocabulary: [],
  spellingRules: [],
  keepTogetherPhrases: ["video file"],
  history: []
};

function storePath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function srtArchiveDir() {
  return path.join(app.getPath("userData"), "srt-archive");
}

function readSettings() {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    return mergeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

function mergeSettings(settings) {
  return {
    ...defaultSettings,
    ...settings,
    subtitleDefaults: {
      ...defaultSettings.subtitleDefaults,
      ...(settings.subtitleDefaults || {})
    },
    vocabulary: Array.isArray(settings.vocabulary) ? settings.vocabulary : [],
    spellingRules: Array.isArray(settings.spellingRules) ? settings.spellingRules : [],
    keepTogetherPhrases: Array.isArray(settings.keepTogetherPhrases) ? settings.keepTogetherPhrases : defaultSettings.keepTogetherPhrases,
    history: Array.isArray(settings.history) ? settings.history : []
  };
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(mergeSettings(settings), null, 2));
  return readSettings();
}

async function checkForRequiredUpdate() {
  const currentVersion = getCurrentVersion();
  const release = await fetchLatestRelease();
  if (!release.ok) {
    return {
      currentVersion,
      updateRequired: false,
      checkFailed: true,
      message: release.message,
      updateUrl: ""
    };
  }

  const latestVersion = normalizeVersion(release.tagName || release.name || "");
  const updateRequired = isVersionNewer(latestVersion, currentVersion);
  return {
    currentVersion,
    latestVersion,
    updateRequired,
    checkFailed: false,
    message: "",
    updateUrl: release.releaseUrl || RELEASES_PAGE_URL
  };
}

function getCurrentVersion() {
  return packageInfo.version || (app && app.getVersion ? app.getVersion() : "0.0.0");
}

async function fetchLatestRelease() {
  if (typeof fetch !== "function") {
    return { ok: false, message: "This version cannot check for updates automatically." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Subtitle-Generator"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, message: `Update check failed with GitHub status ${response.status}.` };
    }

    const release = await response.json();
    return {
      ok: true,
      tagName: release.tag_name,
      name: release.name,
      releaseUrl: release.html_url
    };
  } catch (error) {
    return { ok: false, message: `Update check failed: ${error.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

function isVersionNewer(candidate, current) {
  const candidateParts = normalizeVersion(candidate).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = normalizeVersion(current).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(candidateParts.length, currentParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] || 0;
    const currentPart = currentParts[index] || 0;
    if (candidatePart > currentPart) return true;
    if (candidatePart < currentPart) return false;
  }
  return false;
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function configureAutoUpdater() {
  if (!autoUpdater || autoUpdaterConfigured) return;
  autoUpdaterConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "BS-apps3244",
    repo: "subtitle-generator"
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateEvent({
      status: "downloading",
      percent: Math.round(progress.percent || 0)
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendUpdateEvent({ status: "installing" });
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 600);
  });

  autoUpdater.on("error", (error) => {
    sendUpdateEvent({
      status: "error",
      message: error.message || "Update failed."
    });
  });
}

function sendUpdateEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:event", payload);
  }
}

async function downloadAndInstallUpdate() {
  if (!autoUpdater || !app.isPackaged) {
    await shell.openExternal(RELEASES_PAGE_URL);
    return {
      started: false,
      message: "Automatic installation is available in the packaged app. Opening the release page instead."
    };
  }

  configureAutoUpdater();
  sendUpdateEvent({ status: "checking" });
  await autoUpdater.checkForUpdates();
  sendUpdateEvent({ status: "downloading", percent: 0 });
  await autoUpdater.downloadUpdate();
  return { started: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f7f5ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

if (app) {
app.whenReady().then(() => {
  configureAutoUpdater();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("settings:get", () => readSettings());

ipcMain.handle("settings:save", (_event, nextSettings) => {
  return writeSettings(nextSettings);
});

ipcMain.handle("app:version", () => getCurrentVersion());

ipcMain.handle("updates:check", async () => {
  return checkForRequiredUpdate();
});

ipcMain.handle("updates:download-and-install", async () => {
  return downloadAndInstallUpdate();
});

ipcMain.handle("updates:open-url", async (_event, updateUrl) => {
  if (!isSafeExternalUrl(updateUrl)) return false;
  await shell.openExternal(updateUrl);
  return true;
});

ipcMain.handle("files:pick-inputs", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose video or audio files",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Audio and Video",
        extensions: [
          "mp4", "mpeg", "mpg", "mpe", "mov", "m4v", "avi", "wmv", "webm", "mkv", "flv", "3gp", "3g2",
          "mp3", "wav", "aac", "m4a", "flac", "ogg", "oga", "opus", "wma", "aiff", "aif", "amr"
        ]
      },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("folders:pick-output", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose output folder",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("srt:save", async (_event, { filePath, outputFolder, srtText }) => {
  const baseName = `${path.parse(filePath).name}.srt`;
  const defaultFolder = outputFolder || path.dirname(filePath);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save SRT file",
    defaultPath: path.join(defaultFolder, baseName),
    filters: [
      { name: "SubRip Subtitle", extensions: ["srt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) return "";

  const outputPath = result.filePath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, srtText, "utf8");
  upsertHistorySrt(filePath, srtText, outputPath);
  return outputPath;
});

ipcMain.handle("srt:apply-rules", (_event, payload) => {
  const keepTogetherPhrases = buildKeepTogetherPhrases(payload);
  const updated = applySrtRules(
    payload.srtText || "",
    payload.subtitleDefaults || defaultSettings.subtitleDefaults,
    keepTogetherPhrases,
    payload.spellingRules || []
  );
  if (payload.filePath) upsertHistorySrt(payload.filePath, updated);
  return updated;
});

ipcMain.handle("history:clear", () => {
  const settings = readSettings();
  settings.history = [];
  return writeSettings(settings);
});

ipcMain.handle("history:load-srt", (_event, historyId) => {
  const settings = readSettings();
  const item = settings.history.find((entry) => entry.id === historyId);
  if (!item?.archivePath || !fs.existsSync(item.archivePath)) {
    throw new Error("This history item does not have a saved SRT preview.");
  }
  return {
    ...item,
    srtText: fs.readFileSync(item.archivePath, "utf8")
  };
});

ipcMain.handle("gladia:transcribe", async (_event, payload) => {
  const settings = readSettings();
  const provider = payload.transcriptionProvider || settings.transcriptionProvider || "local-whisper";
  if (provider === "local-whisper") {
    return transcribeWithLocalWhisper(payload, settings);
  }

  if (provider !== "gladia") {
    throw new Error(`Unknown transcription provider: ${provider}`);
  }

  const apiKey = payload.apiKey || settings.apiKey;

  if (!apiKey) {
    throw new Error("Add your Gladia API key in Settings before transcribing.");
  }

  const filePath = payload.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("The selected media file could not be found.");
  }

  emitJobProgress(filePath, "uploading", "Uploading media to Gladia");
  const upload = await uploadFile(apiKey, filePath);

  emitJobProgress(filePath, "transcribing", "Starting transcription");
  const job = await startTranscription(apiKey, upload.audio_url, payload);

  emitJobProgress(filePath, "transcribing", "Waiting for Gladia to finish");
  const result = await pollTranscription(apiKey, job.result_url || `${GLADIA_BASE_URL}/pre-recorded/${job.id}`, filePath);

  const keepTogetherPhrases = buildKeepTogetherPhrases(payload);
  const srtText = extractSrt(
    result,
    payload.subtitleDefaults,
    keepTogetherPhrases,
    payload.spellingRules || []
  );
  if (!srtText) {
    throw new Error("Gladia completed the job, but no SRT subtitle payload was returned.");
  }

  const archivePath = archiveSrt(job.id, path.basename(filePath), srtText);
  const updatedSettings = readSettings();
  const existingIndex = updatedSettings.history.findIndex((item) => item.id === job.id || item.filePath === filePath);
  const historyItem = {
    id: job.id,
    filePath,
    fileName: path.basename(filePath),
    createdAt: new Date().toISOString(),
    status: "done",
    duration: upload.audio_metadata?.audio_duration || null,
    archivePath,
    outputPath: ""
  };
  if (existingIndex >= 0) updatedSettings.history.splice(existingIndex, 1);
  updatedSettings.history.unshift(historyItem);
  updatedSettings.history = updatedSettings.history.slice(0, 100);
  writeSettings(updatedSettings);

  emitJobProgress(filePath, "review", "Ready to review and export");
  return {
    id: job.id,
    filePath,
    fileName: path.basename(filePath),
    srtText,
    raw: result
  };
});
}

async function transcribeWithLocalWhisper(payload, settings) {
  const filePath = payload.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("The selected media file could not be found.");
  }

  let whisperInputPath = filePath;
  let temporaryAudioPath = "";
  try {
    if (isVideoFile(filePath)) {
      emitJobProgress(filePath, "preparing", "Extracting audio from video");
      temporaryAudioPath = await convertVideoToAudio(filePath);
      whisperInputPath = temporaryAudioPath;
    }

    emitJobProgress(filePath, "transcribing", "Transcribing locally with Whisper");
    const rawSrt = await runLocalWhisper(whisperInputPath, payload);
  const keepTogetherPhrases = buildKeepTogetherPhrases(payload);
  const srtText = applySrtRules(
    rawSrt,
    payload.subtitleDefaults || settings.subtitleDefaults || defaultSettings.subtitleDefaults,
    keepTogetherPhrases,
    payload.spellingRules || settings.spellingRules || []
  );

  const id = `local-whisper-${Date.now()}`;
  const archivePath = archiveSrt(id, path.basename(filePath), srtText);
  const updatedSettings = readSettings();
  const existingIndex = updatedSettings.history.findIndex((item) => item.filePath === filePath);
  const historyItem = {
    id,
    filePath,
    fileName: path.basename(filePath),
    createdAt: new Date().toISOString(),
    status: "done",
    duration: null,
    archivePath,
    outputPath: "",
    provider: "local-whisper"
  };
  if (existingIndex >= 0) updatedSettings.history.splice(existingIndex, 1);
  updatedSettings.history.unshift(historyItem);
  updatedSettings.history = updatedSettings.history.slice(0, 100);
  writeSettings(updatedSettings);

  emitJobProgress(filePath, "review", "Ready to review and export");
  return {
    id,
    filePath,
    fileName: path.basename(filePath),
    srtText,
      raw: {
        provider: "local-whisper",
        normalizedInput: temporaryAudioPath ? "video-to-mp3" : "original"
      }
  };
  } finally {
    if (temporaryAudioPath) {
      fs.rmSync(temporaryAudioPath, { force: true });
    }
  }
}

function whisperResourceDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "whisper")
    : path.join(__dirname, "..", "vendor", "whisper");
}

function whisperCliPath() {
  return path.join(whisperResourceDir(), "bin", "Release", "whisper-cli.exe");
}

function whisperModelPath() {
  return path.join(whisperResourceDir(), LOCAL_WHISPER_MODEL_FILE);
}

function ffmpegResourceDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg")
    : path.join(__dirname, "..", "vendor", "ffmpeg");
}

function ffmpegPath() {
  return path.join(ffmpegResourceDir(), "bin", "ffmpeg.exe");
}

function isVideoFile(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).slice(1).toLowerCase());
}

function isAudioFile(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).slice(1).toLowerCase());
}

function convertVideoToAudio(filePath) {
  const exePath = ffmpegPath();
  if (!fs.existsSync(exePath)) {
    throw new Error("FFmpeg is missing from the app package. Reinstall the app, then try the video again.");
  }
  if (!isVideoFile(filePath) && !isAudioFile(filePath)) {
    throw new Error("The selected file is not a supported audio or video format.");
  }

  const outputPath = path.join(
    app.getPath("temp"),
    `subtitle-generator-audio-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`
  );
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", filePath,
    "-vn",
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", "16000",
    "-codec:a", "libmp3lame",
    "-b:a", "128k",
    outputPath
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      cwd: path.dirname(exePath),
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        fs.rmSync(outputPath, { force: true });
        reject(new Error(`Could not extract audio from this video: ${stderr.trim() || `FFmpeg exit code ${code}`}`));
        return;
      }
      resolve(outputPath);
    });
  });
}

function buildWhisperPrompt(payload) {
  const terms = new Set(["Based Supplies", "Tallow and Honey Balm"]);
  (payload.keepTogetherPhrases || []).forEach((phrase) => {
    if (phrase) terms.add(String(phrase).trim());
  });
  (payload.spellingRules || []).forEach((rule) => {
    if (rule.replacement) terms.add(String(rule.replacement).trim());
  });
  return Array.from(terms).filter(Boolean).join(", ");
}

function withDefaultSpellingRules(spellingRules = []) {
  const rules = [...DEFAULT_GLOSSARY_RULES];
  (spellingRules || []).forEach((rule) => {
    if (rule?.original && rule?.replacement) rules.push(rule);
  });
  return rules;
}

function runLocalWhisper(filePath, payload) {
  const exePath = whisperCliPath();
  const modelPath = whisperModelPath();
  if (!fs.existsSync(exePath)) {
    throw new Error("Local Whisper is missing from the app package.");
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error("Local Whisper model is missing from the app package.");
  }

  const outputBase = path.join(app.getPath("temp"), `subtitle-generator-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const args = [
    "-m", modelPath,
    "-f", filePath,
    "-osrt",
    "-of", outputBase,
    "-l", "en",
    "-t", String(Math.max(2, Math.min(8, require("os").cpus().length || 4))),
    "-np"
  ];
  const prompt = buildWhisperPrompt(payload);
  if (prompt) args.push("--prompt", prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      cwd: path.dirname(exePath),
      windowsHide: true
    });
    let stderr = "";
    let stdout = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Local Whisper failed: ${(stderr || stdout).trim() || `exit code ${code}`}`));
        return;
      }

      const srtPath = `${outputBase}.srt`;
      try {
        const srtText = fs.readFileSync(srtPath, "utf8");
        fs.rmSync(srtPath, { force: true });
        resolve(srtText);
      } catch (error) {
        reject(new Error(`Local Whisper finished but did not create an SRT file: ${error.message}`));
      }
    });
  });
}

async function uploadFile(apiKey, filePath) {
  const form = new FormData();
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer]);
  form.append("audio", blob, path.basename(filePath));

  const response = await fetch(`${GLADIA_BASE_URL}/upload`, {
    method: "POST",
    headers: { "x-gladia-key": apiKey },
    body: form
  });

  return parseResponse(response, "Gladia upload failed");
}

async function startTranscription(apiKey, audioUrl, payload) {
  const vocabulary = normalizeVocabulary(payload.vocabulary || []);
  const spellingRules = normalizeSpellingRules(withDefaultSpellingRules(payload.spellingRules || []));

  const body = {
    audio_url: audioUrl,
    language_config: {
      languages: [],
      code_switching: false
    },
    subtitles: true,
    subtitles_config: {
      formats: ["srt"],
      minimum_duration: Number(payload.subtitleDefaults.minimum_duration),
      maximum_duration: Number(payload.subtitleDefaults.maximum_duration),
      maximum_characters_per_row: Number(payload.subtitleDefaults.maximum_characters_per_row),
      maximum_rows_per_caption: Number(payload.subtitleDefaults.maximum_rows_per_caption),
      style: payload.subtitleDefaults.style
    },
    sentences: true,
    punctuation_enhanced: true,
    custom_metadata: {
      source_app: "subtitle-generator",
      source_filename: payload.filePath ? path.basename(payload.filePath) : undefined
    }
  };

  if (vocabulary.length > 0) {
    body.custom_vocabulary = true;
    body.custom_vocabulary_config = {
      vocabulary,
      default_intensity: Number(payload.vocabularyDefaultIntensity || 0.4)
    };
  }

  if (Object.keys(spellingRules).length > 0) {
    body.custom_spelling = true;
    body.custom_spelling_config = {
      spelling_dictionary: spellingRules
    };
  }

  const response = await fetch(`${GLADIA_BASE_URL}/pre-recorded`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-gladia-key": apiKey
    },
    body: JSON.stringify(body)
  });

  return parseResponse(response, "Gladia transcription start failed");
}

async function pollTranscription(apiKey, resultUrl, filePath) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(resultUrl, {
      headers: { "x-gladia-key": apiKey }
    });
    const json = await parseResponse(response, "Gladia transcription polling failed");
    const status = json.status || json.result?.status;

    if (status === "done") return json;
    if (status === "error" || status === "failed") {
      throw new Error(json.error || json.message || "Gladia reported a transcription failure.");
    }

    emitJobProgress(filePath, "transcribing", `Still working (${status || "queued"})`);
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for Gladia transcription.");
}

async function parseResponse(response, message) {
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${message}: ${json.message || json.error || response.statusText}`);
  }

  return json;
}

function archiveSrt(id, fileName, srtText) {
  fs.mkdirSync(srtArchiveDir(), { recursive: true });
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, "_");
  const archivePath = path.join(srtArchiveDir(), `${id}-${safeName}.srt`);
  fs.writeFileSync(archivePath, srtText, "utf8");
  return archivePath;
}

function upsertHistorySrt(filePath, srtText, outputPath = "") {
  if (!filePath || !srtText) return;
  const settings = readSettings();
  const item = settings.history.find((entry) => entry.filePath === filePath);
  const id = item?.id || `local-${Date.now()}`;
  const archivePath = item?.archivePath || archiveSrt(id, path.basename(filePath), srtText);
  fs.writeFileSync(archivePath, srtText, "utf8");

  if (item) {
    item.archivePath = archivePath;
    if (outputPath) item.outputPath = outputPath;
    item.updatedAt = new Date().toISOString();
  } else {
    settings.history.unshift({
      id,
      filePath,
      fileName: path.basename(filePath),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "done",
      duration: null,
      archivePath,
      outputPath
    });
  }

  settings.history = settings.history.slice(0, 100);
  writeSettings(settings);
}

function extractSrt(result, subtitleDefaults, keepTogetherPhrases, spellingRules = []) {
  const sentences = extractGladiaSentences(result);
  if (sentences.length > 0) {
    return buildSrtFromSentences(sentences, subtitleDefaults, keepTogetherPhrases, spellingRules);
  }

  const utterances = result.result?.transcription?.utterances || result.transcription?.utterances || [];
  if (Array.isArray(utterances) && utterances.length > 0) {
    return buildSrtFromUtterances(utterances, subtitleDefaults, keepTogetherPhrases, spellingRules);
  }

  const candidates = [
    result.result?.transcription?.subtitles,
    result.result?.subtitles,
    result.transcription?.subtitles,
    result.subtitles,
    ...(result.result?.translation?.results || []).map((translation) => translation?.subtitles),
    result.result?.translation?.subtitles
  ].filter(Array.isArray);

  for (const subtitles of candidates) {
    const srt = subtitles.find((item) => item.format === "srt");
    if (srt?.subtitles) {
      return postProcessSrtText(srt.subtitles, keepTogetherPhrases, subtitleDefaults, spellingRules);
    }
  }

  return "";
}

function extractGladiaSentences(result) {
  const candidates = [
    result.result?.transcription?.sentences?.results,
    result.result?.transcription?.sentences,
    result.result?.sentences?.results,
    result.result?.sentences,
    result.transcription?.sentences?.results,
    result.transcription?.sentences,
    result.sentences?.results,
    result.sentences
  ];

  return candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0) || [];
}

function buildSrtFromSentences(sentences, subtitleDefaults, keepTogetherPhrases, spellingRules = []) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  const cues = sentences.flatMap((sentence) => {
    const words = flattenSentenceWords(sentence, spellingRules);
    const sentenceCues = words.length > 0
      ? buildOptimizedCuesFromWords(words, settings, keepTogetherPhrases)
      : buildCuesFromSentenceText(sentence, settings, spellingRules);
    return repairTimedCues(sentenceCues, settings, keepTogetherPhrases);
  });

  const dedupedCues = srtCueObjectsToTimedCues(removeDuplicateSingleWordCues(timedCuesToSrtCueObjects(cues)));
  const adjustedCues = applyCaptionGaps(enforceMinimumDuration(dedupedCues, settings), settings);
  return formatTimedCues(adjustedCues, settings);
}

function buildSrtFromUtterances(utterances, subtitleDefaults, keepTogetherPhrases, spellingRules = []) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  const words = flattenWords(utterances, spellingRules);
  const cues = words.length > 0
    ? buildOptimizedCuesFromWords(words, settings, keepTogetherPhrases)
    : buildCuesFromUtteranceText(utterances, settings, spellingRules);

  const repairedCues = words.length > 0 ? repairTimedCues(cues, settings, keepTogetherPhrases) : cues;
  const adjustedCues = applyCaptionGaps(enforceMinimumDuration(mergeSingleWordCues(repairedCues), settings), settings);
  return formatTimedCues(adjustedCues, settings);
}

function formatTimedCues(cues, settings) {
  return cues.map((cue, index) => {
    const lines = wrapSubtitleText(formatSubtitleForExport(cue.text), settings.maximumCharactersPerRow, settings.maximumRowsPerCaption);
    return `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${lines}`;
  }).join("\n\n");
}

function normalizeSubtitleSettings(subtitleDefaults) {
  const maximumCharactersPerRow = Number(subtitleDefaults.maximum_characters_per_row || 42);
  const maximumRowsPerCaption = Number(subtitleDefaults.maximum_rows_per_caption || 2);
  return {
    minimumDuration: Number(subtitleDefaults.minimum_duration || 0.6),
    targetDuration: Number(subtitleDefaults.target_duration || 1.2),
    maximumDuration: Number(subtitleDefaults.maximum_duration || 2),
    captionGap: Number(subtitleDefaults.caption_gap || 0),
    splitOnSilenceGap: Number(subtitleDefaults.split_on_silence_gap || 0.35),
    targetCharactersPerCaption: maximumCharactersPerRow * maximumRowsPerCaption,
    maximumCharactersPerRow,
    maximumRowsPerCaption
  };
}

function flattenSentenceWords(sentence, spellingRules = []) {
  if (!Array.isArray(sentence?.words)) return [];
  const sentenceStart = Number(sentence.start ?? 0);
  const sentenceEnd = Number(sentence.end ?? sentenceStart);
  return sentence.words.map((word) => ({
    text: cleanWord(applyLocalSpellingRules(word.punctuated_word || word.word || word.text || "", spellingRules)),
    start: Number(word.start ?? sentenceStart),
    end: Number(word.end ?? word.start ?? sentenceEnd ?? sentenceStart)
  })).filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
}

function flattenWords(utterances, spellingRules = []) {
  return utterances.flatMap((utterance) => {
    if (!Array.isArray(utterance.words)) return [];
    return utterance.words.map((word) => ({
      text: cleanWord(applyLocalSpellingRules(word.punctuated_word || word.word || word.text || "", spellingRules)),
      start: Number(word.start ?? utterance.start ?? 0),
      end: Number(word.end ?? utterance.end ?? word.start ?? utterance.start ?? 0)
    }));
  }).filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
}

function buildOptimizedCuesFromWords(words, settings, keepTogetherPhrases) {
  const count = words.length;
  const costs = Array(count + 1).fill(Number.POSITIVE_INFINITY);
  const nextBreaks = Array(count + 1).fill(0);
  costs[count] = 0;

  for (let startIndex = count - 1; startIndex >= 0; startIndex -= 1) {
    const candidates = candidateCueEnds(words, startIndex, settings);
    const unprotectedCandidates = candidates.filter((endIndex) => (
      endIndex >= count - 1 || (
        !wouldBreakProtectedPhraseAt(words, endIndex, keepTogetherPhrases)
        && !hasDanglingFunctionPhrase(
          words.slice(startIndex, endIndex + 1).map((word) => word.text),
          words.slice(endIndex + 1, Math.min(words.length, endIndex + 5)).map((word) => word.text)
        )
      )
    ));
    (unprotectedCandidates.length > 0 ? unprotectedCandidates : candidates).forEach((endIndex) => {
      const cost = scoreCueCandidate(words, startIndex, endIndex, settings, keepTogetherPhrases) + costs[endIndex + 1];
      if (cost < costs[startIndex]) {
        costs[startIndex] = cost;
        nextBreaks[startIndex] = endIndex + 1;
      }
    });
  }

  const cues = [];
  for (let index = 0; index < count;) {
    const nextIndex = nextBreaks[index] > index ? nextBreaks[index] : Math.min(count, index + 1);
    cues.push(wordsToCue(words.slice(index, nextIndex)));
    index = nextIndex;
  }

  return cues;
}

function optimizeSrtCaptionWindows(cues, settings, keepTogetherPhrases) {
  if (settings.maximumRowsPerCaption !== 1) return cues;

  const optimized = [];
  let window = [];

  const flushWindow = () => {
    if (window.length === 0) return;
    optimized.push(...optimizeSrtCaptionWindow(window, settings, keepTogetherPhrases));
    window = [];
  };

  cues.forEach((cue) => {
    if (!cue?.text) return;
    if (shouldStartNewCaptionWindow(window, cue)) flushWindow();
    window.push(cue);
    if (cue.sentenceEnd || shouldFlushCaptionWindow(window, settings)) {
      flushWindow();
    }
  });
  flushWindow();

  return optimized;
}

function shouldStartNewCaptionWindow(window, nextCue) {
  if (window.length === 0) return false;
  const previousWords = tokenList(window[window.length - 1].text);
  const nextWords = tokenList(nextCue.text);
  if (previousWords.length === 0 || nextWords.length === 0) return false;
  const previousEndPenalty = badEndCategoryPenalty(normalizeToken(previousWords[previousWords.length - 1]));
  if (isStrongSentenceBoundary(previousWords, nextWords) && !isConjunction(normalizeToken(previousWords[previousWords.length - 1]))) return true;
  return startsUppercase(nextWords[0])
    && isLikelySentenceStart({ text: nextWords[0] })
    && previousEndPenalty < 180;
}

function shouldFlushCaptionWindow(window, settings) {
  const firstTiming = window[0]?.timing || "";
  const lastTiming = window[window.length - 1]?.timing || "";
  const start = parseSrtTime(firstTiming.split("-->")[0]?.trim());
  const end = parseSrtTime(lastTiming.split("-->")[1]?.trim());
  const text = window.map((cue) => cue.text).join(" ");
  return (Number.isFinite(start) && Number.isFinite(end) && end - start >= settings.maximumDuration * 2.5)
    || text.length >= settings.maximumCharactersPerRow * Math.max(3, settings.maximumRowsPerCaption + 2);
}

function optimizeSrtCaptionWindow(cues, settings, keepTogetherPhrases) {
  if (cues.length === 1 && cues[0].text.length <= settings.maximumCharactersPerRow * settings.maximumRowsPerCaption) {
    return cues;
  }

  const words = approximateTimedWordsFromSrtCues(cues);
  if (words.length < 3) return cues;

  return timedCuesToSrtCueObjects(buildOptimizedCuesFromWords(words, settings, keepTogetherPhrases));
}

function approximateTimedWordsFromSrtCues(cues) {
  return cues.flatMap((cue) => {
    const [startText, endText] = cue.timing.split("-->").map((part) => part.trim());
    const start = parseSrtTime(startText);
    const end = parseSrtTime(endText);
    const words = tokenList(cue.text);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || words.length === 0) return [];

    const totalWeight = words.reduce((sum, word) => sum + Math.max(1, word.length), 0);
    let cursor = start;
    return words.map((word, index) => {
      const isLast = index === words.length - 1;
      const share = Math.max(1, word.length) / totalWeight;
      const wordEnd = isLast ? end : cursor + ((end - start) * share);
      const timedWord = {
        text: word,
        start: cursor,
        end: Math.max(cursor + 0.03, wordEnd)
      };
      cursor = wordEnd;
      return timedWord;
    });
  });
}

function repairTimedCues(cues, settings, keepTogetherPhrases) {
  return srtCueObjectsToTimedCues(repairSrtCuesUntilStable(timedCuesToSrtCueObjects(cues), settings, keepTogetherPhrases));
}

function timedCuesToSrtCueObjects(cues) {
  return cues.map((cue) => ({
    timing: `${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}`,
    text: cue.text
  }));
}

function srtCueObjectsToTimedCues(cues) {
  return cues.map((cue) => {
    const [startText, endText] = cue.timing.split("-->").map((part) => part.trim());
    return {
      start: parseSrtTime(startText),
      end: parseSrtTime(endText),
      text: cue.text
    };
  }).filter((cue) => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.end));
}

function candidateCueEnds(words, startIndex, settings) {
  const ends = [];
  const hardDurationLimit = Math.max(settings.maximumDuration * 1.8, settings.targetDuration * 3, settings.minimumDuration + 0.5);
  const maxWordsPerCue = Math.max(4, Math.ceil(settings.targetCharactersPerCaption / 3));
  let lastVisualFitEnd = startIndex;

  for (let endIndex = startIndex; endIndex < words.length; endIndex += 1) {
    const duration = words[endIndex].end - words[startIndex].start;
    const wordCount = endIndex - startIndex + 1;
    const text = wordsToText(words.slice(startIndex, endIndex + 1));
    const fitsVisualRow = settings.maximumRowsPerCaption !== 1 || text.length <= settings.maximumCharactersPerRow;
    if (fitsVisualRow) lastVisualFitEnd = endIndex;
    if (!fitsVisualRow && endIndex > startIndex) {
      if (ends.length === 0) ends.push(lastVisualFitEnd);
      break;
    }
    if (wordCount > maxWordsPerCue && duration > settings.targetDuration) break;
    if (duration > hardDurationLimit && wordCount > 1) break;
    ends.push(endIndex);
    if (endsSentence(words[endIndex].text) && duration >= settings.minimumDuration) break;
  }

  return ends.length > 0 ? ends : [startIndex];
}

function scoreCueCandidate(words, startIndex, endIndex, settings, keepTogetherPhrases) {
  const cueWords = words.slice(startIndex, endIndex + 1);
  const nextWords = words.slice(endIndex + 1, Math.min(words.length, endIndex + 8));
  const cueTextWords = cueWords.map((word) => word.text);
  const nextTextWords = nextWords.map((word) => word.text);
  const text = wordsToText(cueWords);
  const duration = words[endIndex].end - words[startIndex].start;
  const endWord = normalizeToken(words[endIndex].text);
  const nextWord = normalizeToken(words[endIndex + 1]?.text || "");
  const nextRawWord = words[endIndex + 1]?.text || "";
  let score = 180;

  score += Math.abs(duration - settings.targetDuration) * 55;
  if (duration < settings.minimumDuration) score += (settings.minimumDuration - duration) * 180;
  if (duration > settings.maximumDuration) score += (duration - settings.maximumDuration) * 90;
  score += characterTargetPenalty(text.length, settings) * 22;
  if (settings.maximumRowsPerCaption === 1 && text.length > settings.maximumCharactersPerRow) {
    score += 5000 + ((text.length - settings.maximumCharactersPerRow) * 120);
  }

  if (cueWords.length === 1) score += 450;
  if (cueWords.length === 2 && endIndex + 1 < words.length) score += 120;
  if (wouldBreakProtectedPhraseAt(words, endIndex, keepTogetherPhrases)) score += 1200;
  if (isNumberLike(endWord) && UNIT_WORDS.has(nextWord)) score += 1200;
  if (UNIT_WORDS.has(endWord) && isNumberTerm(nextWord)) score += 1200;
  if (hasLowercaseContinuationBreak(cueTextWords, nextTextWords)) score += 900;
  if (hasIncompleteVerbPhraseBeforeObject(cueTextWords, nextTextWords)) score += 1000;
  if (hasDanglingFunctionPhrase(cueTextWords, nextTextWords)) score += 1400;
  if (hasIncompleteOpenerFragment(cueTextWords, nextTextWords)) score += 900;
  if (hasSplitCapitalizedNounPhraseBeforePredicate(cueTextWords, nextTextWords)) score += 1000;

  score += badEndCategoryPenalty(endWord);
  score += badStartCategoryPenalty(nextWord);
  if (WEAK_END_WORDS.has(endWord)) score += 80;
  if (/[,:;]$/.test(words[endIndex].text)) score += 120;
  if (endsSentence(text)) score -= 260;
  if (/[!?]$/.test(words[endIndex].text)) score -= 80;
  if (isLikelySentenceStart(words[endIndex + 1]) && duration >= settings.minimumDuration && badEndCategoryPenalty(endWord) < 120) score -= 190;
  if (startsLowercase(nextRawWord) && !isLowercaseSentenceLikeStart(nextWord, normalizeToken(words[endIndex + 2]?.text || ""))) score += 220;
  if (splitTextAtLikelySentenceStarts(text).length > 1) score += 5000;

  return score;
}

function chooseNaturalCueEnd(words, startIndex, settings, keepTogetherPhrases) {
  let hardEnd = startIndex;
  for (let index = startIndex; index < words.length; index += 1) {
    const segment = words.slice(startIndex, index + 1);
    const text = wordsToText(segment);
    const duration = words[index].end - words[startIndex].start;
    const nextWord = words[index + 1];
    const silenceGap = nextWord ? nextWord.start - words[index].end : 0;

    hardEnd = index;
    if (endsSentence(text)) return index;
    if (isLikelySentenceStart(nextWord) && duration >= settings.minimumDuration) {
      return avoidBadFinalBreak(words, startIndex, index, keepTogetherPhrases);
    }
    if (shouldSplitOnSilence(silenceGap, duration, settings)) return avoidBadFinalBreak(words, startIndex, index, keepTogetherPhrases);
    if (duration > settings.maximumDuration) break;
  }

  const minCandidateEnd = Math.min(words.length - 1, startIndex + 1);
  const candidateEnd = Math.max(minCandidateEnd, hardEnd);
  const targetEnd = findTargetEnd(words, startIndex, candidateEnd, settings);
  const bestEnd = chooseBestBreak(words, startIndex, targetEnd, candidateEnd, settings, keepTogetherPhrases);
  return Math.max(minCandidateEnd, bestEnd);
}

function shouldSplitOnSilence(silenceGap, duration, settings) {
  return silenceGap > settings.splitOnSilenceGap && duration >= settings.targetDuration;
}

function findTargetEnd(words, startIndex, candidateEnd, settings) {
  for (let index = startIndex + 1; index <= candidateEnd; index += 1) {
    const duration = words[index].end - words[startIndex].start;
    if (duration >= settings.targetDuration) return index;
  }
  return candidateEnd;
}

function chooseBestBreak(words, startIndex, targetEnd, candidateEnd, settings, keepTogetherPhrases) {
  const windowStart = Math.max(startIndex + 1, targetEnd - 4);
  const windowEnd = Math.min(candidateEnd, targetEnd + 4);
  let best = targetEnd;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let endIndex = windowStart; endIndex <= windowEnd; endIndex += 1) {
    const score = scoreBreak(words, startIndex, endIndex, targetEnd, settings, keepTogetherPhrases);
    if (score < bestScore) {
      bestScore = score;
      best = endIndex;
    }
  }

  return avoidBadFinalBreak(words, startIndex, best, keepTogetherPhrases);
}

function scoreBreak(words, startIndex, endIndex, targetEnd, settings, keepTogetherPhrases) {
  const segment = words.slice(startIndex, endIndex + 1);
  const text = wordsToText(segment);
  const endWord = normalizeToken(words[endIndex].text);
  const nextWord = normalizeToken(words[endIndex + 1]?.text || "");
  const previousWord = normalizeToken(words[endIndex - 1]?.text || "");
  const duration = words[endIndex].end - words[startIndex].start;
  let score = Math.abs(endIndex - targetEnd) * 4;

  if (wouldBreakProtectedPhraseAt(words, endIndex, keepTogetherPhrases)) score += 1000;
  if (hasDanglingFunctionPhrase(segment.map((word) => word.text), words.slice(endIndex + 1, endIndex + 5).map((word) => word.text))) score += 1200;
  if (countWords(text) < 2) score += 500;
  if (endsSentence(text)) score -= 80;
  if (/[,:;]$/.test(words[endIndex].text)) score += 120;
  score += badEndCategoryPenalty(endWord);
  score += badStartCategoryPenalty(nextWord);
  if (PAIR_START_WORDS.has(endWord)) score += 75;
  if (PAIR_END_WORDS.has(nextWord)) score += 60;
  if (isNumberLike(endWord) && nextWord) score += 70;
  if (isNumberLike(endWord) && UNIT_WORDS.has(nextWord)) score += 1000;
  if (isNumberLike(previousWord) && UNIT_WORDS.has(endWord)) score -= 20;
  if (isLikelySentenceStart(words[endIndex + 1]) && duration >= settings.minimumDuration) score -= 160;
  if (duration < settings.minimumDuration) score += 30;
  score += characterTargetPenalty(text.length, settings) * 2;

  return score;
}

function badEndCategoryPenalty(token) {
  if (!token) return 0;
  if (isDeterminer(token)) return 260;
  if (SUBJECT_PRONOUNS.has(token) && token !== "it") return 180;
  if (isConjunction(token)) return 480;
  if (isPreposition(token)) return 300;
  if (isPhrasalVerbParticle(token)) return 170;
  if (isAuxiliary(token)) return 130;
  if (isSubordinatingConjunction(token)) return 130;
  if (isAdverbLike(token)) return 100;
  if (isProgressiveVerbLike(token)) return 90;
  if (NEGATIONS.has(token) || DEGREE_MODIFIERS.has(token)) return 110;
  return 0;
}

function badStartCategoryPenalty(token) {
  if (!token) return 0;
  if (isConjunction(token)) return 220;
  if (isDeterminer(token)) return 190;
  if (isPreposition(token)) return 200;
  if (isPhrasalVerbParticle(token)) return 190;
  if (isAuxiliary(token)) return 120;
  if (isSubordinatingConjunction(token)) return 120;
  if (SUBJECT_PRONOUNS.has(token) || OBJECT_PRONOUNS.has(token)) return 120;
  return 0;
}

function characterTargetPenalty(length, settings) {
  const target = settings.targetCharactersPerCaption;
  if (!target) return 0;
  return Math.abs(length - target) / target;
}

function isDeterminer(token) {
  return ARTICLES.has(token) || QUANTIFIER_DETERMINERS.has(token) || POSSESSIVE_DETERMINERS.has(token) || DEMONSTRATIVE_DETERMINERS.has(token);
}

function isConjunction(token) {
  return COORDINATING_CONJUNCTIONS.has(token);
}

function isSubordinatingConjunction(token) {
  return SUBORDINATING_CONJUNCTIONS.has(token);
}

function isPreposition(token) {
  return PREPOSITIONS.has(token);
}

function isPhrasalVerbParticle(token) {
  return PHRASAL_VERB_PARTICLES.has(token);
}

function isAuxiliary(token) {
  return AUXILIARY_VERBS.has(token);
}

function isAdverbLike(token) {
  return /^[a-z]+ly$/.test(token);
}

function isProgressiveVerbLike(token) {
  return /^[a-z]{4,}ing$/.test(token);
}

function isLikelySentenceStart(word) {
  if (!word?.text || !startsUppercase(word.text)) return false;
  const token = normalizeToken(word.text);
  return SUBJECT_PRONOUNS.has(token)
    || CAPITALIZED_NUMBER_TERMS.has(word.text)
    || SENTENCE_START_CONTRACTIONS.has(token)
    || QUESTION_SENTENCE_STARTS.has(token)
    || DISCOURSE_SENTENCE_STARTS.has(token)
    || TEMPORAL_SENTENCE_STARTS.has(token)
    || isSubordinatingConjunction(token)
    || NEGATIONS.has(token)
    || isDeterminer(token)
    || DEMONSTRATIVE_DETERMINERS.has(token)
    || CLAUSE_SUBJECT_STARTS.has(token)
    || IMPERATIVE_START_VERBS.has(token);
}

function containsLikelySentenceStartAfterFirst(words) {
  return words.slice(1).some((word) => isLikelySentenceStart({ text: word }));
}

function avoidBadFinalBreak(words, startIndex, endIndex, keepTogetherPhrases) {
  let safeEnd = Math.max(startIndex + 1, endIndex);
  while (safeEnd > startIndex + 1 && isBadBreak(words, safeEnd, keepTogetherPhrases)) {
    safeEnd -= 1;
  }
  if (isBadBreak(words, safeEnd, keepTogetherPhrases) && safeEnd + 1 < words.length) {
    safeEnd += 1;
  }
  return safeEnd;
}

function isBadBreak(words, endIndex, keepTogetherPhrases) {
  const endWord = normalizeToken(words[endIndex]?.text || "");
  const nextWord = normalizeToken(words[endIndex + 1]?.text || "");
  return badEndCategoryPenalty(endWord) >= 180
    || badStartCategoryPenalty(nextWord) >= 180
    || /[,:;]$/.test(words[endIndex]?.text || "")
    || wouldBreakProtectedPhraseAt(words, endIndex, keepTogetherPhrases);
}

function wordsToCue(words) {
  return {
    start: words[0].start,
    end: Math.max(words[words.length - 1].end, words[0].start + 0.1),
    text: wordsToText(words)
  };
}

function wordsToText(words) {
  return words.map((word) => word.text).join(" ").trim();
}

function buildCuesFromSentenceText(sentence, settings, spellingRules = []) {
  const start = Number(sentence.start || 0);
  const end = Number(sentence.end || start);
  const text = applyLocalSpellingRules(sentence.sentence || sentence.text || sentence.transcript || "", spellingRules);
  return [{
    start,
    end: Math.min(end, start + settings.maximumDuration),
    text: cleanWord(text)
  }].filter((cue) => cue.text);
}

function buildCuesFromUtteranceText(utterances, settings, spellingRules = []) {
  return utterances.map((utterance) => ({
    start: Number(utterance.start || 0),
    end: Math.min(Number(utterance.end || 0), Number(utterance.start || 0) + settings.maximumDuration),
    text: cleanWord(applyLocalSpellingRules(utterance.text || "", spellingRules))
  })).filter((cue) => cue.text);
}

function startCue(word) {
  return {
    start: word.start,
    end: Math.max(word.end, word.start + 0.1),
    text: word.text
  };
}

function enforceMinimumDuration(cues, settings) {
  return cues.map((cue, index) => {
    const nextCue = cues[index + 1];
    const minimumEnd = cue.start + settings.minimumDuration;
    const maximumEnd = cue.start + settings.maximumDuration;
    const nextStartLimit = nextCue ? nextCue.start - settings.captionGap : Infinity;
    const desiredEnd = Math.max(cue.end, minimumEnd);
    const limit = Math.min(maximumEnd, nextStartLimit);
    return {
      ...cue,
      end: Math.max(cue.start + 0.1, Math.min(desiredEnd, limit))
    };
  });
}

function applyCaptionGaps(cues, settings) {
  return cues.map((cue, index) => {
    const nextCue = cues[index + 1];
    if (!nextCue) return cue;

    return {
      ...cue,
      end: Math.max(cue.start + 0.1, nextCue.start - settings.captionGap)
    };
  });
}

function mergeSingleWordCues(cues) {
  return cues.reduce((merged, cue, index) => {
    if (countWords(cue.text) !== 1) {
      merged.push(cue);
      return merged;
    }

    const previous = merged[merged.length - 1];
    if (previous && !endsSentence(previous.text) && !endsSentence(cue.text)) {
      previous.text = `${previous.text} ${cue.text}`.trim();
      previous.end = cue.end;
      return merged;
    }

    const nextCue = cues[index + 1];
    if (nextCue && !endsSentence(cue.text)) {
      nextCue.text = `${cue.text} ${nextCue.text}`.trim();
      nextCue.start = cue.start;
      return merged;
    }

    merged.push(cue);
    return merged;
  }, []);
}

function cleanWord(word) {
  return cleanSubtitleText(word);
}

function cleanSubtitleText(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function formatSubtitleForExport(text) {
  return cleanSubtitleText(text)
    .replace(/\./g, "")
    .replace(/,+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function postProcessSrtText(
  srtText,
  keepTogetherPhrases,
  subtitleDefaults = defaultSettings.subtitleDefaults,
  spellingRules = []
) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  return formatSrtCues(postProcessSrtCues(srtText, keepTogetherPhrases, subtitleDefaults, spellingRules), settings);
}

function applySrtRules(srtText, subtitleDefaults, keepTogetherPhrases, spellingRules = []) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  return formatSrtCues(applyCaptionGapsToSrtCues(
    postProcessSrtCues(srtText, keepTogetherPhrases, subtitleDefaults, spellingRules),
    settings
  ), settings);
}

function postProcessSrtCues(srtText, keepTogetherPhrases, subtitleDefaults, spellingRules = []) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  const cleanedCues = mergeProtectedPhraseSrtCues(mergeSingleWordSrtCues(splitSrtAtSentenceBoundaries(srtText)), keepTogetherPhrases)
    .map((cue) => ({
      ...cue,
      text: cleanSubtitleText(applyLocalSpellingRules(cue.text, spellingRules))
        .trim()
    }))
    .filter((cue) => cue.text);

  const optimizedCues = optimizeSrtCaptionWindows(cleanedCues, settings, keepTogetherPhrases);
  const commaAdjustedCues = moveLeadingCommaWordsToPreviousCue(optimizedCues, findLeadingCommaWordIssues(optimizedCues));
  const smoothedCues = smoothAwkwardSrtBreaks(mergeSingleWordSrtCues(commaAdjustedCues), settings, keepTogetherPhrases).map((cue) => ({
    ...cue,
    text: cleanSubtitleText(applyLocalSpellingRules(cue.text, spellingRules))
        .trim()
  })).filter((cue) => cue.text);
  const repairedCues = repairSrtCuesUntilStable(optimizeSrtCaptionWindows(smoothedCues, settings, keepTogetherPhrases), settings, keepTogetherPhrases);
  const grammarRepairedCues = repairLeadingPrepositionBeforeSentenceStartCues(repairDanglingFunctionPhraseCues(repairedCues, settings), settings);
  const finalOptimizedCues = optimizeSrtCaptionWindows(grammarRepairedCues, settings, keepTogetherPhrases);
  const finalGrammarRepairedCues = repairLeadingPrepositionBeforeSentenceStartCues(finalOptimizedCues, settings);
  return splitCuesAtLikelySentenceStarts(finalGrammarRepairedCues, keepTogetherPhrases);
}

function applyLocalSpellingRules(text, spellingRules) {
  return withDefaultSpellingRules(spellingRules).reduce((updated, rule) => {
    const original = (rule.original || "").trim();
    const replacement = (rule.replacement || "").trim();
    if (!original || !replacement) return updated;
    return updated.replace(new RegExp(escapeRegExp(original), "gi"), (match) => {
      return startsUppercase(match) ? capitalizeFirst(replacement) : replacement;
    });
  }, normalizeGenericTallowCasing(text));
}

function capitalizeFirst(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function normalizeGenericTallowCasing(text) {
  return GENERIC_LOWERCASE_TERMS.reduce((updated, term) => {
    return updated.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "g"), term.toLowerCase());
  }, String(text));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyCaptionGapsToSrtCues(cues, settings) {
  return cues.map((cue, index) => {
    const nextCue = cues[index + 1];
    if (!nextCue) return cue;
    const start = parseSrtTime(cue.timing.split("-->")[0].trim());
    const nextStart = parseSrtTime(nextCue.timing.split("-->")[0].trim());
    if (!Number.isFinite(start) || !Number.isFinite(nextStart)) return cue;
    const end = Math.max(start + 0.1, nextStart - settings.captionGap);
    return {
      ...cue,
      timing: `${formatSrtTime(start)} --> ${formatSrtTime(end)}`
    };
  });
}

function repairSrtCuesUntilStable(cues, settings, keepTogetherPhrases) {
  let repaired = normalizeSrtCueText(cues);

  for (let pass = 0; pass < MAX_SRT_REPAIR_PASSES; pass += 1) {
    const issues = findSubtitleIssues(repaired, settings, keepTogetherPhrases);
    if (issues.length === 0) return splitLongSrtCues(repaired, settings, keepTogetherPhrases);

    const next = repairSubtitleIssues(repaired, issues, settings, keepTogetherPhrases);
    if (srtCueSignature(next) === srtCueSignature(repaired)) return splitLongSrtCues(repaired, settings, keepTogetherPhrases);
    repaired = next;
  }

  return splitLongSrtCues(repaired, settings, keepTogetherPhrases);
}

function normalizeSrtCueText(cues) {
  return cues.map((cue) => ({
    ...cue,
    text: cleanSubtitleText(cue.text)
      .trim()
  })).filter((cue) => cue.text);
}

function findSubtitleIssues(cues, settings, keepTogetherPhrases) {
  return cues.flatMap((cue, index) => {
    const issues = [];
    const words = tokenList(cue.text);
    const endWord = normalizeToken(words[words.length - 1] || "");
    const startWord = normalizeToken(words[0] || "");
    const nextCue = cues[index + 1];
    const nextWords = tokenList(nextCue?.text || "");
    const nextStart = normalizeToken(nextWords[0] || "");
    const canMergeNext = canMergeCueWithNext(cue, nextCue, settings);

    if (splitTextAtLikelySentenceStarts(cue.text).length > 1) {
      issues.push({ type: "missing-sentence-split", index });
    }
    if (index > 0 && startsWithCommaWord(cue.text)) {
      issues.push({ type: "leading-comma-word", index });
    }
    if (index > 0 && hasLeadingDanglingWordsBeforeSentenceStart(words)) {
      issues.push({ type: "leading-dangling-before-sentence", index });
    }
	    if (index < cues.length - 1 && canMergeNext && isBadShortMidCue(cue.text)) {
	      issues.push({ type: "short-mid-cue", index });
	    }
	    if (isDuplicateSingleWordCue(cue, cues[index - 1], nextCue)) {
	      issues.push({ type: "duplicate-single-word-cue", index });
	    }
	    if (index < cues.length - 1 && shouldRebalanceSrtPair(cue, nextCue)) {
	      issues.push({ type: "awkward-pair-split", index });
	    }
	    if (index < cues.length - 1 && canMergeNext && isQaBadEnd(endWord)) {
	      issues.push({ type: "bad-end-category", index });
	    }
    if (index < cues.length - 1 && canMergeNext && hasIncompleteVerbPhraseBeforeObject(words, nextWords)) {
      issues.push({ type: "incomplete-verb-phrase", index });
    }
    if (index < cues.length - 1 && canMergeNext && hasIncompleteOpenerFragment(words, nextWords)) {
      issues.push({ type: "incomplete-opener-fragment", index });
    }
    if (index < cues.length - 1 && canMergeNext && hasSplitTimeOrMeasurementPhrase(words, nextWords)) {
      issues.push({ type: "split-time-measurement", index });
    }
    if (index < cues.length - 1 && canMergeNext && hasSplitCapitalizedNounPhraseBeforePredicate(words, nextWords)) {
      issues.push({ type: "split-capitalized-noun-phrase", index });
    }
    if (index < cues.length - 1 && canMergeNext && hasLowercaseContinuationBreak(words, nextWords)) {
      issues.push({ type: "lowercase-continuation", index });
    }
    if (index > 0 && hasBadCueStart(words)) {
      issues.push({ type: "bad-start-category", index });
    }
    if (index < cues.length - 1 && isNumberLike(endWord) && UNIT_WORDS.has(nextStart)) {
      issues.push({ type: "number-unit-split", index });
    }
    if (index < cues.length - 1 && endsWithProtectedPhraseStart(cue.text, nextCue?.text || "", keepTogetherPhrases)) {
      issues.push({ type: "protected-phrase-split", index });
    }
    if (settings.maximumRowsPerCaption === 1 && String(cue.text).includes("\n")) {
      issues.push({ type: "row-count", index });
    }

    return issues;
  });
}

function canMergeCueWithNext(cue, nextCue, settings) {
  if (!nextCue) return false;
  if (settings.maximumRowsPerCaption !== 1) return true;
  return cleanSubtitleText(`${cue.text} ${nextCue.text}`).length <= settings.maximumCharactersPerRow;
}

function findLeadingCommaWordIssues(cues) {
  return cues.flatMap((cue, index) => (
    index > 0 && startsWithCommaWord(cue.text)
      ? [{ type: "leading-comma-word", index }]
      : []
  ));
}

function hasLeadingDanglingWordsBeforeSentenceStart(words) {
  if (words.length < 3) return false;
  return [1, 2].some((index) => index < words.length - 1 && shouldStartNewSentencePiece(words, index));
}

function startsWithCommaWord(text) {
  const firstWord = tokenList(text)[0] || "";
  return /^[A-Za-z0-9]+,$/.test(firstWord);
}

function isBadShortMidCue(text) {
  const words = tokenList(text);
  if (words.length === 0 || words.length > 2) return false;
  const first = normalizeToken(words[0]);
  const last = normalizeToken(words[words.length - 1]);
  if (isQaBadStart(first) || isQaBadEnd(last)) return true;
  if (TEMPORAL_SENTENCE_STARTS.has(first)) return true;
  if (WEAK_END_WORDS.has(last)) return true;
  if (isPhrasalVerbParticle(first)) return true;
  return false;
}

function isDuplicateSingleWordCue(cue, previousCue, nextCue) {
  const words = tokenList(cue?.text || "");
  if (words.length !== 1) return false;
  const word = normalizeToken(words[0]);
  const previousWords = tokenList(previousCue?.text || "");
  const nextWords = tokenList(nextCue?.text || "");
  return normalizeToken(previousWords[previousWords.length - 1] || "") === word
    || normalizeToken(nextWords[0] || "") === word;
}

function hasIncompleteVerbPhraseBeforeObject(words, nextWords) {
  if (words.length < 2 || nextWords.length === 0) return false;
  const last = normalizeToken(words[words.length - 1]);
  const previous = normalizeToken(words[words.length - 2]);
  const nextStart = normalizeToken(nextWords[0]);
  if (!COMPLEMENT_TAKING_VERBS.has(last)) return false;
  if (!isAuxiliary(previous) && previous !== "to") return false;
  return SUBJECT_PRONOUNS.has(nextStart) || OBJECT_PRONOUNS.has(nextStart) || isDeterminer(nextStart);
}

function hasDanglingFunctionPhrase(words, nextWords) {
  if (words.length < 2 || nextWords.length === 0) return false;
  const last = normalizeToken(words[words.length - 1]);
  const previous = normalizeToken(words[words.length - 2]);
  const nextStart = normalizeToken(nextWords[0]);
  if (isPreposition(previous) && isDeterminer(last)) return true;
  if (QUESTION_SENTENCE_STARTS.has(previous) && isAuxiliary(last)) return true;
  if (isAuxiliary(last) && words.slice(-4).some((word) => QUESTION_SENTENCE_STARTS.has(normalizeToken(word)))) {
    return SUBJECT_PRONOUNS.has(nextStart) || isDeterminer(nextStart) || CLAUSE_SUBJECT_STARTS.has(nextStart);
  }
  return false;
}

function hasIncompleteOpenerFragment(words, nextWords) {
  if (words.length === 0 || words.length > 4 || nextWords.length === 0) return false;
  const first = normalizeToken(words[0]);
  const nextStart = normalizeToken(nextWords[0]);
  if (isTemporalOpenerFragment(words, nextWords)) return true;
  if (!startsLowercase(nextWords[0] || "")) return false;
  if (DISCOURSE_SENTENCE_STARTS.has(first)) return true;
  if (DEMONSTRATIVE_DETERMINERS.has(first) && words.some((word) => NEGATIONS.has(normalizeToken(word)))) return true;
  if (isDeterminer(first) && words.length <= 3) return true;
  if (isPreposition(first) && (UNIT_WORDS.has(nextStart) || NUMBER_TERMS.has(nextStart))) return true;
  return false;
}

function isTemporalOpenerFragment(words, nextWords) {
  if (words.length < 2 || words.length > 4 || nextWords.length === 0) return false;
  const first = normalizeToken(words[0]);
  const last = normalizeToken(words[words.length - 1]);
  const nextStart = normalizeToken(nextWords[0]);
  return isDeterminer(first) && TEMPORAL_NOUNS.has(last) && SUBJECT_PRONOUNS.has(nextStart);
}

function hasSplitTimeOrMeasurementPhrase(words, nextWords) {
  if (words.length < 2 || nextWords.length === 0) return false;
  const previous = normalizeToken(words[words.length - 2]);
  const last = normalizeToken(words[words.length - 1]);
  const nextStart = normalizeToken(nextWords[0]);
  if (!UNIT_WORDS.has(last)) return false;
  return isPreposition(previous) && isNumberTerm(nextStart);
}

function hasSplitCapitalizedNounPhraseBeforePredicate(words, nextWords) {
  if (words.length === 0 || nextWords.length < 2) return false;
  const lastWord = words[words.length - 1];
  return startsUppercase(lastWord)
    && startsLowercase(nextWords[0])
    && (isAuxiliary(normalizeToken(nextWords[1])) || isVerbLike(normalizeToken(nextWords[0])));
}

function hasLowercaseContinuationBreak(words, nextWords) {
  if (words.length === 0 || nextWords.length === 0) return false;
  if (!startsLowercase(nextWords[0])) return false;
  const nextStart = normalizeToken(nextWords[0]);
  const nextSecond = normalizeToken(nextWords[1] || "");
  if (isLowercaseSentenceLikeStart(nextStart, nextSecond)) return false;
  if (isConjunction(nextStart)) return false;
  if (isSplitSubjectPredicate(words, nextWords)) return true;
  if (hasWeakVerbObjectSplit(words, nextWords)) return true;
  if (hasNumberPluralSplit(words, nextWords)) return true;
  return isUnfinishedModifierPhrase(words) || isShortUnfinishedNounPhrase(words, nextWords);
}

function isUnfinishedModifierPhrase(words) {
  const last = normalizeToken(words[words.length - 1] || "");
  if (!last) return false;
  if (/^[a-z]+-[a-z]+$/.test(last)) return true;
  if (/(ful|less|ous|ive|ic|al|ary|ory|ent|ant)$/.test(last)) return true;
  return false;
}

function isShortUnfinishedNounPhrase(words, nextWords) {
  const first = normalizeToken(words[0] || "");
  const last = normalizeToken(words[words.length - 1] || "");
  const nextStart = normalizeToken(nextWords[0] || "");
  if (hasNumberPluralSplit(words, nextWords)) return true;
  if (words.length > 4) return false;
  if (isDeterminer(first) || POSSESSIVE_DETERMINERS.has(first)) return true;
  if (isPreposition(words.length >= 2 ? normalizeToken(words[words.length - 2]) : "") && !isLowercaseSentenceLikeStart(nextStart, normalizeToken(nextWords[1] || ""))) return true;
  if (SINGLE_WORD_DETERMINERS.has(last)) return true;
  if (words.some((word) => /^[a-z]+-[a-z]+$/i.test(word)) && words.length <= 5) return true;
  return false;
}

function hasNumberPluralSplit(words, nextWords) {
  const last = normalizeToken(words[words.length - 1] || "");
  const nextStart = normalizeToken(nextWords[0] || "");
  return NUMBER_TERMS.has(last) && nextStart.endsWith("s");
}

function hasWeakVerbObjectSplit(words, nextWords) {
  if (words.length === 0 || nextWords.length === 0) return false;
  const last = normalizeToken(words[words.length - 1]);
  const nextStart = normalizeToken(nextWords[0]);
  return WEAK_END_WORDS.has(last)
    && !isLowercaseSentenceLikeStart(nextStart, normalizeToken(nextWords[1] || ""))
    && !isQaBadStart(nextStart);
}

function isSplitSubjectPredicate(words, nextWords) {
  if (words.length === 0 || nextWords.length === 0) return false;
  const last = normalizeToken(words[words.length - 1]);
  const previous = normalizeToken(words[words.length - 2] || "");
  const nextStart = normalizeToken(nextWords[0]);
  if (!isAuxiliary(nextStart) && !isVerbLike(nextStart)) return false;
  if (SUBJECT_PRONOUNS.has(last) || POSSESSIVE_DETERMINERS.has(previous) || isDeterminer(previous)) return true;
  return words.length <= 6 && !isQaBadEnd(last);
}

function isNumberTerm(token) {
  return isNumberLike(token) || NUMBER_TERMS.has(token);
}

function isVerbLike(token) {
  return CLAUSE_VERBS.has(token) || /^[a-z]{3,}(s|ed|ing)$/.test(token);
}

function isQaBadEnd(token) {
  if (!token) return false;
  if (isDeterminer(token) || isConjunction(token) || isAuxiliary(token) || isSubordinatingConjunction(token)) return true;
  if (isPreposition(token) && !isPhrasalVerbParticle(token)) return true;
  if (QUESTION_SENTENCE_STARTS.has(token) || INCOMPLETE_END_CONTRACTIONS.has(token)) return true;
  if (SUBJECT_PRONOUNS.has(token) && token !== "it") return true;
  if (NEGATIONS.has(token) || DEGREE_MODIFIERS.has(token)) return true;
  return false;
}

function isQaBadStart(token) {
  if (!token) return false;
  if (isConjunction(token) || isDeterminer(token) || isPhrasalVerbParticle(token)) return true;
  if (token === "of" || token === "to" || token === "at" || token === "by" || token === "with") return true;
  return false;
}

function hasBadCueStart(words) {
  const firstWord = words[0] || "";
  if (!startsLowercase(firstWord)) return false;
  const first = normalizeToken(firstWord);
  const second = normalizeToken(words[1] || "");
  if (isLowercaseSentenceLikeStart(first, second)) return false;
  return isQaBadStart(first);
}

function isLowercaseSentenceLikeStart(first, second) {
  if (!first || !second) return false;
  if ((SUBJECT_PRONOUNS.has(first) || DEMONSTRATIVE_DETERMINERS.has(first) || QUESTION_SENTENCE_STARTS.has(first) || CLAUSE_SUBJECT_STARTS.has(first)) && (isAuxiliary(second) || CLAUSE_VERBS.has(second))) {
    return true;
  }
  if ((first === "by" || TEMPORAL_SENTENCE_STARTS.has(first)) && UNIT_WORDS.has(second)) {
    return true;
  }
  if (first === "through" && isDeterminer(second)) {
    return true;
  }
  return false;
}

function repairSubtitleIssues(cues, issues, settings, keepTogetherPhrases) {
  let repaired = normalizeSrtCueText(cues);
  const issueTypes = new Set(issues.map((issue) => issue.type));

  if (issueTypes.has("missing-sentence-split")) {
    repaired = splitCuesAtLikelySentenceStarts(repaired);
  }

	  if (issueTypes.has("leading-comma-word")) {
	    repaired = moveLeadingCommaWordsToPreviousCue(repaired, issues);
	  }

	  if (issueTypes.has("duplicate-single-word-cue")) {
	    repaired = removeDuplicateSingleWordCues(repaired);
	  }
	
	  if (
	    issueTypes.has("short-mid-cue")
	    || issueTypes.has("bad-end-category")
    || issueTypes.has("bad-start-category")
    || issueTypes.has("number-unit-split")
    || issueTypes.has("protected-phrase-split")
    || issueTypes.has("leading-dangling-before-sentence")
    || issueTypes.has("incomplete-verb-phrase")
    || issueTypes.has("incomplete-opener-fragment")
	    || issueTypes.has("split-time-measurement")
	    || issueTypes.has("split-capitalized-noun-phrase")
	    || issueTypes.has("lowercase-continuation")
	    || issueTypes.has("awkward-pair-split")
	  ) {
	    repaired = mergeIssueCues(repaired, issues);
	    repaired = mergeProtectedPhraseSrtCues(mergeSingleWordSrtCues(repaired), keepTogetherPhrases);
	    repaired = smoothAwkwardSrtBreaks(repaired, settings, keepTogetherPhrases);
    repaired = splitCuesAtLikelySentenceStarts(repaired);
  }

	  return splitLongSrtCues(normalizeSrtCueText(repaired), settings, keepTogetherPhrases);
	}

function removeDuplicateSingleWordCues(cues) {
  return cues.filter((cue, index) => {
    const words = tokenList(cue.text);
    if (words.length !== 1) return true;
    const word = normalizeToken(words[0]);
    const previousWords = tokenList(cues[index - 1]?.text || "");
    const nextWords = tokenList(cues[index + 1]?.text || "");
    return normalizeToken(previousWords[previousWords.length - 1] || "") !== word
      && normalizeToken(nextWords[0] || "") !== word;
  });
}

function mergeIssueCues(cues, issues) {
  const mergeWithNext = new Set();
  issues.forEach((issue) => {
    if (["short-mid-cue", "bad-end-category", "number-unit-split", "protected-phrase-split", "incomplete-verb-phrase", "incomplete-opener-fragment", "split-time-measurement", "split-capitalized-noun-phrase", "lowercase-continuation"].includes(issue.type)) {
      mergeWithNext.add(issue.index);
    }
    if (issue.type === "bad-start-category" && issue.index > 0) {
      mergeWithNext.add(issue.index - 1);
    }
    if (issue.type === "leading-dangling-before-sentence" && issue.index > 0) {
      mergeWithNext.add(issue.index - 1);
    }
  });

  const merged = [];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = { ...cues[index] };
    while (mergeWithNext.has(index) && index + 1 < cues.length) {
      const nextCue = cues[index + 1];
      cue.text = `${cue.text} ${nextCue.text}`.trim();
      cue.timing = `${cue.timing.split("-->")[0].trim()} --> ${nextCue.timing.split("-->")[1].trim()}`;
      index += 1;
    }
    merged.push(cue);
  }
  return merged;
}

function moveLeadingCommaWordsToPreviousCue(cues, issues) {
  const indexes = new Set(issues
    .filter((issue) => issue.type === "leading-comma-word" && issue.index > 0)
    .map((issue) => issue.index));
  if (indexes.size === 0) return cues;

  const updated = cues.map((cue) => ({ ...cue }));
  indexes.forEach((index) => {
    const cue = updated[index];
    const previous = updated[index - 1];
    if (!cue || !previous) return;

    const words = tokenList(cue.text);
    if (words.length < 2 || !/^[A-Za-z0-9]+,$/.test(words[0])) return;

    const movedWord = words[0].replace(/,$/, "");
    const remainingText = words.slice(1).join(" ");
    const previousText = `${previous.text} ${movedWord}`.trim();
    const timing = splitCombinedTiming(previous.timing, cue.timing, previousText, remainingText);
    previous.text = previousText;
    previous.timing = timing.current;
    cue.text = remainingText;
    cue.timing = timing.next;
  });

  return updated.filter((cue) => cue.text);
}

function repairDanglingFunctionPhraseCues(cues, settings) {
  const updated = cues.map((cue) => ({ ...cue }));

  for (let index = 0; index < updated.length - 1; index += 1) {
    const cue = updated[index];
    const nextCue = updated[index + 1];
    const cueWords = tokenList(cue.text);
    let nextWords = tokenList(nextCue.text);
    if (!hasDanglingFunctionPhrase(cueWords, nextWords)) continue;

    const minWordsToMove = endsWithQuestionHelper(cueWords) ? 2 : 1;
    const movedWords = [];
    while (nextWords.length > 0 && movedWords.length < minWordsToMove) {
      const candidateWords = [...cueWords, ...movedWords, nextWords[0]];
      if (candidateWords.join(" ").length > settings.maximumCharactersPerRow) break;
      movedWords.push(nextWords.shift());
    }

    while (
      nextWords.length > 0
      && hasDanglingFunctionPhrase([...cueWords, ...movedWords], nextWords)
      && [...cueWords, ...movedWords, nextWords[0]].join(" ").length <= settings.maximumCharactersPerRow
    ) {
      movedWords.push(nextWords.shift());
    }

    if (movedWords.length === 0) continue;
    cue.text = [...cueWords, ...movedWords].join(" ");
    nextCue.text = nextWords.join(" ");
    const timing = splitCombinedTiming(cue.timing, nextCue.timing, cue.text, nextCue.text);
    cue.timing = timing.current;
    nextCue.timing = timing.next;
  }

  return updated.filter((cue) => cue.text);
}

function repairLeadingPrepositionBeforeSentenceStartCues(cues, settings) {
  const updated = cues.map((cue) => ({ ...cue }));

  for (let index = 1; index < updated.length; index += 1) {
    const previousCue = updated[index - 1];
    const cue = updated[index];
    const words = tokenList(cue.text);
    if (words.length < 2) continue;
    const first = normalizeToken(words[0]);
    const second = words[1];
    const secondToken = normalizeToken(second);
    if (!isPreposition(first) || !startsUppercase(second)) continue;
    if (!isLikelySentenceStart({ text: second }) && secondToken !== "because") continue;
    const previousText = `${previousCue.text} ${words[0]}`.trim();
    if (previousText.length > settings.maximumCharactersPerRow) continue;
    cue.text = words.slice(1).join(" ");
    previousCue.text = previousText;
    const timing = splitCombinedTiming(previousCue.timing, cue.timing, previousCue.text, cue.text);
    previousCue.timing = timing.current;
    cue.timing = timing.next;
  }

  return updated.filter((cue) => cue.text);
}

function endsWithQuestionHelper(words) {
  if (words.length < 2) return false;
  const last = normalizeToken(words[words.length - 1]);
  const previous = normalizeToken(words[words.length - 2]);
  return QUESTION_SENTENCE_STARTS.has(previous) && isAuxiliary(last);
}

function srtCueSignature(cues) {
  return cues.map((cue) => `${cue.timing}\n${cue.text}`).join("\n\n");
}

function splitCuesAtLikelySentenceStarts(cues, keepTogetherPhrases = []) {
  return cues.flatMap((cue) => {
    const pieces = splitTextAtLikelySentenceStarts(cue.text, keepTogetherPhrases);
    if (pieces.length <= 1) return [cue];
    return splitTimingAcrossPieces(cue.timing, pieces);
  });
}

function splitTextAtLikelySentenceStarts(text, keepTogetherPhrases = []) {
  const words = tokenList(text);
  if (words.length < 4) return [cleanSubtitleText(text)];

  const pieces = [];
  let current = [];
  words.forEach((word, index) => {
    if (index > 0 && current.length >= 2 && shouldStartNewSentencePiece(words, index, keepTogetherPhrases)) {
      pieces.push(current.join(" "));
      current = [];
    }
    current.push(word);
  });
  if (current.length > 0) pieces.push(current.join(" "));
  return pieces;
}

function shouldStartNewSentencePiece(words, index, keepTogetherPhrases = []) {
  if (wouldBreakProtectedPhraseAt(words.map((text) => ({ text })), index - 1, keepTogetherPhrases)) return false;
  const word = words[index];
  const token = normalizeToken(word);
  const previousToken = normalizeToken(words[index - 1]);
  const nextToken = normalizeToken(words[index + 1] || "");
  if (previousToken === "vitamin" && token === "a") return false;
  const isCapitalizedSubjectStart = isCapitalizedSubjectBeforePredicate(word, previousToken, nextToken);
  const isCapitalizedNounStart = isCapitalizedNounPhraseBeforePredicate(words, index, previousToken);
  const isCapitalizedDiscourseStart = startsUppercase(word) && DISCOURSE_SENTENCE_STARTS.has(token);
  if (
    !isLikelySentenceStart({ text: word })
    && !isCapitalizedSubjectStart
    && !isCapitalizedNounStart
    && !isCapitalizedDiscourseStart
  ) return false;
  if (POSSESSIVE_DETERMINERS.has(previousToken)) return false;
  if (isCapitalizedDiscourseStart && !isConjunction(previousToken) && !isPreposition(previousToken) && !isAuxiliary(previousToken)) return true;
  if (
    previousToken === "that"
    && startsUppercase(word)
    && (
      SENTENCE_START_CONTRACTIONS.has(token)
      || DISCOURSE_SENTENCE_STARTS.has(token)
      || TEMPORAL_SENTENCE_STARTS.has(token)
      || IMPERATIVE_START_VERBS.has(token)
    )
  ) return true;
  if (startsUppercase(word) && token === "because") return true;
  if ((isConjunction(previousToken) || isSubordinatingConjunction(previousToken) || isPreposition(previousToken) || isAuxiliary(previousToken)) && !isPhrasalVerbParticle(previousToken)) return false;
  if (token === "i" && !startsUppercase(word)) return false;
  if (token === "i" && (RELATIVE_CLAUSE_ANTECEDENTS.has(previousToken) || TEMPORAL_NOUNS.has(previousToken))) return false;
  if (token === "i") return true;
  if (SENTENCE_START_CONTRACTIONS.has(token) || QUESTION_SENTENCE_STARTS.has(token) || DISCOURSE_SENTENCE_STARTS.has(token)) return true;
  if (isCapitalizedSubjectStart || isCapitalizedNounStart) return true;
  if (TEMPORAL_SENTENCE_STARTS.has(token) || NEGATIONS.has(token)) return true;
  if (isSubordinatingConjunction(token)) return true;
  if (IMPERATIVE_START_VERBS.has(token)) return true;
  if (isDeterminer(token)) return Boolean(nextToken);
  return isAuxiliary(nextToken) || CLAUSE_VERBS.has(nextToken) || index + 1 >= words.length;
}

function isCapitalizedSubjectBeforePredicate(word, previousToken, nextToken) {
  if (!startsUppercase(word)) return false;
  if (!nextToken || previousToken === "dr") return false;
  return isAuxiliary(nextToken) || CLAUSE_VERBS.has(nextToken) || /^[a-z]{3,}(s|ed)$/.test(nextToken);
}

function isCapitalizedNounPhraseBeforePredicate(words, index, previousToken) {
  if (!startsUppercase(words[index])) return false;
  if (isPreposition(previousToken) || previousToken === "dr") return false;
  const nextToken = normalizeToken(words[index + 1] || "");
  const followingToken = normalizeToken(words[index + 2] || "");
  return Boolean(nextToken && followingToken && startsLowercase(words[index + 1]) && isAuxiliary(followingToken));
}

function splitLongSrtCues(cues, settings, keepTogetherPhrases) {
  return cues.flatMap((cue) => {
    const text = cleanSubtitleText(cue.text);
    const sentencePieces = splitTextAtLikelySentenceStarts(text, keepTogetherPhrases);
    if (sentencePieces.length > 1) {
      return splitLongSrtCues(splitTimingAcrossPieces(cue.timing, sentencePieces), settings, keepTogetherPhrases);
    }
    if (settings.maximumRowsPerCaption !== 1 || text.length <= settings.maximumCharactersPerRow) {
      return [{ ...cue, text }];
    }

    const pieces = splitTextToVisualRows(text, settings, keepTogetherPhrases);
    if (pieces.length <= 1) return [{ ...cue, text }];
    return splitTimingAcrossPieces(cue.timing, pieces);
  });
}

function splitTextToVisualRows(text, settings, keepTogetherPhrases) {
  const words = tokenList(text);
  const pieces = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = chooseVisualRowEnd(words, startIndex, settings, keepTogetherPhrases);
    pieces.push(words.slice(startIndex, endIndex + 1).join(" "));
    startIndex = endIndex + 1;
  }

  return pieces;
}

function chooseVisualRowEnd(words, startIndex, settings, keepTogetherPhrases) {
  let lastFitEnd = startIndex;
  for (let index = startIndex; index < words.length; index += 1) {
    const text = words.slice(startIndex, index + 1).join(" ");
    if (text.length > settings.maximumCharactersPerRow && index > startIndex) break;
    lastFitEnd = index;
  }

  let bestEnd = lastFitEnd;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = startIndex; index <= lastFitEnd; index += 1) {
    if (index < words.length - 1 && wouldBreakProtectedPhraseAt(words.map((word) => ({ text: word })), index, keepTogetherPhrases)) continue;
    if (index < words.length - 1 && hasDanglingFunctionPhrase(words.slice(startIndex, index + 1), words.slice(index + 1, index + 5))) continue;
    const score = scoreVisualRowBreak(words, startIndex, index, lastFitEnd, settings, keepTogetherPhrases);
    if (score < bestScore) {
      bestScore = score;
      bestEnd = index;
    }
  }
  return Math.max(startIndex, bestEnd);
}

function scoreVisualRowBreak(words, startIndex, endIndex, preferredEnd, settings, keepTogetherPhrases) {
  const endWord = normalizeToken(words[endIndex] || "");
  const nextWord = normalizeToken(words[endIndex + 1] || "");
  const leftWords = words.slice(startIndex, endIndex + 1);
  const rightWords = words.slice(endIndex + 1);
  const text = words.slice(startIndex, endIndex + 1).join(" ");
  let score = Math.abs(preferredEnd - endIndex) * 12;
  score += characterTargetPenalty(text.length, settings) * 20;
  score += badEndCategoryPenalty(endWord);
  if (!isLowercaseSentenceLikeStart(nextWord, normalizeToken(words[endIndex + 2] || ""))) {
    score += badStartCategoryPenalty(nextWord);
  }
  if (isProgressiveVerbLike(endWord) && !isLowercaseSentenceLikeStart(nextWord, normalizeToken(words[endIndex + 2] || ""))) score += 500;
  if (isNumberTerm(endWord) && UNIT_WORDS.has(nextWord)) score += 1000;
  if (UNIT_WORDS.has(endWord) && isNumberTerm(nextWord)) score += 1000;
  if (hasSplitCapitalizedNounPhraseBeforePredicate(leftWords, rightWords)) score += 1200;
  if (hasDanglingFunctionPhrase(leftWords, rightWords)) score += 1200;
  if (containsLikelySentenceStartAfterFirst(leftWords)) score += 900;
  if (wouldBreakProtectedPhraseAt(words.map((word) => ({ text: word })), endIndex, keepTogetherPhrases)) score += 1000;
  if (endIndex === startIndex && words.length > 1) score += 500;
  if (rightWords.length === 1) score += 3000;
  return score;
}

function formatSrtCues(cues, settings = normalizeSubtitleSettings(defaultSettings.subtitleDefaults)) {
  return cues.map((cue, index) => {
    const text = wrapSubtitleText(formatSubtitleForExport(cue.text), settings.maximumCharactersPerRow, settings.maximumRowsPerCaption);
    return `${index + 1}\n${cue.timing}\n${text}`;
  }).join("\n\n");
}

function smoothAwkwardSrtBreaks(cues, settings, keepTogetherPhrases) {
  const smoothed = cues.map((cue) => ({ ...cue }));
  for (let index = 0; index < smoothed.length - 1; index += 1) {
    const current = smoothed[index];
    const next = smoothed[index + 1];
    if (!shouldRebalanceSrtPair(current, next)) continue;

    const rebalanced = rebalanceSrtPair(current, next, settings, keepTogetherPhrases);
    if (rebalanced) {
      smoothed[index] = rebalanced.current;
      smoothed[index + 1] = rebalanced.next;
    }
  }
  return smoothed;
}

function shouldRebalanceSrtPair(current, next) {
  const currentWords = tokenList(current.text);
  const nextWords = tokenList(next.text);
  if (currentWords.length < 2 || nextWords.length < 1) return false;
  if (isStrongSentenceBoundary(currentWords, nextWords)) return false;
  if (isStrongCommaClauseBoundary(currentWords, nextWords)) return false;

  const endWord = normalizeToken(currentWords[currentWords.length - 1]);
  const startWord = normalizeToken(nextWords[0]);
  return (nextWords.length === 1 && !startsUppercase(nextWords[0]))
    || (currentWords.length <= 2 && !startsUppercase(nextWords[0]))
    || badEndCategoryPenalty(endWord) >= 120
    || WEAK_END_WORDS.has(endWord)
    || (badStartCategoryPenalty(startWord) >= 120 && startsLowercase(nextWords[0]) && !isLowercaseSentenceLikeStart(startWord, normalizeToken(nextWords[1] || "")))
	    || /[,:;]$/.test(currentWords[currentWords.length - 1]);
	}

function isStrongSentenceBoundary(currentWords, nextWords) {
  if (nextWords.length < 2) return false;
  const first = nextWords[0];
  const firstToken = normalizeToken(first);
  const secondToken = normalizeToken(nextWords[1] || "");
  const thirdToken = normalizeToken(nextWords[2] || "");
  if (!startsUppercase(first)) return false;
  if (firstToken === "i") return true;
  if (SENTENCE_START_CONTRACTIONS.has(firstToken) || IMPERATIVE_START_VERBS.has(firstToken)) return true;
  return isAuxiliary(secondToken)
    || CLAUSE_VERBS.has(secondToken)
    || (startsLowercase(nextWords[1]) && (isAuxiliary(thirdToken) || CLAUSE_VERBS.has(thirdToken)));
}

function isStrongCommaClauseBoundary(currentWords, nextWords) {
  const currentLast = currentWords[currentWords.length - 1] || "";
  if (!/[,:;]$/.test(currentLast)) return false;
  const first = normalizeToken(nextWords[0] || "");
  const second = normalizeToken(nextWords[1] || "");
  return CLAUSE_SUBJECT_STARTS.has(first) && (isAuxiliary(second) || CLAUSE_VERBS.has(second) || isVerbLike(second));
}

function rebalanceSrtPair(current, next, settings, keepTogetherPhrases) {
  const combinedWords = [...tokenList(current.text), ...tokenList(next.text)];
  if (combinedWords.length < 4) return null;

  const originalSplit = tokenList(current.text).length;
  const shortCaptionSplit = chooseShortCaptionSplit(combinedWords, originalSplit, settings, keepTogetherPhrases);
  if (shortCaptionSplit && shortCaptionSplit !== originalSplit) {
    return buildRebalancedSrtPair(current, next, combinedWords, shortCaptionSplit);
  }

  let bestSplit = originalSplit;
  let bestScore = scoreSrtTextSplit(combinedWords, originalSplit, originalSplit, settings, keepTogetherPhrases);

  for (let split = 2; split <= combinedWords.length - 2; split += 1) {
    const score = scoreSrtTextSplit(combinedWords, split, originalSplit, settings, keepTogetherPhrases);
    if (score < bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }

  if (bestSplit === originalSplit) return null;

  return buildRebalancedSrtPair(current, next, combinedWords, bestSplit);
}

function chooseShortCaptionSplit(words, originalSplit, settings, keepTogetherPhrases) {
  if (originalSplit > 2 || words.length - originalSplit < 3) return 0;

  for (let split = originalSplit + 1; split <= words.length - 2; split += 1) {
    const leftText = words.slice(0, split).join(" ");
    const leftEnd = normalizeToken(words[split - 1]);
    const rightStart = normalizeToken(words[split]);
    if (startsUppercase(words[split])) continue;
    if (badEndCategoryPenalty(leftEnd) >= 180) continue;
    if (badStartCategoryPenalty(rightStart) >= 180 && startsLowercase(words[split]) && !isLowercaseSentenceLikeStart(rightStart, normalizeToken(words[split + 1] || ""))) continue;
    if (isNumberLike(leftEnd) && UNIT_WORDS.has(rightStart)) continue;
    if (UNIT_WORDS.has(leftEnd) && isNumberTerm(rightStart)) continue;
    if (hasSplitCapitalizedNounPhraseBeforePredicate(words.slice(0, split), words.slice(split))) continue;
    if (wouldBreakProtectedPhraseAt(words.map((text) => ({ text })), split - 1, keepTogetherPhrases)) continue;
    return split;
  }

  return 0;
}

function buildRebalancedSrtPair(current, next, combinedWords, split) {
  const leftText = combinedWords.slice(0, split).join(" ");
  const rightText = combinedWords.slice(split).join(" ");
  const timing = splitCombinedTiming(current.timing, next.timing, leftText, rightText);
  return {
    current: { ...current, timing: timing.current, text: leftText },
    next: { ...next, timing: timing.next, text: rightText }
  };
}

function scoreSrtTextSplit(words, split, originalSplit, settings, keepTogetherPhrases) {
  const leftWords = words.slice(0, split);
  const rightWords = words.slice(split);
  const leftText = leftWords.join(" ");
  const rightText = rightWords.join(" ");
  const endWord = normalizeToken(leftWords[leftWords.length - 1]);
  const startWord = normalizeToken(rightWords[0]);
  let score = Math.abs(split - originalSplit) * 12;
  score += Math.abs(leftText.length - rightText.length) * 2;
  score += scoreCaptionQuality(leftWords, settings, true);
  score += scoreCaptionQuality(rightWords, settings, false);

  if (leftWords.length < 2 || rightWords.length < 2) score += 1000;
  if (split === originalSplit && leftWords.length <= 2 && rightWords.length > 2) score += 100;
  score += characterTargetPenalty(leftText.length, settings) * 4;
  score += characterTargetPenalty(rightText.length, settings) * 4;
  score += badEndCategoryPenalty(endWord);
  if (WEAK_END_WORDS.has(endWord)) score += 85;
  if (startsLowercase(rightWords[0]) && !isLowercaseSentenceLikeStart(startWord, normalizeToken(rightWords[1] || ""))) score += badStartCategoryPenalty(startWord);
  if (isLikelySentenceStart({ text: rightWords[0] })) score -= 120;
  if (containsLikelySentenceStartAfterFirst(leftWords)) score += 260;
  if (containsLikelySentenceStartAfterFirst(rightWords)) score += 140;
  if (/[,:;]$/.test(leftWords[leftWords.length - 1])) score += 160;
  if (wouldBreakProtectedPhraseAt(words.map((text) => ({ text })), split - 1, keepTogetherPhrases)) score += 1000;
  if (isNumberLike(endWord) && UNIT_WORDS.has(startWord)) score += 1000;
  if (UNIT_WORDS.has(endWord) && isNumberTerm(startWord)) score += 1000;
  if (hasIncompleteOpenerFragment(leftWords, rightWords)) score += 800;
  if (hasSplitTimeOrMeasurementPhrase(leftWords, rightWords)) score += 1000;
  if (isTemporalOpenerFragment(leftWords, rightWords)) score += 1000;
  if (hasSplitCapitalizedNounPhraseBeforePredicate(leftWords, rightWords)) score += 1000;
  if (hasLowercaseContinuationBreak(leftWords, rightWords)) score += 500;

  return score;
}

function scoreCaptionQuality(words, settings, isLeftSide) {
  if (words.length === 0) return 5000;
  const text = words.join(" ");
  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  const first = normalizeToken(firstWord);
  const second = normalizeToken(words[1] || "");
  const last = normalizeToken(lastWord);
  let score = 0;

  if (settings.maximumRowsPerCaption === 1 && text.length > settings.maximumCharactersPerRow) {
    score += 5000 + ((text.length - settings.maximumCharactersPerRow) * 150);
  }
  if (words.length === 1) score += 3000;
  if (words.length === 2) score += 250;
  if (isLeftSide) {
    score += badEndCategoryPenalty(last);
    if (WEAK_END_WORDS.has(last)) score += 160;
    if (/[,:;]$/.test(lastWord)) score += 160;
  } else if (startsLowercase(firstWord) && !isLowercaseSentenceLikeStart(first, second)) {
    score += badStartCategoryPenalty(first);
  }

  return score;
}

function splitCombinedTiming(currentTiming, nextTiming, leftText, rightText) {
  const start = parseSrtTime(currentTiming.split("-->")[0].trim());
  const end = parseSrtTime(nextTiming.split("-->")[1].trim());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { current: currentTiming, next: nextTiming };
  }

  const leftWeight = Math.max(1, leftText.length);
  const rightWeight = Math.max(1, rightText.length);
  const boundary = start + ((end - start) * (leftWeight / (leftWeight + rightWeight)));
  return {
    current: `${formatSrtTime(start)} --> ${formatSrtTime(boundary)}`,
    next: `${formatSrtTime(boundary)} --> ${formatSrtTime(end)}`
  };
}

function tokenList(text) {
  return cleanSubtitleText(text).split(/\s+/).filter(Boolean);
}

function startsLowercase(word) {
  return /^[a-z]/.test(String(word || ""));
}

function startsUppercase(word) {
  return /^[A-Z]/.test(String(word || ""));
}

function buildKeepTogetherPhrases(payload) {
  const phrases = new Set(defaultSettings.keepTogetherPhrases.map(normalizePhrase));
  DEFAULT_GLOSSARY_RULES.forEach((rule) => {
    const replacement = normalizePhrase(rule.replacement);
    if (replacement && replacement.includes(" ")) phrases.add(replacement);
  });
  DEFAULT_KEEP_TOGETHER_PHRASES.forEach((phrase) => {
    const normalized = normalizePhrase(phrase);
    if (normalized) phrases.add(normalized);
  });
  (payload.keepTogetherPhrases || []).forEach((phrase) => {
    const normalized = normalizePhrase(phrase);
    if (normalized) phrases.add(normalized);
  });
  (payload.vocabulary || []).forEach((entry) => {
    const normalized = normalizePhrase(entry.value);
    if (normalized && normalized.includes(" ")) phrases.add(normalized);
  });
  (payload.spellingRules || []).forEach((rule) => {
    const replacement = normalizePhrase(rule.replacement);
    if (replacement && replacement.includes(" ")) phrases.add(replacement);
  });
  return Array.from(phrases);
}

function normalizePhrase(phrase) {
  return cleanSubtitleText(phrase)
    .replace(/[.!?,;:]+/g, "")
    .toLowerCase();
}

function wouldSplitProtectedPhrase(cue, word, nextWord, keepTogetherPhrases) {
  const before = lastWords(`${cue.text} ${word.text}`, 6);
  const after = nextWord ? normalizePhrase(nextWord.text) : "";
  return keepTogetherPhrases.some((phrase) => {
    const phraseWords = phrase.split(/\s+/);
    if (phraseWords.length < 2) return false;
    const tail = before.slice(-(phraseWords.length - 1)).join(" ");
    return `${tail} ${after}`.trim() === phrase;
  });
}

function wouldBreakProtectedPhraseAt(words, endIndex, keepTogetherPhrases) {
  const left = lastWords(words.slice(0, endIndex + 1).map((word) => word.text).join(" "), 6);
  const right = firstWords(words.slice(endIndex + 1, endIndex + 7).map((word) => word.text).join(" "), 6);
  return keepTogetherPhrases.some((phrase) => {
    const phraseWords = phrase.split(/\s+/);
    if (phraseWords.length < 2) return false;
    for (let split = 1; split < phraseWords.length; split += 1) {
      const leftPart = phraseWords.slice(0, split).join(" ");
      const rightPart = phraseWords.slice(split).join(" ");
      if (left.slice(-split).join(" ") === leftPart && right.slice(0, phraseWords.length - split).join(" ") === rightPart) {
        return true;
      }
    }
    return false;
  });
}

function mergeProtectedPhraseSrtCues(cues, keepTogetherPhrases) {
  return cues.reduce((merged, cue) => {
    const previous = merged[merged.length - 1];
    if (previous && endsWithProtectedPhraseStart(previous.text, cue.text, keepTogetherPhrases)) {
      previous.text = `${previous.text} ${cue.text}`.trim();
      previous.timing = `${previous.timing.split("-->")[0].trim()} --> ${cue.timing.split("-->")[1].trim()}`;
      return merged;
    }

    merged.push(cue);
    return merged;
  }, []);
}

function endsWithProtectedPhraseStart(leftText, rightText, keepTogetherPhrases) {
  const left = lastWords(leftText, 6);
  const right = firstWords(rightText, 6);
  return keepTogetherPhrases.some((phrase) => {
    const words = phrase.split(/\s+/);
    if (words.length < 2) return false;
    for (let split = 1; split < words.length; split += 1) {
      const leftPart = words.slice(0, split).join(" ");
      const rightPart = words.slice(split).join(" ");
      if (left.slice(-split).join(" ") === leftPart && right.slice(0, words.length - split).join(" ") === rightPart) {
        return true;
      }
    }
    return false;
  });
}

function firstWords(text, count) {
  return normalizePhrase(text).split(/\s+/).filter(Boolean).slice(0, count);
}

function lastWords(text, count) {
  return normalizePhrase(text).split(/\s+/).filter(Boolean).slice(-count);
}

function normalizeToken(token) {
  return cleanSubtitleText(token)
    .toLowerCase()
    .replace(/^[^\w]+|[^\w]+$/g, "");
}

function isNumberLike(token) {
  return /^\d[\d,]*(\.\d+)?$/.test(token);
}

function mergeSingleWordSrtCues(cues) {
  return cues.reduce((merged, cue, index) => {
    if (countWords(cue.text) !== 1) {
      merged.push(cue);
      return merged;
    }

    const nextCue = cues[index + 1];
    const cueWord = normalizeToken(cue.text);
    const previous = merged[merged.length - 1];
    const previousWords = tokenList(previous?.text || "");
    const nextWords = tokenList(nextCue?.text || "");
    if (previous && normalizeToken(previousWords[previousWords.length - 1] || "") === cueWord) {
      previous.timing = `${previous.timing.split("-->")[0].trim()} --> ${cue.timing.split("-->")[1].trim()}`;
      return merged;
    }
    if (nextCue && normalizeToken(nextWords[0] || "") === cueWord) {
      nextCue.timing = `${cue.timing.split("-->")[0].trim()} --> ${nextCue.timing.split("-->")[1].trim()}`;
      return merged;
    }
    if (isClauseSubjectFragment(cue.text) && nextCue) {
      nextCue.text = `${cue.text} ${nextCue.text}`.trim();
      nextCue.timing = `${cue.timing.split("-->")[0].trim()} --> ${nextCue.timing.split("-->")[1].trim()}`;
      return merged;
    }

    if (previous && !endsSentence(previous.text) && !endsSentence(cue.text)) {
      previous.text = `${previous.text} ${cue.text}`.trim();
      previous.timing = `${previous.timing.split("-->")[0].trim()} --> ${cue.timing.split("-->")[1].trim()}`;
      return merged;
    }

    if (nextCue && !endsSentence(cue.text)) {
      nextCue.text = `${cue.text} ${nextCue.text}`.trim();
      nextCue.timing = `${cue.timing.split("-->")[0].trim()} --> ${nextCue.timing.split("-->")[1].trim()}`;
      return merged;
    }

    merged.push(cue);
    return merged;
  }, []);
}

function countWords(text) {
  return cleanSubtitleText(text).split(/\s+/).filter(Boolean).length;
}

function isClauseSubjectFragment(text) {
  return CLAUSE_SUBJECT_STARTS.has(normalizeToken(text));
}

function splitSrtAtSentenceBoundaries(srtText) {
  return String(srtText)
    .trim()
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex === -1) return [];

      const timing = lines[timingIndex].trim();
      const text = lines.slice(timingIndex + 1).join(" ").trim();
      const pieces = splitTextAtSentenceBoundaries(text);
      if (pieces.length <= 1) return [{ timing, text, sentenceEnd: endsSentence(text) }];

      return splitTimingAcrossPieces(timing, pieces).map((piece) => ({
        timing: piece.timing,
        text: piece.text,
        sentenceEnd: endsSentence(piece.text)
      }));
    });
}

function splitTextAtSentenceBoundaries(text) {
  return splitTextAtClauseBoundaries(String(text))
    .flatMap((clause) => clause
      .split(/([.!?]["')\]]?)\s+(?=[A-Z0-9])/)
      .reduce((pieces, part, index, parts) => {
        if (index % 2 === 0) {
          const punctuation = parts[index + 1] || "";
          pieces.push(`${part}${punctuation}`.trim());
        }
        return pieces;
      }, []))
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function splitTextAtClauseBoundaries(text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const pieces = [];
  let current = [];

  words.forEach((word, index) => {
    current.push(word);
    if (shouldSplitAfterCommaClause(words, index)) {
      pieces.push(current.join(" "));
      current = [];
    }
  });

  if (current.length > 0) pieces.push(current.join(" "));
  return pieces;
}

function shouldSplitAfterCommaClause(words, index) {
  if (!/[,:;]$/.test(words[index] || "")) return false;
  const next = normalizeToken(words[index + 1] || "");
  if (!next) return false;
  if (badStartCategoryPenalty(next) >= 180 || isConjunction(next)) return false;
  if (startsUppercase(words[index + 1])) return true;
  if (CLAUSE_SUBJECT_STARTS.has(next) && index + 1 === words.length - 1) return true;
  if (!CLAUSE_SUBJECT_STARTS.has(next)) return false;
  return words.slice(index + 2, index + 6).some((word) => CLAUSE_VERBS.has(normalizeToken(word)));
}

function splitTimingAcrossPieces(timing, pieces) {
  const [startText, endText] = timing.split("-->").map((part) => part.trim());
  const start = parseSrtTime(startText);
  const end = parseSrtTime(endText);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return pieces.map((text) => ({ timing, text }));
  }

  const totalLength = pieces.reduce((sum, piece) => sum + Math.max(1, piece.length), 0);
  let cursor = start;
  return pieces.map((text, index) => {
    const isLast = index === pieces.length - 1;
    const share = Math.max(1, text.length) / totalLength;
    const pieceEnd = isLast ? end : cursor + ((end - start) * share);
    const pieceTiming = `${formatSrtTime(cursor)} --> ${formatSrtTime(pieceEnd)}`;
    cursor = pieceEnd;
    return { timing: pieceTiming, text };
  });
}

function parseSrtTime(timeText) {
  const match = String(timeText).match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return NaN;
  const [, hours, minutes, seconds, milliseconds] = match;
  return (Number(hours) * 3600)
    + (Number(minutes) * 60)
    + Number(seconds)
    + (Number(milliseconds) / 1000);
}

function endsSentence(text) {
  return /[.!?]["')\]]?$/.test(String(text).trim());
}

function wrapSubtitleText(text, maxCharactersPerRow, maxRows = Infinity) {
  const words = cleanSubtitleText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharactersPerRow && line && lines.length + 1 < maxRows) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  return lines.join("\n");
}

function formatSrtTime(seconds) {
  const totalMilliseconds = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(milliseconds).padStart(3, "0")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeVocabulary(entries) {
  return entries
    .map((entry) => {
      if (!entry.value) return null;
      const normalized = { value: entry.value.trim() };
      if (!normalized.value) return null;
      if (entry.pronunciations) {
        normalized.pronunciations = entry.pronunciations
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
      if (entry.intensity !== "" && entry.intensity !== undefined && entry.intensity !== null) {
        normalized.intensity = Number(entry.intensity);
      }
      if (entry.language) normalized.language = entry.language.trim();
      return normalized;
    })
    .filter(Boolean);
}

function normalizeSpellingRules(rules) {
  return rules.reduce((dictionary, rule) => {
    const original = (rule.original || "").trim();
    const replacement = (rule.replacement || "").trim();
    if (!original || !replacement) return dictionary;
    if (!dictionary[replacement]) dictionary[replacement] = [];
    dictionary[replacement].push(original);
    return dictionary;
  }, {});
}

function emitJobProgress(filePath, status, message) {
  if (!mainWindow) return;
  mainWindow.webContents.send("job:progress", {
    filePath,
    status,
    message
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  buildKeepTogetherPhrases,
  buildSrtFromSentences,
  buildSrtFromUtterances,
  extractSrt,
  postProcessSrtText,
  applySrtRules,
  splitSrtAtSentenceBoundaries,
  findSubtitleIssues,
  defaultSettings
};
