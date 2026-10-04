const { app, BrowserWindow, clipboard, Tray, Menu, nativeImage, ipcMain, globalShortcut, screen, shell } = require('electron');
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
let monitoringStarted = false;

// The main window hides to the system tray instead of closing, so the process
// usually keeps running in the background. This flag makes sure that case is
// never mistaken for a real quit.
app.isQuitting = false;

// ── Single instance lock ────────────────────────────────────────────────
// The app lives in the system tray, so it is very often already running
// (after a "start hidden" auto-startup launch, or after closing the window).
// Without this lock, opening the app again spawns a *second* process which
// competes for the tray icon, while the user sees no window at all.
// Taking the lock means a later launch just reveals the existing window.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance owns the lock and will surface its own window instead.
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

// ── Privacy: sensitive-content detection ─────────────────────────────────
// Clips that look like credentials are never written to history. Patterns are
// deliberately high-confidence (recognisable token shapes) so ordinary text is
// never dropped by mistake. Skipping is the safe failure: a missed clip is
// recoverable, a stored password is not.
const SENSITIVE_PATTERNS = [
  { name: 'Private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'AWS secret key', re: /\baws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/i },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{16,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'npm token', re: /\bnpm_[A-Za-z0-9]{30,}/ },
  { name: 'Bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/ },
  // Credentials embedded in a connection string, e.g. postgres://user:pw@host
  { name: 'Database credentials', re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@/i }
];

// Returns the matched secret type, or null when the text looks safe.
function detectSensitive(text) {
  if (!text) return null;
  // Very large payloads are documents, not credentials. Skipping the scan
  // keeps the 1s clipboard poll cheap.
  if (text.length > 20000) return null;

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.re.test(text)) return pattern.name;
  }
  return null;
}

// Strip the secret itself, keeping only enough context to recognise the clip
// (e.g. "AWS_ACCESS_KEY_ID=AKIA..."). The matched value is never retained.
function redactSensitive(text, label) {
  // Single-line marker: the stored text already says it was not saved, so the
  // UI adds the type as a separate badge rather than repeating it here.
  const safeKey = text.split(/[=:\s]/, 1)[0];
  const prefix = (safeKey && safeKey.length <= 40 ? safeKey : 'value').slice(0, 40);
  return `${prefix} = [${label} detected — not saved]`;
}

// The label the renderer shows in the redacted-item badge, without repeating
// the text that is already stored in the clip body.
function redactBadge(label) {
  return `${label || 'Secret'} — not saved`;
}

// ── Settings ─────────────────────────────────────────────────────────────
// A small JSON file next to the history. Read once at startup, written
// debounced on change, so toggles survive a restart without pulling in any
// dependency. Unknown keys fall back to the default, so adding a setting in a
// future version cannot break an older config.
const DEFAULT_SETTINGS = {
  skipSecrets: true,        // never store passwords / API keys / tokens
  captureImages: true,      // store screenshots and copied images
  mergeDuplicates: true,    // collapse repeat copies into a counter
  captureHtml: true,        // keep rich-text formatting for pastes
  pasteIntoPrevious: true,  // offer paste back into the previous app
  monitorClipboard: true,   // master switch for clipboard watching
  retentionDays: 0          // 0 = keep forever, otherwise a rolling N-day window
};

let appSettings = { ...DEFAULT_SETTINGS };

function getSettingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const file = getSettingsFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Merge over defaults so a partial or older file still yields a full set.
      appSettings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    // A corrupt settings file must never stop the app from starting.
    console.error('Failed to read settings, using defaults:', e);
    appSettings = { ...DEFAULT_SETTINGS };
  }
  return appSettings;
}

let settingsSaveTimeout = null;

