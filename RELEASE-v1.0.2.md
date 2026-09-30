# 🎉 RYZ ClipSync v1.0.2 - Performance Optimization & Lag Fixes

**Release Date:** July 13, 2026

**A buttery-smooth clipboard history manager with zero lag and optimized memory footprint.**

---

## ✨ What's New

This release resolves the critical performance and system lag issues reported when copying text and searching history. Through comprehensive main-process, IPC, and renderer-process optimizations, RYZ ClipSync now runs smoothly even with large clipboard entries.

---

## ⚡ Performance Improvements & Optimizations

### 🖥️ Main Process & File System
- **Asynchronous, Debounced Saves**: Replaced blocking synchronous file writes (`fs.writeFileSync`) with non-blocking, asynchronous writes (`fs.writeFile`) debounced by 1 second. This ensures disk I/O does not freeze the app main thread or lag the host PC when copying text.
- **Graceful Shutdown Persistence**: Introduced a `before-quit` handler that executes a synchronous write on quit to prevent data loss for pending updates.
- **Safety Bounds & Truncation**: Truncates exceptionally large text blocks (longer than 50,000 characters) to prevent RAM inflation, massive IPC transport payloads, and renderer crashes.
- **Reliable Monitoring**: Wrapped clipboard polling checks in try-catch handlers to prevent crashing when other processes lock the system clipboard.
- **History Cap**: Adjusted history database capacity to 500 items to balance performance and history size.

### 🎨 Renderer UI
- **DOM Capping**: Capped the visible items in the DOM list to 100 items. The full history remains searchable in memory, but only the active view is rendered, reducing layout computations.
- **Event Delegation**: Replaced binding individual double-click and context-menu listeners on every card with parent-level listeners on the list container.
- **Ultra-Fast HTML Escaping**: Replaced element-creation HTML escaping (which created a div element for every single history item) with a fast, allocation-free regex replacement function.
- **Zero Search Stutter**: Automatically disabled stagger delays on CSS animations when a search query is active to keep keystrokes fully responsive and lag-free.

### 📥 System Tray IPC
- **Redundant IPC Elimination**: Modified tray renderer to directly use the history object sent in the IPC update event, eliminating unnecessary secondary asynchronous roundtrips.

---

## 📥 Installation

### Windows Installer
```
RYZClipSync-Setup-1.0.2.exe
```
- Full installation with Start Menu shortcuts
- Includes desktop shortcut
- Includes uninstaller

---

## 🛠️ Technical Details

| Specification | Value |
|---------------|-------|
| **Version** | 1.0.2 |
| **Runtime** | Electron 28.0.0 |
| **Platform** | Windows 10/11 |
| **License** | MIT |
| **App ID** | `com.ryz.clipsync` |
| **Memory Usage** | ~40-60 MB |
| **CPU Usage** | <0.5% (idle) |

---

## 🔒 Security & Privacy

- ✅ **Local Storage Only** - No cloud, no servers, no telemetry
- ✅ **Context Isolation** - Secure Electron preload bridge configuration

---

## 🙏 Credits

**Developed by:** [R!Y4Z](https://github.com/riyazalsodie)

---

<div align="center">

### ❤️ Thank you for using RYZ ClipSync!

If you find this tool helpful, please ⭐ **star this repository**

[Report Issue](https://github.com/riyazalsodie/ryz-clipsync/issues) • [Request Feature](https://github.com/riyazalsodie/ryz-clipsync/discussions) • [View Source](https://github.com/riyazalsodie/ryz-clipsync)

</div>
