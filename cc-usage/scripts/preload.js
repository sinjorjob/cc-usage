const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window drag
  windowDragTo: (x, y) => ipcRenderer.send('window-drag-to', { x, y }),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),

  // Cursor
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),

  // Context menu
  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  // Usage data
  refreshUsage: () => ipcRenderer.send('refresh-usage'),
  getLastUsage: () => ipcRenderer.invoke('get-last-usage'),
  onUsageUpdate: (callback) => ipcRenderer.on('usage-update', (_, data) => callback(data)),
  onUsageFetching: (callback) => ipcRenderer.on('usage-fetching', () => callback()),
  onUsageError: (callback) => ipcRenderer.on('usage-error', (_, err) => callback(err)),
});