function saveSettings() {
  if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);
  settingsSaveTimeout = setTimeout(() => {
    settingsSaveTimeout = null;
    try {
      fs.writeFileSync(getSettingsFile(), JSON.stringify(appSettings, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }, 300);
}

function setSetting(key, value) {
  // Reject unknown keys so the renderer cannot write arbitrary junk into the file.
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return appSettings;
  appSettings[key] = value;
  saveSettings();

  // A couple of settings need immediate side-effects rather than waiting for
  // the next restart to take effect.
  if (key === 'monitorClipboard') {
    isMonitoring = !!value;
    if (isMonitoring) startClipboardMonitoring();
    if (tray) updateTrayMenu();
  }
  if (key === 'captureImages' && !value) {
    lastClipboardImageHash = '';
  }
  return appSettings;
}

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
function addClipboardTextItem(text, html) {
  if (!text || text === lastClipboardContent) {
    return;
  }

  // Fast check to skip empty/whitespace strings
  const hasContent = text.length > 100 ? true : text.trim() !== '';
  if (!hasContent) return;

  // Privacy: never persist credentials, unless the user opted out in Settings.
  const secretLabel = appSettings.skipSecrets ? detectSensitive(text) : null;
  if (secretLabel) {
    lastClipboardContent = text;
    lastClipboardImageHash = '';
    // Store a redacted placeholder so the user can see that something was
    // captured, and can see *why* it was not stored verbatim.
    clipboardHistory = clipboardHistory.filter(
      item => item.type === 'image' || item.text !== redactSensitive(text, secretLabel)
    );
    clipboardHistory.unshift({
      type: 'text',
      text: redactSensitive(text, secretLabel),
      redacted: true,
      reason: secretLabel,
      badge: redactBadge(secretLabel),
      timestamp: Date.now()
    });
    trimHistoryAndSave();
    return;
  }

  // Truncate extremely large texts to prevent memory/performance issues
  const MAX_ITEM_TEXT_LENGTH = 50000;
  let processedText = text;
  if (text.length > MAX_ITEM_TEXT_LENGTH) {
    processedText = text.substring(0, MAX_ITEM_TEXT_LENGTH) + '... (truncated)';
  }

  lastClipboardContent = text; // Keep track of original text to prevent duplicate triggers
  lastClipboardImageHash = '';

  // Merge with an existing identical clip instead of adding a new entry, so
  // repeatedly copying the same snippet does not flood the history.
  const existingIndex = appSettings.mergeDuplicates
    ? clipboardHistory.findIndex(
      item => item.type === 'text' && !item.redacted && item.text === processedText
    )
    : -1;
  if (existingIndex !== -1) {
    const existing = clipboardHistory.splice(existingIndex, 1)[0];
    clipboardHistory.unshift({ ...existing, timestamp: Date.now(), count: (existing.count || 1) + 1 });
    trimHistoryAndSave();
    return;
  }

  // Add to beginning. Preserve HTML when it differs from plain text so a
  // paste elsewhere can keep its original formatting.
  const item = {
    type: 'text',
    text: processedText,
    timestamp: Date.now()
  };
  if (appSettings.captureHtml && html && html.trim() && html.replace(/<[^>]*>/g, '').trim() !== text.trim()) {
    item.html = html.length > MAX_ITEM_TEXT_LENGTH * 4 ? undefined : html;
  }
  clipboardHistory.unshift(item);

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
  // createWindow() may run more than once (e.g. via the activate handler).
  // Without this guard each call would spawn another polling interval and
  // every captured clip would be recorded twice.
  if (monitoringStarted) return;
  monitoringStarted = true;

  loadClipboardHistory();
  loadSettings();
  // Apply the retention policy at startup so clips that expired while the app
  // was closed (including a calendar date that has since passed) are cleaned
  // up without the user opening Settings.
  purgeExpiredClips();
  // The tray toggle and the poll both read this, so keep them in sync.
  isMonitoring = appSettings.monitorClipboard !== false;
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

      // Skip the (relatively costly) image decode entirely when image capture
      // is switched off in Settings.
      let currentImg = null;
      let hasImage = false;
      let imgHash = '';
      if (appSettings.captureImages) {
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
      }

      const hasText = Boolean(currentText && (currentText.length > 100 || currentText.trim() !== ''));

      // Read the HTML flavour only when the text actually changed, so the
      // 1s poll does not pay for a clipboard read on every tick.
      let currentHtml = '';
      if (currentText && currentText !== lastClipboardContent) {
        try {
          currentHtml = clipboard.readHTML();
        } catch (e) {}
      }

      // If image is present and changed
      if (hasImage && (!hasText || (imgHash !== lastClipboardImageHash && currentText === lastClipboardContent))) {
        if (imgHash !== lastClipboardImageHash) {
          addClipboardImageItem(currentImg, imgHash);
        }
      } else if (hasText) {
        if (currentText !== lastClipboardContent) {
          addClipboardTextItem(currentText, currentHtml);
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

// Bring the main window to the front, recreating it only if it no longer exists.
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
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

  // Remember which app had focus before ClipSync came forward, so a chosen
  // clip can be pasted straight back into it.
  mainWindow.on('blur', updatePreviousWindow);

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

  // Windows emits 'click' twice *and then* 'double-click' for a double click.
  // Without suppressing the popup for the second click, a double click would
  // flash the popup open and immediately closed again, so the main window never
  // appeared to open. A timer defers the single-click action to tell the two
  // apart.
  let clickTimer = null;

  tray.on('click', () => {
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickTimer = null;
      toggleTrayWindow();
    }, 250);
  });

  tray.on('right-click', () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    toggleTrayWindow();
  });

  tray.on('double-click', () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    showMainWindow();
  });

  // Global shortcut: Ctrl+Shift+V to show/focus window
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });
}

