const electron = process.versions.electron ? require("electron") : {};
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
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
const BAD_END_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "because", "if", "when", "while",
  "of", "to", "in", "on", "at", "by", "for", "from", "with", "without", "into",
  "onto", "over", "under", "between", "about", "as", "than", "that", "which",
  "who", "whose", "is", "was", "were", "are", "be", "been", "being", "has",
  "have", "had", "can", "could", "would", "should", "will", "may", "might",
  "must", "do", "does", "did", "not", "no", "very", "more", "most"
]);
const WEAK_END_WORDS = new Set([
  "kept", "applied", "mixed", "fades", "pulls", "gets", "used", "started",
  "added", "built", "seal", "keep", "put", "tried", "recommended", "said",
  "forget", "render", "burn", "make", "making", "using", "came", "went",
  "being", "became", "causes", "caused", "has", "have", "had"
]);
const BAD_START_WORDS = new Set([
  "of", "to", "for", "with", "from", "by", "than", "that", "which", "who",
  "and", "or", "but", "because", "is", "are", "was", "were", "be"
]);
const WEAK_START_WORDS = new Set([
  "it", "its", "your", "their", "our", "my", "his", "her", "that", "this",
  "these", "those", "you", "we", "they"
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
const CLAUSE_SUBJECT_STARTS = new Set([
  "people", "teams", "projects", "captions", "subtitles", "files", "clips",
  "we", "our", "she", "he", "they", "it", "this", "that", "your", "maya",
  "editors", "reviewers", "clients", "producers", "captions"
]);
const CLAUSE_VERBS = new Set([
  "was", "wasn't", "were", "weren't", "is", "isn't", "are", "aren't",
  "became", "came", "went", "gets", "used", "started", "added", "built",
  "tried", "worked", "said",
  "learned", "had", "would", "crack", "bleed", "make", "recognize",
  "presented", "reviewed", "approved", "adjusted", "organized"
]);

let mainWindow;
let autoUpdaterConfigured = false;

const defaultSettings = {
  apiKey: "",
  outputFolder: "",
  subtitleDefaults: {
    minimum_duration: 1,
    target_duration: 1.2,
    maximum_duration: 2,
    caption_gap: 0.06,
    split_on_silence_gap: 0.35,
    maximum_characters_per_row: 42,
    maximum_rows_per_caption: 2,
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
      { name: "Media", extensions: ["mp4", "mov", "m4v", "mp3", "wav", "aac", "m4a", "flac"] },
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
  const folder = outputFolder || path.dirname(filePath);
  fs.mkdirSync(folder, { recursive: true });
  const outputPath = path.join(folder, `${path.parse(filePath).name}.srt`);
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
  const srtText = postProcessSrtText(
    extractSrt(result, payload.subtitleDefaults, keepTogetherPhrases),
    keepTogetherPhrases,
    payload.subtitleDefaults,
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
  const spellingRules = normalizeSpellingRules(payload.spellingRules || []);

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

function extractSrt(result, subtitleDefaults, keepTogetherPhrases) {
  const utterances = result.result?.transcription?.utterances || result.transcription?.utterances || [];
  if (Array.isArray(utterances) && utterances.length > 0) {
    return buildSrtFromUtterances(utterances, subtitleDefaults, keepTogetherPhrases);
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
    if (srt?.subtitles) return srt.subtitles;
  }

  return "";
}

function buildSrtFromUtterances(utterances, subtitleDefaults, keepTogetherPhrases) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  const words = flattenWords(utterances);
  const cues = words.length > 0
    ? buildCuesFromWords(words, settings, keepTogetherPhrases)
    : buildCuesFromUtteranceText(utterances, settings);

  const adjustedCues = applyCaptionGaps(enforceMinimumDuration(mergeSingleWordCues(cues), settings), settings);
  return adjustedCues.map((cue, index) => {
    const lines = wrapSubtitleText(cue.text, Number(subtitleDefaults.maximum_characters_per_row || 42));
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
    maximumCharactersPerCaption: maximumCharactersPerRow * maximumRowsPerCaption,
    maximumCharactersPerRow
  };
}

function flattenWords(utterances) {
  return utterances.flatMap((utterance) => {
    if (!Array.isArray(utterance.words)) return [];
    return utterance.words.map((word) => ({
      text: cleanWord(word.punctuated_word || word.word || word.text || ""),
      start: Number(word.start ?? utterance.start ?? 0),
      end: Number(word.end ?? utterance.end ?? word.start ?? utterance.start ?? 0)
    }));
  }).filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
}

function buildCuesFromWords(words, settings, keepTogetherPhrases) {
  const cues = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    const endIndex = chooseNaturalCueEnd(words, startIndex, settings, keepTogetherPhrases);
    cues.push(wordsToCue(words.slice(startIndex, endIndex + 1)));
    startIndex = endIndex + 1;
  }

  return cues;
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
    if (silenceGap > settings.splitOnSilenceGap) return avoidBadFinalBreak(words, startIndex, index, keepTogetherPhrases);
    if (text.length > settings.maximumCharactersPerCaption || duration > settings.maximumDuration) break;
  }

  const minCandidateEnd = Math.min(words.length - 1, startIndex + 1);
  const candidateEnd = Math.max(minCandidateEnd, hardEnd);
  const targetEnd = findTargetEnd(words, startIndex, candidateEnd, settings);
  const bestEnd = chooseBestBreak(words, startIndex, targetEnd, candidateEnd, settings, keepTogetherPhrases);
  return Math.max(minCandidateEnd, bestEnd);
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
  if (countWords(text) < 2) score += 500;
  if (endsSentence(text)) score -= 80;
  if (/[,:;]$/.test(words[endIndex].text)) score += 120;
  if (BAD_END_WORDS.has(endWord)) score += 90;
  if (BAD_START_WORDS.has(nextWord)) score += 160;
  if (PAIR_START_WORDS.has(endWord)) score += 75;
  if (PAIR_END_WORDS.has(nextWord)) score += 60;
  if (isNumberLike(endWord) && nextWord) score += 70;
  if (isNumberLike(previousWord) && UNIT_WORDS.has(endWord)) score -= 20;
  if (duration < settings.minimumDuration) score += 30;
  if (text.length > settings.maximumCharactersPerCaption) score += 100;

  return score;
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
  return BAD_END_WORDS.has(endWord)
    || BAD_START_WORDS.has(nextWord)
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

function buildCuesFromUtteranceText(utterances, settings) {
  return utterances.map((utterance) => ({
    start: Number(utterance.start || 0),
    end: Math.min(Number(utterance.end || 0), Number(utterance.start || 0) + settings.maximumDuration),
    text: cleanWord(utterance.text || "")
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
  return String(word).trim();
}

function cleanSubtitleText(text) {
  return String(text)
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function postProcessSrtText(
  srtText,
  keepTogetherPhrases,
  subtitleDefaults = defaultSettings.subtitleDefaults,
  spellingRules = []
) {
  return formatSrtCues(postProcessSrtCues(srtText, keepTogetherPhrases, subtitleDefaults, spellingRules));
}

function applySrtRules(srtText, subtitleDefaults, keepTogetherPhrases, spellingRules = []) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  return formatSrtCues(applyCaptionGapsToSrtCues(
    postProcessSrtCues(srtText, keepTogetherPhrases, subtitleDefaults, spellingRules),
    settings
  ));
}

function postProcessSrtCues(srtText, keepTogetherPhrases, subtitleDefaults, spellingRules = []) {
  const settings = normalizeSubtitleSettings(subtitleDefaults);
  const cleanedCues = mergeProtectedPhraseSrtCues(mergeSingleWordSrtCues(splitSrtAtSentenceBoundaries(srtText)), keepTogetherPhrases)
    .map((cue) => ({
      ...cue,
      text: cleanSubtitleText(applyLocalSpellingRules(cue.text, spellingRules))
        .replace(/[.!?,]+$/g, "")
        .trim()
    }))
    .filter((cue) => cue.text);

  return smoothAwkwardSrtBreaks(mergeSingleWordSrtCues(cleanedCues), settings, keepTogetherPhrases).map((cue) => ({
    ...cue,
    text: cleanSubtitleText(applyLocalSpellingRules(cue.text, spellingRules))
        .replace(/[.!?,]+$/g, "")
        .trim()
  })).filter((cue) => cue.text);
}

function applyLocalSpellingRules(text, spellingRules) {
  return (spellingRules || []).reduce((updated, rule) => {
    const original = (rule.original || "").trim();
    const replacement = (rule.replacement || "").trim();
    if (!original || !replacement) return updated;
    return updated.replace(new RegExp(escapeRegExp(original), "gi"), replacement);
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

function formatSrtCues(cues) {
  return cues.map((cue, index) => `${index + 1}\n${cue.timing}\n${cue.text}`).join("\n\n");
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
  if (currentWords.length < 2 || nextWords.length < 2) return false;

  const endWord = normalizeToken(currentWords[currentWords.length - 1]);
  const startWord = normalizeToken(nextWords[0]);
  return (currentWords.length <= 2 && !startsUppercase(nextWords[0]))
    || BAD_END_WORDS.has(endWord)
    || WEAK_END_WORDS.has(endWord)
    || (BAD_START_WORDS.has(startWord) && startsLowercase(nextWords[0]))
    || (WEAK_START_WORDS.has(startWord) && /^[a-z]/.test(nextWords[0]))
    || /[,:;]$/.test(currentWords[currentWords.length - 1]);
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
    if (leftText.length > settings.maximumCharactersPerCaption) return 0;
    if (startsUppercase(words[split])) continue;
    if (BAD_END_WORDS.has(leftEnd)) continue;
    if (BAD_START_WORDS.has(rightStart) && startsLowercase(words[split])) continue;
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

  if (leftWords.length < 2 || rightWords.length < 2) score += 1000;
  if (split === originalSplit && leftWords.length <= 2 && rightWords.length > 2) score += 100;
  if (leftText.length > settings.maximumCharactersPerCaption) score += (leftText.length - settings.maximumCharactersPerCaption) * 20;
  if (rightText.length > settings.maximumCharactersPerCaption) score += (rightText.length - settings.maximumCharactersPerCaption) * 20;
  if (BAD_END_WORDS.has(endWord)) score += 220;
  if (WEAK_END_WORDS.has(endWord)) score += 85;
  if (BAD_START_WORDS.has(startWord) && startsLowercase(rightWords[0])) score += 220;
  if (WEAK_START_WORDS.has(startWord) && /^[a-z]/.test(rightWords[0])) score += 120;
  if (/[,:;]$/.test(leftWords[leftWords.length - 1])) score += 160;
  if (wouldBreakProtectedPhraseAt(words.map((text) => ({ text })), split - 1, keepTogetherPhrases)) score += 1000;
  if (isNumberLike(endWord) && UNIT_WORDS.has(startWord)) score += 1000;

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
  return cleanSubtitleText(phrase).toLowerCase();
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
    if (isClauseSubjectFragment(cue.text) && nextCue) {
      nextCue.text = `${cue.text} ${nextCue.text}`.trim();
      nextCue.timing = `${cue.timing.split("-->")[0].trim()} --> ${nextCue.timing.split("-->")[1].trim()}`;
      return merged;
    }

    const previous = merged[merged.length - 1];
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
      if (pieces.length <= 1) return [{ timing, text }];

      return splitTimingAcrossPieces(timing, pieces).map((piece) => ({
        timing: piece.timing,
        text: piece.text
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
  if (BAD_START_WORDS.has(next) || next === "and" || next === "or") return false;
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

function wrapSubtitleText(text, maxCharactersPerRow) {
  const words = cleanSubtitleText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharactersPerRow && line) {
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
  buildSrtFromUtterances,
  postProcessSrtText,
  applySrtRules,
  splitSrtAtSentenceBoundaries,
  defaultSettings
};
