const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getClipboardHistory: () => ipcRenderer.invoke('get-clipboard-history'),
  deleteItem: (index) => ipcRenderer.invoke('delete-item', index),
  deleteAll: () => ipcRenderer.invoke('delete-all'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  setAutoStartup: (enabled) => ipcRenderer.invoke('set-auto-startup', enabled),
  getAutoStartup: () => ipcRenderer.invoke('get-auto-startup'),
  onClipboardUpdated: (callback) => {
    ipcRenderer.on('clipboard-updated', (event, history) => callback(history));
  },
  onShowToast: (callback) => {
    ipcRenderer.on('show-toast', (event, message) => callback(message));
  },
  onMonitoringChanged: (callback) => {
    ipcRenderer.on('monitoring-changed', (event, status) => callback(status));
  },
  onAutoStartupChanged: (callback) => {
    ipcRenderer.on('auto-startup-changed', (event, enabled) => callback(enabled));
  },
  trayAction: (action, data) => ipcRenderer.send('tray-action', action, data),
  getMonitoringStatus: () => ipcRenderer.invoke('get-monitoring-status'),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  resizeTray: (height) => ipcRenderer.send('resize-tray', height),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
  getLogoData: () => ipcRenderer.invoke('get-logo-data')
});
