const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  startCall: (payload) => ipcRenderer.invoke('start-call', payload),
  refreshCall: (callSid) => ipcRenderer.invoke('refresh-call', callSid)
});
