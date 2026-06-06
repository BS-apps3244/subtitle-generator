const state = {
  settings: null,
  queue: [],
  selectedFilePath: "",
  completed: new Map(),
  updateUrl: "",
  updateAvailable: false,
  updateVersion: "",
  dismissedUpdateVersion: ""
};

const $ = (selector) => document.querySelector(selector);
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;
const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  "mp4", "mpeg", "mpg", "mpe", "mov", "m4v", "avi", "wmv", "webm", "mkv", "flv", "3gp", "3g2",
  "mp3", "wav", "aac", "m4a", "flac", "ogg", "oga", "opus", "wma", "aiff", "aif", "amr"
]);

window.addEventListener("DOMContentLoaded", async () => {
  bindTabs();
  bindJobs();
  bindFileDrops();
  bindSettings();
  bindDictionary();
  bindHistory();
  bindUpdates();
  window.subtitleApp.onJobProgress(updateJobProgress);
  window.subtitleApp.onUpdateEvent(updateInstallProgress);
  $("#app-version").textContent = `Version ${await window.subtitleApp.getAppVersion()}`;
  state.settings = await window.subtitleApp.getSettings();
  hydrateSettings();
  renderDictionary();
  renderHistory();
  renderQueue();
  await checkForUpdates();
  window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
});

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      $(`#${tab.dataset.view}-view`).classList.add("active");
    });
  });
}

function bindJobs() {
  $("#add-files").addEventListener("click", async () => {
    const paths = await window.subtitleApp.pickInputs();
    addFiles(paths);
  });

  $("#clear-queue").addEventListener("click", () => {
    state.queue = [];
    state.selectedFilePath = "";
    state.completed.clear();
    $("#srt-editor").value = "";
    $("#save-srt").disabled = true;
    $("#apply-rules").disabled = true;
    $("#editor-status").textContent = "Waiting for a completed job.";
    renderQueue();
  });

  $("#start-batch").addEventListener("click", startBatch);
  $("#apply-rules").addEventListener("click", applyRulesToEditor);
  $("#save-srt").addEventListener("click", saveSelectedSrt);
}

function bindFileDrops() {
  const dropTarget = document.querySelector(".queue-panel");
  let dragDepth = 0;

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
    });
  });

  dropTarget.addEventListener("dragenter", (event) => {
    if (!hasDraggedFiles(event)) return;
    dragDepth += 1;
    dropTarget.classList.add("drop-active");
  });

  dropTarget.addEventListener("dragover", (event) => {
    if (!hasDraggedFiles(event)) return;
    event.dataTransfer.dropEffect = "copy";
  });

  dropTarget.addEventListener("dragleave", (event) => {
    if (!hasDraggedFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropTarget.classList.remove("drop-active");
  });

  dropTarget.addEventListener("drop", (event) => {
    if (!hasDraggedFiles(event)) return;
    dragDepth = 0;
    dropTarget.classList.remove("drop-active");
    const paths = droppedMediaPaths(event);
    const added = addFiles(paths);

    if (added > 0) {
      setStatus(`Added ${added} file${added === 1 ? "" : "s"} to the queue.`);
    } else if (event.dataTransfer.files.length > 0) {
      setStatus("Drop supported audio or video files to add them to the queue.");
    }
  });
}

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function droppedMediaPaths(event) {
  return Array.from(event.dataTransfer.files || [])
    .filter(isSupportedMediaFile)
    .map((file) => window.subtitleApp.getPathForFile(file))
    .filter(Boolean);
}

function isSupportedMediaFile(file) {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  const filePath = window.subtitleApp.getPathForFile(file);
  return filePath && SUPPORTED_MEDIA_EXTENSIONS.has(filePath.split(".").pop().toLowerCase());
}

function bindSettings() {
  $("#choose-output").addEventListener("click", async () => {
    const folder = await window.subtitleApp.pickOutputFolder();
    if (folder) $("#output-folder").value = folder;
  });

  $("#save-settings").addEventListener("click", async () => {
    state.settings = collectSettings();
    state.settings = await window.subtitleApp.saveSettings(state.settings);
    setStatus("Settings saved.");
  });
}

function bindDictionary() {
  $("#add-vocab").addEventListener("click", () => {
    state.settings.vocabulary.push({ value: "", pronunciations: "", intensity: "", language: "" });
    renderDictionary();
  });

  $("#add-spelling").addEventListener("click", () => {
    state.settings.spellingRules.push({ original: "", replacement: "" });
    renderDictionary();
  });

  $("#save-dictionary").addEventListener("click", async () => {
    collectDictionary();
    state.settings = await window.subtitleApp.saveSettings(state.settings);
    renderDictionary();
    setStatus("Dictionary saved.");
  });
}