function updateTrayMenu() {
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.webContents.send('clipboard-updated', clipboardHistory);
    trayWindow.webContents.send('monitoring-changed', isMonitoring);
  }
}

// IPC Handlers
// Registered at module scope. These used to live inside createWindow(), which
// threw "Attempted to register a second handler for 'get-logo-data'" whenever
// the window was recreated (macOS 'activate' / activate-after-quit).
ipcMain.handle('get-logo-data', () => {
  const iconPath = getAssetPath('logo.png');
  if (fs.existsSync(iconPath)) {
    // Resize to 32x32 for UI consistency and performance
    return nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 }).toDataURL();
  }
  return '';
});

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

// Copy AND record in one step. The plain copy-text handler deliberately marks
// the value as "already seen" so the clipboard poll does not re-capture it,
// which means a clip copied from inside the app would never reach history.
// The onboarding tutorial needs a real entry to appear, so it uses this.
ipcMain.handle('copy-and-record', (event, text) => {
  clipboard.writeText(text);
  // Route through the normal capture path so privacy filtering, merging and
  // persistence all behave exactly as they do for a real copy.
  addClipboardTextItem(text, '');
  return true;
});

// ── Paste into the app you came from ─────────────────────────────────────
// Windows' clipboard only holds data, not a destination, so we remember the
// window that was focused before ClipSync came to the front and replay a
// Ctrl+V into it. This is what makes ClipSync feel like a true middle-man.
let previousFocusedWindowId = null;

// Track the last non-ClipSync window that had focus, so a paste can be
// delivered back to it after the user picks an item.
function updatePreviousWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  const ownWindows = [mainWindow, trayWindow].filter(w => w && !w.isDestroyed());
  if (focused && !ownWindows.includes(focused)) {
    previousFocusedWindowId = focused.id;
  }
}

function findPreviousWindow() {
  if (!previousFocusedWindowId) return null;
  try {
    const win = BrowserWindow.fromId(previousFocusedWindowId);
    if (!win || win.isDestroyed()) return null;
    return win;
  } catch (e) {
    return null;
  }
}

// Replay Ctrl+V into the previously focused window.
ipcMain.handle('paste-into-previous', async () => {
  if (!appSettings.pasteIntoPrevious) return false;
  const target = findPreviousWindow();
  if (!target) return false;

  // Hide ourselves first so the target regains focus, then send the chord.
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }

  try {
    target.focus();
  } catch (e) {}

  await new Promise(resolve => setTimeout(resolve, 120));
  try {
    target.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control' });
    target.webContents.sendInputEvent({ type: 'char', keyCode: 'v' });
    target.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' });
    return true;
  } catch (e) {
    console.error('Error pasting into previous window:', e);
    return false;
  }
});

