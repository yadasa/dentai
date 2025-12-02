const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ===== CONFIG =====
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfigFromFile: () => ipcRenderer.invoke('load-config-from-file'),

  // ===== HISTORY / CALLS =====
  getHistory: () => ipcRenderer.invoke('get-history'),
  startCall: (payload) => ipcRenderer.invoke('start-call', payload),
  refreshCall: (callSid) => ipcRenderer.invoke('refresh-call', callSid),

  // ===== XI =====
  fetchConversations: () => ipcRenderer.invoke('xi-get-conversations'),
  fetchConversationDetail: (conversationId) =>
    ipcRenderer.invoke('xi-get-conversation-detail', conversationId),
  addKnowledgeUrl: (payload) =>
    ipcRenderer.invoke('xi-add-knowledge-url', payload),

  // ===== GOOGLE CALENDAR =====
  listAppointments: () => ipcRenderer.invoke('gcal-list-appointments'),

  // ===== APP / VERSION =====
  getVersion: () => ipcRenderer.invoke('get-version'),

  // ===== ✅ AUTO UPDATE (NEW FIXED FLOW) =====
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  checkForUpdates: () => ipcRenderer.invoke('check-updates'), // alias
  installDownloadedUpdate: () => ipcRenderer.invoke('install-downloaded-update') // ✅ REQUIRED
});
