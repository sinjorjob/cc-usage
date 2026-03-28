const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboardAPI', {
  // Window drag
  dragTo: (x, y) => ipcRenderer.send('dashboard-drag-to', { x, y }),
  getPosition: () => ipcRenderer.invoke('get-dashboard-position'),

  // Cursor
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),

  // Close
  close: () => ipcRenderer.send('close-dashboard'),

  // Refresh
  refreshContext: () => ipcRenderer.send('refresh-context'),

  // Context data
  onContextUpdate: (cb) => ipcRenderer.on('context-update', (_, data) => cb(data)),
  onContextFetching: (cb) => ipcRenderer.on('context-fetching', () => cb()),
  onContextError: (cb) => ipcRenderer.on('context-error', (_, err) => cb(err)),

  // Session (live Messages)
  setSessionCwd: (cwd) => ipcRenderer.send('set-session-cwd', cwd),
  getSessionCwd: () => ipcRenderer.invoke('get-session-cwd'),
});
