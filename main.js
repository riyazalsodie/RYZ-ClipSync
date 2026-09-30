const { app, BrowserWindow, clipboard, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;
let trayWindow = null;
let tray = null;
let lastClipboardContent = '';
let lastClipboardImageHash = '';
let clipboardHistory = [];
let DATA_FILE;
let IMAGES_DIR;
let isMonitoring = true;

function getImagesDir() {
  if (!IMAGES_DIR) {
    IMAGES_DIR = path.join(app.getPath('userData'), 'images');
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  return IMAGES_DIR;
}

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
      const parsed = JSON.parse(data);
      clipboardHistory = (Array.isArray(parsed) ? parsed : []).map(item => {
        if (!item.type) {
          item.type = item.imagePath || item.thumbnail ? 'image' : 'text';
        }
        return item;
      });
    }
  } catch (error) {
    console.error('Error loading clipboard history:', error);
    clipboardHistory = [];
  }
}

let saveTimeout = null;

// Save clipboard history to file (debounced and asynchronous)
function saveClipboardHistory() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    fs.writeFile(getDataFile(), JSON.stringify(clipboardHistory, null, 2), 'utf8', (error) => {
      if (error) {
        console.error('Error saving clipboard history:', error);
      }
    });
  }, 1000); // Debounce saving by 1 second
}

// Save clipboard history synchronously (used on exit)
function saveClipboardHistorySync() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    fs.writeFileSync(getDataFile(), JSON.stringify(clipboardHistory, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving clipboard history synchronously:', error);
  }
}

// Trim history to limit, clean up deleted image files, and broadcast update
function trimHistoryAndSave() {
  const MAX_HISTORY_ITEMS = 10000;
  if (clipboardHistory.length > MAX_HISTORY_ITEMS) {
    const removedItems = clipboardHistory.splice(MAX_HISTORY_ITEMS);
    for (const item of removedItems) {
      if (item.type === 'image' && item.imagePath) {
        try {
          if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath);
        } catch (e) {}
      }
    }
  }

  saveClipboardHistory();
  if (tray) updateTrayMenu();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('clipboard-updated', clipboardHistory);
  }
}

// Add new text clipboard item
function addClipboardTextItem(text) {
  if (!text || text === lastClipboardContent) {
    return;
  }

  // Fast check to skip empty/whitespace strings
  const hasContent = text.length > 100 ? true : text.trim() !== '';
  if (!hasContent) return;

  // Truncate extremely large texts to prevent memory/performance issues
  const MAX_ITEM_TEXT_LENGTH = 50000;
  let processedText = text;
  if (text.length > MAX_ITEM_TEXT_LENGTH) {
    processedText = text.substring(0, MAX_ITEM_TEXT_LENGTH) + '... (truncated)';
  }

  lastClipboardContent = text; // Keep track of original text to prevent duplicate triggers
  lastClipboardImageHash = '';

  // Remove duplicate if exists (compare against processed text)
  clipboardHistory = clipboardHistory.filter(item => item.type === 'image' || item.text !== processedText);

  // Add to beginning
  clipboardHistory.unshift({
    type: 'text',
    text: processedText,
    timestamp: Date.now()
  });

  trimHistoryAndSave();
}

const addClipboardItem = addClipboardTextItem;

// Add new image clipboard item
function addClipboardImageItem(nativeImg, hash) {
  if (!nativeImg || nativeImg.isEmpty()) return;

  const size = nativeImg.getSize();
  const width = size.width;
  const height = size.height;
  if (width === 0 || height === 0) return;

  lastClipboardImageHash = hash;
  lastClipboardContent = '';

  const id = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7);
  const imagesDir = getImagesDir();
  const imagePath = path.join(imagesDir, `${id}.png`);

  try {
    const pngBuf = nativeImg.toPNG();
    fs.writeFile(imagePath, pngBuf, (err) => {
      if (err) console.error('Error saving image to disk:', err);
    });
  } catch (err) {
    console.error('Error creating image buffer:', err);
  }

  // Generate lightweight thumbnail data URL for UI rendering
  const maxThumbWidth = 380;
  const maxThumbHeight = 240;
  let thumbImg = nativeImg;
  if (width > maxThumbWidth || height > maxThumbHeight) {
    const scale = Math.min(maxThumbWidth / width, maxThumbHeight / height);
    thumbImg = nativeImg.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'better'
    });
  }
  const thumbnail = thumbImg.toDataURL();

  // Remove existing duplicate image if present
  const existingIdx = clipboardHistory.findIndex(item => item.type === 'image' && item.hash === hash);
  if (existingIdx !== -1) {
    const oldItem = clipboardHistory.splice(existingIdx, 1)[0];
    if (oldItem && oldItem.imagePath && oldItem.imagePath !== imagePath) {
      try {
        if (fs.existsSync(oldItem.imagePath)) fs.unlinkSync(oldItem.imagePath);
      } catch (e) {}
    }
  }

  clipboardHistory.unshift({
    id: id,
    type: 'image',
    hash: hash,
    imagePath: imagePath,
    thumbnail: thumbnail,
    width: width,
    height: height,
    timestamp: Date.now()
  });

  trimHistoryAndSave();
}

