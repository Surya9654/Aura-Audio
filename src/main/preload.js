const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getStreamPort: () => ipcRenderer.invoke('get-stream-port'),
  detectHardwareDACs: () => ipcRenderer.invoke('detect-hardware-dacs'),
  selectMusicFolder: () => ipcRenderer.invoke('select-music-folder'),
  selectMusicFiles: () => ipcRenderer.invoke('select-music-files'),
  parseAudioFiles: (filePaths) => ipcRenderer.invoke('parse-audio-files', filePaths),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
  getEngineSettings: () => ipcRenderer.invoke('get-engine-settings'),
  setExclusiveAudio: (enabled) => ipcRenderer.invoke('set-exclusive-audio', enabled),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  updateWidgetState: (data) => ipcRenderer.send('widget-update-state', data),
  onWidgetAction: (callback) => ipcRenderer.on('widget-action', (_, action) => callback(action))
});
