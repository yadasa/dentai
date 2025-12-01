const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  getHistory: () => ipcRenderer.invoke('get-history'),
  listKnowledgeDocs: () => ipcRenderer.invoke('xi-list-knowledge-docs'),

  startCall: (payload) => ipcRenderer.invoke('start-call', payload),
  refreshCall: (callSid) => ipcRenderer.invoke('refresh-call', callSid),

  // 👇 NEW: startup update check
  checkForUpdates: () => ipcRenderer.invoke('check-updates'),

  listAppointments: () => ipcRenderer.invoke('gcal-list-appointments'),


  //
  fetchConversations: () => ipcRenderer.invoke('xi-get-conversations'),
  fetchConversationDetail: (conversationId) =>
    ipcRenderer.invoke('xi-get-conversation-detail', conversationId),
  addKnowledgeUrl: (payload) =>
    ipcRenderer.invoke('xi-add-knowledge-url', payload)  ,
  listAppointments: () => ipcRenderer.invoke('gcal-list-appointments')

});
