const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("subtitleApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  pickInputs: () => ipcRenderer.invoke("files:pick-inputs"),
  pickOutputFolder: () => ipcRenderer.invoke("folders:pick-output"),
  transcribe: (payload) => ipcRenderer.invoke("gladia:transcribe", payload),
  applyRules: (payload) => ipcRenderer.invoke("srt:apply-rules", payload),
  saveSrt: (payload) => ipcRenderer.invoke("srt:save", payload),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  loadHistorySrt: (historyId) => ipcRenderer.invoke("history:load-srt", historyId),
  onJobProgress: (callback) => {
    ipcRenderer.on("job:progress", (_event, data) => callback(data));
  }
});