function bindHistory() {
  $("#clear-history").addEventListener("click", async () => {
    state.settings = await window.subtitleApp.clearHistory();
    renderHistory();
  });
}

function bindUpdates() {
  $("#dismiss-update").addEventListener("click", () => {
    state.dismissedUpdateVersion = state.updateVersion;
    $("#update-gate").classList.add("hidden");
  });
  $("#open-release").addEventListener("click", installUpdate);
}

async function checkForUpdates() {
  const gate = $("#update-gate");
  const message = $("#update-message");
  gate.classList.add("hidden");

  try {
    const result = await window.subtitleApp.checkForUpdates();
    if (result.updateRequired) {
      state.updateUrl = result.updateUrl || "";
      state.updateAvailable = true;
      state.updateVersion = result.latestVersion || "";
      if (state.dismissedUpdateVersion === state.updateVersion) return;
      message.textContent = result.message || `This app is version ${result.currentVersion}. Version ${result.latestVersion} is available. You can update now or keep working and update later.`;
      $("#open-release").hidden = false;
      $("#open-release").disabled = false;
      $("#open-release").textContent = "Update Now";
      gate.classList.remove("hidden");
      return;
    }

    if (result.checkFailed) {
      setStatus(`${result.message} You can keep using the app.`);
      return;
    }

    gate.classList.add("hidden");
  } catch (error) {
    setStatus(`Update check failed: ${error.message}. You can keep using the app.`);
  }
}

async function installUpdate() {
  if (!state.updateAvailable) return;
  const message = $("#update-message");
  const button = $("#open-release");
  button.disabled = true;
  button.textContent = "Preparing...";
  message.textContent = "Preparing the update download...";

  try {
    const result = await window.subtitleApp.downloadAndInstallUpdate();
    if (result && result.started === false) {
      message.textContent = result.message;
      button.disabled = false;
      button.textContent = "Update Now";
    }
  } catch (error) {
    message.textContent = `Update failed: ${error.message}`;
    button.disabled = false;
    button.textContent = "Try Again";
  }
}

function updateInstallProgress(event) {
  const gate = $("#update-gate");
  const message = $("#update-message");
  const button = $("#open-release");
  gate.classList.remove("hidden");

  if (event.status === "checking") {
    message.textContent = "Checking the update package...";
    button.disabled = true;
    button.textContent = "Preparing...";
  } else if (event.status === "downloading") {
    message.textContent = `Downloading update${Number.isFinite(event.percent) ? ` (${event.percent}%)` : ""}...`;
    button.disabled = true;
    button.textContent = "Downloading...";
  } else if (event.status === "installing") {
    message.textContent = "Update downloaded. The app will restart to install it.";
    button.disabled = true;
    button.textContent = "Installing...";
  } else if (event.status === "error") {
    message.textContent = event.message || "Update failed.";
    button.disabled = false;
    button.textContent = "Try Again";
  }
}

function hydrateSettings() {
  $("#admin-secret").value = state.settings.adminSecret || "";
  $("#transcription-provider").value = state.settings.transcriptionProvider || "elevenlabs";
  $("#whisper-model").value = state.settings.whisperModel || "base.en";
  $("#output-folder").value = state.settings.outputFolder || "";
  $("#max-chars").value = state.settings.subtitleDefaults.maximum_characters_per_row;
  $("#max-rows").value = state.settings.subtitleDefaults.maximum_rows_per_caption;
  $("#min-duration").value = state.settings.subtitleDefaults.minimum_duration;
  $("#target-duration").value = state.settings.subtitleDefaults.target_duration;
  $("#max-duration").value = state.settings.subtitleDefaults.maximum_duration;
  $("#caption-gap").value = state.settings.subtitleDefaults.caption_gap;
  $("#silence-gap").value = state.settings.subtitleDefaults.split_on_silence_gap;
  $("#subtitle-style").value = state.settings.subtitleDefaults.style;
  $("#vocab-intensity").value = state.settings.vocabularyDefaultIntensity;
}

function collectSettings() {
  collectDictionary();
  return {
    ...state.settings,
    adminSecret: $("#admin-secret").value.trim(),
    transcriptionProvider: $("#transcription-provider").value,
    whisperModel: $("#whisper-model").value,
    outputFolder: $("#output-folder").value.trim(),
    subtitleDefaults: {
      maximum_characters_per_row: Number($("#max-chars").value || 45),
      maximum_rows_per_caption: Number($("#max-rows").value || 1),
      minimum_duration: Number($("#min-duration").value || 1),
      target_duration: Number($("#target-duration").value || 1.2),
      maximum_duration: Number($("#max-duration").value || 3),
      caption_gap: Number($("#caption-gap").value || 0),
      split_on_silence_gap: Number($("#silence-gap").value || 0.5),
      style: $("#subtitle-style").value
    }
  };
}

