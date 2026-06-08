const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('imageForge', {
  selectImages: () => ipcRenderer.invoke('select-images'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  getFileStats: (files) => ipcRenderer.invoke('get-file-stats', files),
  optimiseImages: (payload) => ipcRenderer.invoke('optimise-images', payload),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath)
});