// Monitor clipboard
function startClipboardMonitoring() {
  loadClipboardHistory();
  try {
    lastClipboardContent = clipboard.readText();
  } catch (error) {
    lastClipboardContent = '';
  }
  try {
    const initialImg = clipboard.readImage();
    if (initialImg && !initialImg.isEmpty()) {
      const size = initialImg.getSize();
      if (size.width > 0 && size.height > 0) {
        lastClipboardImageHash = crypto.createHash('md5').update(initialImg.toBitmap()).digest('hex');
      }
    }
  } catch (error) {
    lastClipboardImageHash = '';
  }

  setInterval(() => {
    if (!isMonitoring) return;
    try {
      let currentText = '';
      try {
        currentText = clipboard.readText();
      } catch (e) {}

      let currentImg = null;
      let hasImage = false;
      let imgHash = '';
      try {
        currentImg = clipboard.readImage();
        if (currentImg && !currentImg.isEmpty()) {
          const size = currentImg.getSize();
          if (size.width > 0 && size.height > 0) {
            hasImage = true;
            imgHash = crypto.createHash('md5').update(currentImg.toBitmap()).digest('hex');
          }
        }
      } catch (e) {}

      const hasText = Boolean(currentText && (currentText.length > 100 || currentText.trim() !== ''));

      // If image is present and changed
      if (hasImage && (!hasText || (imgHash !== lastClipboardImageHash && currentText === lastClipboardContent))) {
        if (imgHash !== lastClipboardImageHash) {
          addClipboardImageItem(currentImg, imgHash);
        }
      } else if (hasText) {
        if (currentText !== lastClipboardContent) {
          addClipboardTextItem(currentText);
        }
      } else if (hasImage) {
        if (imgHash !== lastClipboardImageHash) {
          addClipboardImageItem(currentImg, imgHash);
        }
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
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

  const isHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;

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
    show: !isHidden,
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
    const removed = clipboardHistory.splice(index, 1)[0];
    if (removed && removed.type === 'image' && removed.imagePath) {
      try {
        if (fs.existsSync(removed.imagePath)) {
          fs.unlinkSync(removed.imagePath);
        }
      } catch (e) {
        console.error('Error removing image file on delete:', e);
      }
    }
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
  const imgDir = getImagesDir();
  try {
    if (fs.existsSync(imgDir)) {
      const files = fs.readdirSync(imgDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(imgDir, file));
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error('Error clearing images directory:', e);
  }

  clipboardHistory = [];
  lastClipboardContent = '';
  lastClipboardImageHash = '';
  saveClipboardHistory();
  updateTrayMenu(); // Refresh tray menu after clearing all
  if (mainWindow) {
    mainWindow.webContents.send('clipboard-updated', clipboardHistory);
  }
  return clipboardHistory;
});

ipcMain.handle('copy-text', (event, text) => {
  lastClipboardContent = text;
  lastClipboardImageHash = '';
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('copy-image', (event, imageSource) => {
  try {
    let nativeImg;
    if (typeof imageSource === 'string') {
      if (imageSource.startsWith('data:')) {
        nativeImg = nativeImage.createFromDataURL(imageSource);
      } else if (fs.existsSync(imageSource)) {
        nativeImg = nativeImage.createFromPath(imageSource);
      }
    }
    if (nativeImg && !nativeImg.isEmpty()) {
      lastClipboardImageHash = crypto.createHash('md5').update(nativeImg.toBitmap()).digest('hex');
      lastClipboardContent = '';
      clipboard.writeImage(nativeImg);
      return true;
    }
  } catch (err) {
    console.error('Error copying image to clipboard:', err);
  }
  return false;
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
  const loginSettings = {
    openAtLogin: enabled,
    openAsHidden: enabled,
    path: app.getPath('exe'),
    args: enabled ? ['--hidden'] : []
  };

  // For development mode, ensure electron binary loads the app
  if (!app.isPackaged) {
    loginSettings.args.unshift(app.getAppPath());
  }

  app.setLoginItemSettings(loginSettings);

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
  const loginSettings = {
    path: app.getPath('exe'),
    args: ['--hidden']
  };

  if (!app.isPackaged) {
    loginSettings.args.unshift(app.getAppPath());
  }

  return app.getLoginItemSettings(loginSettings).openAtLogin;
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  saveClipboardHistorySync();
});
