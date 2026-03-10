const { app, BrowserWindow, clipboard, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let trayWindow = null;
let tray = null;
let lastClipboardContent = '';
let clipboardHistory = [];
let DATA_FILE;
let isMonitoring = true;

function getAssetPath(filename) {
  // In packaged app, check extraResources first, then app directory
  if (app.isPackaged) {
    const resourcePath = path.join(process.resourcesPath, filename);
    if (fs.existsSync(resourcePath)) return resourcePath;
  }
  // Dev mode or fallback
  return path.join(__dirname, filename);
}

function getDataFile() {
  if (!DATA_FILE) {
    DATA_FILE = path.join(app.getPath('userData'), 'clipboard_history.json');
  }
  return DATA_FILE;
}

function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: 360, // Increased for shadow padding (260 + 100px buffer)
    height: 580, // Increased for shadow padding (480 + 100px buffer)
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  trayWindow.loadFile('tray.html');

  // Hide when it loses focus
  trayWindow.on('blur', () => {
    if (trayWindow && !trayWindow.isDestroyed()) {
      trayWindow.hide();
    }
  });
}

function getTrayWindowPosition() {
  const trayBounds = tray.getBounds();
  const windowBounds = trayWindow.getBounds();
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  // On Windows, tray is usually at bottom right
  // We center the window above/below the tray icon
  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));

  // Basic bounds check to ensure it's not off-screen
  if (x + windowBounds.width > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - windowBounds.width - 10;
  }
  if (x < workArea.x) {
    x = workArea.x + 10;
  }

  // Position it just above the taskbar if taskbar is at bottom
  let y;
  const padding = 40; // From tray.css body padding
  if (trayBounds.y > workArea.height / 2) {
    // Taskbar is at bottom
    // We want the bottom of the tray-container (visible part) to be near the tray icon
    // tray-container bottom = y + padding + contentHeight
    // trayWindow height = contentHeight + 2 * padding
    // So y = trayBounds.y - windowBounds.height + padding + 5
    y = Math.round(trayBounds.y - windowBounds.height + padding + 8);
  } else {
    // Taskbar is at top
    y = Math.round(trayBounds.y + trayBounds.height - padding - 8);
  }

  return { x, y };
}

function toggleTrayWindow() {
  if (!trayWindow || trayWindow.isDestroyed()) return;

  if (trayWindow.isVisible()) {
    trayWindow.hide();
  } else {
    const { x, y } = getTrayWindowPosition();
    trayWindow.setPosition(x, y, false);
    trayWindow.show();
    trayWindow.focus();
    // Refresh data when shown
    if (trayWindow && !trayWindow.isDestroyed()) {
      trayWindow.webContents.send('clipboard-updated', clipboardHistory);
      trayWindow.webContents.send('monitoring-changed', isMonitoring);
    }
  }
}

// Load clipboard history from file
function loadClipboardHistory() {
  try {
    if (fs.existsSync(getDataFile())) {
      const data = fs.readFileSync(getDataFile(), 'utf8');
      clipboardHistory = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading clipboard history:', error);
    clipboardHistory = [];
  }
}

// Save clipboard history to file
function saveClipboardHistory() {
  try {
    fs.writeFileSync(getDataFile(), JSON.stringify(clipboardHistory, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving clipboard history:', error);
  }
}

// Add new clipboard item
function addClipboardItem(text) {
  if (!text || text.trim() === '' || text === lastClipboardContent) {
    return;
  }

  lastClipboardContent = text;

  // Remove duplicate if exists
  clipboardHistory = clipboardHistory.filter(item => item.text !== text);

  // Add to beginning
  clipboardHistory.unshift({
    text: text,
    timestamp: Date.now()
  });

  // Limit to 1000 items
  if (clipboardHistory.length > 1000) {
    clipboardHistory = clipboardHistory.slice(0, 1000);
  }

  saveClipboardHistory();
  if (tray) updateTrayMenu();

  if (mainWindow) {
    mainWindow.webContents.send('clipboard-updated', clipboardHistory);
  }
}

// Monitor clipboard
function startClipboardMonitoring() {
  loadClipboardHistory();
  lastClipboardContent = clipboard.readText();

  setInterval(() => {
    if (!isMonitoring) return;
    const current = clipboard.readText();
    if (current !== lastClipboardContent && current.trim() !== '') {
      addClipboardItem(current);
    }
  }, 1000);
}

function createWindow() {
  ipcMain.handle('get-logo-data', () => {
    const iconPath = getAssetPath('logo.png');
    if (fs.existsSync(iconPath)) {
      // Resize to 32x32 for UI consistency and performance
      return nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }).toDataURL();
    }
    return '';
  });

  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    maxWidth: 520,
    frame: false,
    transparent: true,
    hasShadow: false,
    maximizable: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: getAssetPath('logo.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    if (app.isQuitting) {
      mainWindow = null;
    } else {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'RYZ ClipSync',
          content: 'Running in system tray. Double-click tray icon to restore.'
        });
      }
    }
  });

  startClipboardMonitoring();
}