function collectDictionary() {
  state.settings.vocabularyDefaultIntensity = Number($("#vocab-intensity").value || 0.4);
  state.settings.vocabulary = Array.from(document.querySelectorAll(".rule-item.vocab")).map((row) => ({
    value: row.querySelector("[data-field='value']").value.trim(),
    pronunciations: row.querySelector("[data-field='pronunciations']").value.trim(),
    intensity: row.querySelector("[data-field='intensity']").value,
    language: row.querySelector("[data-field='language']").value.trim(),
    cloudId: row.dataset.cloudId || "",
    cloudStatus: row.dataset.cloudStatus || "",
    ownerUserId: row.dataset.ownerUserId || ""
  })).filter((entry) => entry.value);

  state.settings.spellingRules = Array.from(document.querySelectorAll(".rule-item.spelling")).map((row) => ({
    original: row.querySelector("[data-field='original']").value.trim(),
    replacement: row.querySelector("[data-field='replacement']").value.trim(),
    cloudId: row.dataset.cloudId || "",
    cloudStatus: row.dataset.cloudStatus || "",
    ownerUserId: row.dataset.ownerUserId || ""
  })).filter((rule) => rule.original && rule.replacement);
}

function addFiles(paths) {
  const known = new Set(state.queue.map((item) => item.filePath));
  let added = 0;
  paths.forEach((filePath) => {
    if (!known.has(filePath)) {
      state.queue.push({
        filePath,
        fileName: filePath.split(/[\\/]/).pop(),
        status: "queued",
        message: "Ready"
      });
      known.add(filePath);
      added += 1;
    }
  });
  if (!state.selectedFilePath && state.queue[0]) state.selectedFilePath = state.queue[0].filePath;
  renderQueue();
  return added;
}

async function startBatch() {
  state.settings = collectSettings();
  state.settings = await window.subtitleApp.saveSettings(state.settings);
  const pending = state.queue.filter((item) => item.status !== "done");
  if (pending.length === 0) return;

  $("#start-batch").disabled = true;
  for (const item of pending) {
    item.status = "uploading";
    item.message = "Starting";
    renderQueue();

    try {
      const result = await window.subtitleApp.transcribe({
        ...state.settings,
        filePath: item.filePath
      });
      state.completed.set(item.filePath, result.srtText);
      item.status = "done";
      item.message = "Ready to export";
      selectFile(item.filePath);
      state.settings = await window.subtitleApp.getSettings();
      renderHistory();
    } catch (error) {
      item.status = "error";
      item.message = error.message;
      setStatus(error.message);
    }
    renderQueue();
  }
  $("#start-batch").disabled = false;
}

async function saveSelectedSrt() {
  const selected = state.queue.find((item) => item.filePath === state.selectedFilePath);
  if (!selected) return;

  const outputPath = await window.subtitleApp.saveSrt({
    filePath: selected.filePath,
    outputFolder: $("#output-folder").value.trim(),
    srtText: $("#srt-editor").value
  });
  if (!outputPath) return;

  setStatus(`Saved ${outputPath}`);
}

async function applyRulesToEditor() {
  state.settings = collectSettings();
  state.settings = await window.subtitleApp.saveSettings(state.settings);
  const updated = await window.subtitleApp.applyRules({
    ...state.settings,
    filePath: state.selectedFilePath,
    srtText: $("#srt-editor").value
  });
  $("#srt-editor").value = updated;
  if (state.selectedFilePath) state.completed.set(state.selectedFilePath, updated);
  setStatus("Rules applied to current SRT text without calling the transcription service.");
}

function selectFile(filePath) {
  state.selectedFilePath = filePath;
  const srt = state.completed.get(filePath) || "";
  $("#srt-editor").value = srt;
  $("#save-srt").disabled = !srt;
  $("#apply-rules").disabled = !srt;
  $("#editor-status").textContent = srt ? "Review/edit the SRT, then save." : "Waiting for this job to complete.";
  renderQueue();
}

function renderQueue() {
  const list = $("#queue-list");
  if (state.queue.length === 0) {
    list.className = "queue-list empty";
    list.textContent = "No files added yet.";
    return;
  }

  list.className = "queue-list";
  list.innerHTML = "";
  state.queue.forEach((item) => {
    const row = document.createElement("button");
    row.className = `queue-item ${item.filePath === state.selectedFilePath ? "selected" : ""}`;
    row.type = "button";
    row.innerHTML = `
      <div class="queue-name"></div>
      <div class="queue-meta"></div>
    `;
    row.querySelector(".queue-name").textContent = item.fileName;
    row.querySelector(".queue-meta").textContent = `${item.status} · ${item.message}`;
    row.addEventListener("click", () => selectFile(item.filePath));
    list.appendChild(row);
  });
}

