const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("subtitleApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  pickInputs: () => ipcRenderer.invoke("files:pick-inputs"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  pickOutputFolder: () => ipcRenderer.invoke("folders:pick-output"),
  transcribe: (payload) => ipcRenderer.invoke("gladia:transcribe", payload),
  applyRules: (payload) => ipcRenderer.invoke("srt:apply-rules", payload),
  saveSrt: (payload) => ipcRenderer.invoke("srt:save", payload),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  loadHistorySrt: (historyId) => ipcRenderer.invoke("history:load-srt", historyId),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadAndInstallUpdate: () => ipcRenderer.invoke("updates:download-and-install"),
  openUpdateUrl: (updateUrl) => ipcRenderer.invoke("updates:open-url", updateUrl),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  onUpdateEvent: (callback) => {
    ipcRenderer.on("updates:event", (_event, data) => callback(data));
  },
  onJobProgress: (callback) => {
    ipcRenderer.on("job:progress", (_event, data) => callback(data));
  }
});