function createTray() {
  const iconPath = getAssetPath('logo.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  // Custom Tray Window
  createTrayWindow();

  tray.setToolTip('RYZ ClipSync');

  tray.on('click', () => {
    toggleTrayWindow();
  });

  tray.on('right-click', () => {
    toggleTrayWindow();
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Global shortcut: Ctrl+Shift+V to show/focus window
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function updateTrayMenu() {
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.webContents.send('clipboard-updated', clipboardHistory);
    trayWindow.webContents.send('monitoring-changed', isMonitoring);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// IPC Handlers
ipcMain.handle('get-clipboard-history', () => {
  return clipboardHistory;
});

ipcMain.handle('delete-item', (event, index) => {
  if (index >= 0 && index < clipboardHistory.length) {
    clipboardHistory.splice(index, 1);
    saveClipboardHistory();
    updateTrayMenu(); // Refresh tray menu after deletion
    if (mainWindow) {
      mainWindow.webContents.send('clipboard-updated', clipboardHistory);
    }
    return clipboardHistory;
  }
  return clipboardHistory;
});

ipcMain.handle('delete-all', () => {
  clipboardHistory = [];
  lastClipboardContent = '';
  saveClipboardHistory();
  updateTrayMenu(); // Refresh tray menu after clearing all
  if (mainWindow) {
    mainWindow.webContents.send('clipboard-updated', clipboardHistory);
  }
  return clipboardHistory;
});

ipcMain.handle('copy-text', (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
  return true;
});

ipcMain.handle('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.hide();
  }
  return true;
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return mainWindow?.isMaximized() || false;
});

ipcMain.handle('is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

ipcMain.handle('set-always-on-top', (event, enabled) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(enabled);
  }
  return true;
});



ipcMain.on('tray-action', (event, action) => {
  switch (action) {
    case 'open-main':
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
      break;
    case 'toggle-monitoring':
      isMonitoring = !isMonitoring;
      updateTrayMenu();
      if (mainWindow) {
        mainWindow.webContents.send('monitoring-changed', isMonitoring);
      }
      break;
    case 'quit':
      globalShortcut.unregisterAll();
      app.isQuitting = true;
      app.quit();
      break;
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

ipcMain.on('resize-tray', (event, height) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && tray) {
    const padding = 80;
    const newHeight = Math.round(height + padding);
    const bounds = win.getBounds();
    if (bounds.height !== newHeight) {
      win.setBounds({
        width: bounds.width,
        height: newHeight,
        x: bounds.x,
        y: bounds.y
      });

      // Reposition after resizing to maintain alignment with tray
      if (win.isVisible()) {
        const { x, y } = getTrayWindowPosition();
        win.setPosition(x, y, false);
      }
    }
  }
});

ipcMain.handle('get-monitoring-status', () => {
  return isMonitoring;
});

ipcMain.handle('set-auto-startup', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled
  });

  // Broadcast change to all windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auto-startup-changed', enabled);
  }
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.webContents.send('auto-startup-changed', enabled);
  }
  return true;
});

ipcMain.handle('get-auto-startup', () => {
  return app.getLoginItemSettings().openAtLogin;
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
