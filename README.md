# 📋 RYZ ClipSync

<div align="center">

![RYZ ClipSync Banner](https://img.shields.io/badge/RYZ-ClipSync-00ff88?style=for-the-badge&logo=clipboard&logoColor=000&labelColor=000)

### **Modern Clipboard Manager for Windows**

*Your clipboard history, beautifully organized and always accessible.*

![Electron](https://img.shields.io/badge/Electron-28.0.0-47848F?style=flat-square&logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-00ff88?style=flat-square&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-00ff88?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-00ff88?style=flat-square)

---

**Developed By [R ! Y 4 Z](https://github.com/riyazalsodie)**

[Download](#-download) • [Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Support](#-support)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Download](#-download)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [User Guide](#-user-guide)
- [Developer Guide](#-developer-guide)
- [Building from Source](#-building-from-source)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [Support](#-support)
- [License](#-license)

---

## 🌟 Overview

**RYZ ClipSync** is a sleek, modern clipboard manager designed for Windows that keeps track of everything you copy. With its elegant OLED-black theme and powerful system tray integration, you'll never lose important copied text again.

Whether you're a developer, designer, writer, or anyone who copies frequently, ClipSync streamlines your workflow by keeping your clipboard history organized, searchable, and instantly accessible.

---

## ✨ Features

### 🎯 Core Capabilities

| Feature | Description |
|---------|-------------|
| **📌 Persistent History** | Stores up to 1000 clipboard items locally, surviving restarts |
| **🔍 Smart Search** | Real-time filtering to find any copied text instantly |
| **⚡ Auto-Monitoring** | Captures clipboard changes every 1 second automatically |
| **💾 Auto-Save** | All history saved instantly to disk, no data loss |
| **🔄 Duplicate Prevention** | Intelligently handles duplicate entries |

### 🎨 User Interface

- **🌙 OLED Black Theme** - Easy on the eyes, perfect for night use
- **✨ Smooth Animations** - Polished transitions and hover effects
- **📱 Resizable Window** - Adjust to your preferred size (360-520px width)
- **🎯 Context Menu** - Right-click for quick copy/delete actions
- **📊 Visual Stats** - See item count and monitoring status at a glance

### 🔔 System Tray

- **📌 Recent Clips** - Access last 5 items directly from tray
- **📋 Copy Latest** - One-click to copy most recent item
- **⏸️ Pause/Resume** - Toggle monitoring without opening app
- **🗑️ Clear History** - Wipe all data with confirmation
- **🔄 Auto Startup** - Launch with Windows automatically
- **💬 Notifications** - Get notified of important actions

### ⌨️ Keyboard Shortcuts

```
Ctrl + Shift + V    →    Show/Hide Window
Ctrl + F            →    Focus Search Bar
Escape              →    Close Menus/Modals
```

---

## 📥 Download

### For End Users

Download the Windows Installer:

#### Windows Installer (Recommended)
```
🔧 RYZClipSync-Setup-1.0.0.exe
```
- ✅ Professional installation
- ✅ Creates Start Menu shortcuts
- ✅ Auto-updates ready (future)
- ✅ Uninstall support
- 📍 Download: `[Link to .exe installer]`

---

## 🚀 Installation

### Using the Installer (Recommended)

1. **Download** `RYZClipSync-Setup-1.0.0.exe`
2. **Run** the installer
3. **Follow** the installation wizard
4. **Launch** from Start Menu or Desktop shortcut

### First Run

On first launch:
- App will appear in system tray (near clock)
- A welcome notification will appear
- Start copying text - it's automatically saved!
- Double-click tray icon to open main window

---

## ⚡ Quick Start

```
1. Install the application
2. Launch RYZ ClipSync
3. Copy any text (Ctrl + C)
4. Open the app to see your clipboard history
5. Double-click any item to copy it again
6. Use system tray for quick access
```

**That's it!** The app runs silently in the background, capturing everything you copy.

---

## 📖 User Guide

### Main Window

| Element | Function |
|---------|----------|
| **Search Bar** | Type to filter clipboard history |
| **Item List** | Shows all copied text with timestamps |
| **Auto Toggle** | Enable/disable Windows auto-startup |
| **Clear Button** | Delete all history (with confirmation) |
| **Status Dot** | Green = monitoring, Gray = paused |

### Managing Clipboard Items

#### To Copy an Item:
- **Double-click** any item in the list
- **Right-click** → Select "Copy"
- From **system tray** → Recent Clips → Choose item

#### To Delete Items:
- **Single item**: Right-click → Delete
- **All items**: Click "Clear" button → Confirm

#### To Search:
1. Click search bar or press `Ctrl + F`
2. Type your search term
3. Results filter in real-time
4. Clear search to see all items

### System Tray Menu

Right-click the tray icon for:

```
📋  Open RYZ ClipSync      → Show main window
📋  Copy Latest            → Copy most recent item
─────────────────────────────────────────────────
📌  Recent Clips           → Submenu with last 5 items
─────────────────────────────────────────────────
📊  X items in history     → Status (info only)
⏸️  Pause Monitoring       → Toggle clipboard capture
─────────────────────────────────────────────────
🗑️  Clear All History      → Delete everything
🔄  Auto Startup           → Toggle Windows startup
─────────────────────────────────────────────────
❌  Quit RYZ ClipSync      → Exit application
```

### Settings & Preferences

| Setting | Location | Options |
|---------|----------|---------|
| **Auto Startup** | Toggle in app or tray | On / Off |
| **Monitoring** | Toggle in tray | Active / Paused |
| **Theme** | Hardcoded | OLED Black (default) |

---

## 🛠️ Developer Guide

### For Developers Who Want to Modify

#### Prerequisites

```bash
✅ Node.js 18.x or higher
✅ npm 9.x or higher
✅ Git (optional, for cloning)
✅ Windows 10/11
```

#### Project Structure

```
RYZ ClipSync/
│
├── 📄 main.js              # Main Electron process
│   ├── Clipboard monitoring
│   ├── System tray management
│   ├── IPC handlers
│   └── Data persistence
│
├── 📄 preload.js           # Secure bridge between main & renderer
│
├── 📄 index.html           # UI, styles, and frontend logic
│   ├── CSS styling (OLED theme)
│   ├── HTML structure
│   └── JavaScript (UI interactions)
│
├── 📄 package.json         # Project configuration
│
├── 🖼️  icon.png             # Application icon (256x256 recommended)
│
├── 📄 README.md            # Documentation
│
└── 📁 dist/                # Built executables (after build)
    └── RYZClipSync-Setup-1.0.0.exe    (Installer)
```

#### Configuration Files

**`package.json`** - Project metadata and build config:
```json
{
  "name": "clipboard-manager",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "build": {
    "appId": "com.clipboard.manager",
    "win": {
      "target": "nsis",
      "icon": null
    }
  }
}
```

---

## 🔨 Building from Source

### Step 1: Clone or Download

```bash
# Using Git
git clone <repository-url>
cd "RYZ ClipSync"

# Or download ZIP and open
cd "e:\Backup sync"
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Test in Development Mode

```bash
npm start
```

### Step 4: Build Executables

#### Build Installer (.exe Setup)
```bash
npm run build
```

Output: `dist/RYZClipSync-Setup-1.0.0.exe`

### Build Configuration

**For NSIS Installer** (default):
- Creates professional setup wizard
- Adds Start Menu entries
- Creates desktop shortcut
- Includes uninstaller

### Customizing the Build

Edit `package.json`:

```json
"build": {
  "appId": "com.ryz.clipSync",
  "productName": "RYZ ClipSync",
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ],
    "icon": "icon.png",
    "artifactName": "RYZClipSync-Setup-${version}.${ext}"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

---

## 🐛 Troubleshooting

### Common Issues

#### App Won't Start
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm start
```

#### Clipboard Not Capturing
- ✅ Check if monitoring is paused (green dot = active)
- ✅ Restart the application
- ✅ Ensure app has necessary permissions

#### History Not Saving
- ✅ Check disk space
- ✅ Verify `%APPDATA%` folder is accessible
- ✅ Delete `clipboard_history.json` and restart

#### System Tray Icon Missing
- ✅ Check hidden icons (click ^ near tray)
- ✅ Restart Windows Explorer
- ✅ Reboot system

#### Build Fails
```bash
# Clear cache and rebuild
npm cache clean --force
rm -rf node_modules dist
npm install
npm run build
```

### Error Codes

| Error | Solution |
|-------|----------|
| `MODULE_NOT_FOUND` | Run `npm install` |
| `EACCES` | Run as Administrator |
| `ENOSPC` | Free up disk space |
| `Electron not found` | Reinstall Electron: `npm install electron` |

---

## ❓ FAQ

**Q: Does this work on macOS or Linux?**  
A: Currently Windows only. Cross-platform support may come in future versions.

**Q: How much disk space does history use?**  
A: Depends on usage. Text is very small - even 1000 items is typically <1MB.

**Q: Is my clipboard data sent anywhere?**  
A: No. All data stays locally in `%APPDATA%` on your computer.

**Q: Can I export my clipboard history?**  
A: Not currently. History is stored in JSON format in `%APPDATA%\clipboard_history.json`.

**Q: Does it start with Windows?**  
A: Yes, enable "Auto Startup" in the app or system tray menu.

**Q: How do I completely uninstall?**  
A: Run the uninstaller (if installed via setup) or delete the folder + `%APPDATA%\clipboard_history.json`.

**Q: Can I change the theme colors?**  
A: Yes, edit CSS variables in `index.html` (see [Theme Customization](#-theme-customization)).

---

## 🎨 Theme Customization

Edit CSS custom properties in `index.html` (lines 10-30):

```css
:root {
  /* Background Colors */
  --bg-primary: #000000;
  --bg-secondary: #0a0a0a;
  --bg-card: rgba(255, 255, 255, 0.03);
  
  /* Accent Colors */
  --accent: #00ff88;        /* Main green */
  --accent-dim: #00cc6a;    /* Darker green */
  
  /* Text Colors */
  --text-primary: #e8ffe8;
  --text-secondary: rgba(232, 255, 232, 0.55);
  --text-muted: rgba(232, 255, 232, 0.3);
  
  /* Danger/Delete */
  --danger: #ff4d6a;
}
```

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Memory Usage** | ~50-80 MB |
| **CPU Usage** | <1% (idle) |
| **Startup Time** | <2 seconds |
| **History Limit** | 1000 items |
| **Monitor Interval** | 1 second |
| **File Size** | ~80 MB (installed) |

---

## 🔒 Security & Privacy

- ✅ **Local Storage Only** - No cloud, no servers
- ✅ **Context Isolation** - Electron security best practices
- ✅ **No Node Integration** - Renderer process isolated
- ✅ **Secure IPC** - Preload script for communication
- ✅ **No Telemetry** - No data collection

---

## 🤝 Contributing

Contributions welcome! To contribute:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

```
MIT License

Copyright (c) 2026 R ! Y 4 Z

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📬 Support

### Need Help?

- 📖 Read this README thoroughly
- 🐛 Report bugs via GitHub Issues
- 💡 Request features via GitHub Discussions
- 📧 Contact: `[Your Contact Here]`

### Show Your Support

If RYZ ClipSync helps you, please:

- ⭐ **Star** this repository
- 📢 **Share** with others who might benefit
- 🐛 **Report** bugs to help improve
- 💡 **Suggest** features for future versions

---

## 🙏 Acknowledgments

- **[Electron](https://www.electronjs.org/)** - Cross-platform desktop apps
- **[Google Fonts](https://fonts.google.com/)** - Inter font family
- **[Electron Builder](https://www.electron.build/)** - Packaging and distribution
- **Community** - Inspiration and support

---

<div align="center">

## 🎯 Ready to Get Started?

[Download Now](#-download) • [View Source](#) • [Report Issue](#)

---

### **RYZ ClipSync**

*Your clipboard, elevated.*

---

###### Developed with ❤️ by **R ! Y 4 Z**

###### Version 1.0.0 | Last Updated: 2024

</div>
