const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('imageForge', {
  selectImages: () => ipcRenderer.invoke('select-images'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  resolveInputPaths: (paths) => ipcRenderer.invoke('resolve-input-paths', paths),
  resolveInputPathDetails: (paths) => ipcRenderer.invoke('resolve-input-path-details', paths),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getFileStats: (files) => ipcRenderer.invoke('get-file-stats', files),
  optimiseImages: (payload) => ipcRenderer.invoke('optimise-images', payload),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath)
});