// Open a URL in the user's default browser.
ipcMain.handle('open-link', (event, url) => {
  try {
    const trimmed = String(url || '').trim();
    // Only ever open http(s) — never file:, javascript:, or custom schemes.
    if (!/^https?:\/\//i.test(trimmed)) return false;
    shell.openExternal(trimmed);
    return true;
  } catch (e) {
    console.error('Error opening link:', e);
    return false;
  }
});

// Toggle the pinned state of an item. Pinned items float to the top of the
// list and survive the age-based expiry sweep.
ipcMain.handle('toggle-pin', (event, index) => {
  if (index < 0 || index >= clipboardHistory.length) return clipboardHistory;
  clipboardHistory[index].pinned = !clipboardHistory[index].pinned;
  clipboardHistory[index].timestamp = Date.now();
  trimHistoryAndSave();
  return clipboardHistory;
});

// Open a preview of the item in the system's default application.
ipcMain.handle('preview-item', (event, index) => {
  const item = clipboardHistory[index];
  if (!item) return false;
  try {
    if (item.type === 'image' && item.imagePath && fs.existsSync(item.imagePath)) {
      shell.openPath(item.imagePath);
      return true;
    }
    if (item.type === 'text') {
      const text = item.text || '';
      if (/^https?:\/\//i.test(text.trim())) {
        return shell.openExternal(text.trim()) === undefined;
      }
      // Write to a temp file so the OS default app opens it (PDFs, code, etc.)
      const tmp = path.join(app.getPath('temp'), `clipsync-preview-${Date.now()}.txt`);
      fs.writeFileSync(tmp, text, 'utf8');
      shell.openPath(tmp);
      return true;
    }
  } catch (e) {
    console.error('Error previewing item:', e);
  }
  return false;
});

ipcMain.handle('get-settings', () => {
  return appSettings;
});

ipcMain.handle('set-setting', (event, key, value) => {
  return setSetting(key, value);
});

// Resolve the moment before which clips are considered expired.
// retentionDays is a rolling window counted from now:
//   0  -> keep forever (the "Never" preset)
//   N  -> anything copied more than N days ago is removed
// Pinned items are always exempt.
function getRetentionCutoff() {
  const d = Number(appSettings.retentionDays);
  if (Number.isFinite(d) && d > 0) {
    return Date.now() - d * 24 * 60 * 60 * 1000;
  }
  return null;
}

// Drop expired clips and delete their backing image files from disk.
function purgeExpiredClips() {
  const cutoff = getRetentionCutoff();
  if (cutoff === null) return false;

  const survivors = [];
  let removed = false;
  for (const item of clipboardHistory) {
    const keep = item.pinned || !item.timestamp || item.timestamp >= cutoff;
    if (keep) {
      survivors.push(item);
    } else {
      removed = true;
      if (item.type === 'image' && item.imagePath) {
        try {
          if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath);
        } catch (e) {}
      }
    }
  }

  if (removed) {
    clipboardHistory = survivors;
    trimHistoryAndSave();
  }
  return removed;
}

// Forget clips per the current retention settings.
ipcMain.handle('apply-retention', () => {
  purgeExpiredClips();
  return clipboardHistory;
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
      showMainWindow();
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
  showMainWindow();
});

app.on('before-quit', () => {
  saveClipboardHistorySync();
  // Flush any pending debounced settings write so the last toggle is not lost.
  if (settingsSaveTimeout) {
    clearTimeout(settingsSaveTimeout);
    settingsSaveTimeout = null;
    try {
      fs.writeFileSync(getSettingsFile(), JSON.stringify(appSettings, null, 2), 'utf8');
    } catch (e) {}
  }
});