function renderDictionary() {
  $("#vocab-intensity").value = state.settings.vocabularyDefaultIntensity;
  const vocabList = $("#vocab-list");
  vocabList.innerHTML = "";
  state.settings.vocabulary.forEach((entry, index) => {
    const row = createRuleRow("vocab", entry, [
      ["value", "Term", entry.value],
      ["pronunciations", "Pronunciations", entry.pronunciations],
      ["intensity", "Intensity", entry.intensity],
      ["language", "Language", entry.language]
    ], async () => {
      collectDictionary();
      if (entry.cloudId) {
        state.settings = await window.subtitleApp.dictionaryAction({ action: "remove", id: entry.cloudId });
        renderDictionary();
        return;
      }
      state.settings.vocabulary.splice(index, 1);
      renderDictionary();
    });
    vocabList.appendChild(row);
  });

  const spellingList = $("#spelling-list");
  spellingList.innerHTML = "";
  state.settings.spellingRules.forEach((rule, index) => {
    const row = createRuleRow("spelling", rule, [
      ["original", "Find", rule.original],
      ["replacement", "Replace", rule.replacement]
    ], async () => {
      collectDictionary();
      if (rule.cloudId) {
        state.settings = await window.subtitleApp.dictionaryAction({ action: "remove", id: rule.cloudId });
        renderDictionary();
        return;
      }
      state.settings.spellingRules.splice(index, 1);
      renderDictionary();
    });
    spellingList.appendChild(row);
  });
}

function createRuleRow(type, entry, fields, onRemove) {
  const row = document.createElement("div");
  row.className = `rule-item ${type}`;
  row.dataset.cloudId = entry.cloudId || "";
  row.dataset.cloudStatus = entry.cloudStatus || "";
  row.dataset.ownerUserId = entry.ownerUserId || "";
  const canEdit = canEditDictionaryEntry(entry);
  fields.forEach(([field, placeholder, value]) => {
    const input = document.createElement("input");
    input.dataset.field = field;
    input.placeholder = placeholder;
    input.value = value || "";
    input.disabled = !canEdit;
    row.appendChild(input);
  });
  if (entry.cloudStatus) {
    const meta = document.createElement("div");
    meta.className = "rule-meta";
    meta.textContent = entry.cloudStatus === "approved_global" ? "Approved global" : "Synced pending";
    row.appendChild(meta);
  }
  if (state.settings.adminSecret && entry.cloudId && entry.cloudStatus === "pending_user") {
    const approve = document.createElement("button");
    approve.type = "button";
    approve.textContent = "Approve";
    approve.addEventListener("click", async () => {
      state.settings = await window.subtitleApp.dictionaryAction({ action: "approve", id: entry.cloudId });
      renderDictionary();
    });
    row.appendChild(approve);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.disabled = !canEdit;
  remove.addEventListener("click", onRemove);
  row.appendChild(remove);
  return row;
}

function canEditDictionaryEntry(entry) {
  if (!entry.cloudId) return true;
  if (state.settings.adminSecret) return true;
  return entry.cloudStatus === "pending_user" && entry.ownerUserId === state.settings.userId;
}

function renderHistory() {
  const list = $("#history-list");
  const history = state.settings.history || [];
  if (history.length === 0) {
    list.className = "history-list empty";
    list.textContent = "No completed jobs yet.";
    return;
  }

  list.className = "history-list";
  list.innerHTML = "";
  history.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `
      <div class="history-name"></div>
      <div class="history-meta"></div>
      <button type="button">Load SRT</button>
    `;
    row.querySelector(".history-name").textContent = item.fileName;
    row.querySelector(".history-meta").textContent = `${new Date(item.createdAt).toLocaleString()}${item.archivePath ? " · SRT saved" : ""}`;
    row.querySelector("button").disabled = !item.archivePath;
    row.querySelector("button").addEventListener("click", () => loadHistorySrt(item.id));
    list.appendChild(row);
  });
}

async function loadHistorySrt(historyId) {
  const item = await window.subtitleApp.loadHistorySrt(historyId);
  const existing = state.queue.find((job) => job.filePath === item.filePath);
  if (!existing) {
    state.queue.push({
      filePath: item.filePath,
      fileName: item.fileName,
      status: "done",
      message: "Loaded from history"
    });
  }
  state.completed.set(item.filePath, item.srtText);
  selectFile(item.filePath);
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === "jobs"));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === "jobs-view"));
  setStatus("Loaded SRT from history.");
}

function updateJobProgress(progress) {
  const item = state.queue.find((job) => job.filePath === progress.filePath);
  if (!item) return;
  item.status = progress.status;
  item.message = progress.message;
  renderQueue();
}

function setStatus(message) {
  $("#editor-status").textContent = message;
}
