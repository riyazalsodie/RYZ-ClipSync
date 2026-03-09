const recentItemsList = document.getElementById('recent-items-list');
const monitoringText = document.getElementById('monitoring-text');
const monitoringIcon = document.getElementById('monitoring-icon');
const startupCheckbox = document.getElementById('startup-checkbox');

// Action Listeners
document.querySelector('.action-open').addEventListener('click', () => {
    window.electronAPI.closeWindow(); // This will hide the tray window
    window.electronAPI.trayAction('open-main');
});

document.querySelector('.action-copy-latest').addEventListener('click', async () => {
    const history = await window.electronAPI.getClipboardHistory();
    if (history.length > 0) {
        window.electronAPI.copyText(history[0].text);
    }
    window.electronAPI.closeWindow();
});

document.querySelector('.action-toggle-monitoring').addEventListener('click', async () => {
    window.electronAPI.trayAction('toggle-monitoring');
});

document.querySelector('.action-clear-history').addEventListener('click', async () => {
    await window.electronAPI.deleteAll();
    window.electronAPI.closeWindow();
});

document.querySelector('.action-toggle-startup').addEventListener('click', (e) => {
    if (e.target.id !== 'startup-checkbox') {
        startupCheckbox.checked = !startupCheckbox.checked;
        window.electronAPI.setAutoStartup(startupCheckbox.checked);
    }
});

startupCheckbox.addEventListener('change', () => {
    window.electronAPI.setAutoStartup(startupCheckbox.checked);
});

document.querySelector('.action-quit').addEventListener('click', () => {
    window.electronAPI.trayAction('quit');
});

// Update UI functions
async function updateTrayUI() {
    const history = await window.electronAPI.getClipboardHistory();
    const isStarted = await window.electronAPI.getAutoStartup();
    const isMonitoring = await window.electronAPI.getMonitoringStatus();

    startupCheckbox.checked = isStarted;
    monitoringText.textContent = isMonitoring ? 'Pause Monitoring' : 'Resume Monitoring';
    monitoringIcon.textContent = isMonitoring ? '⏸' : '▶';

    // Update recent items (limit to 5)
    recentItemsList.innerHTML = '';
    history.slice(0, 5).forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'recent-item';
        const preview = item.text.length > 35
            ? item.text.substring(0, 35).replace(/\n/g, ' ') + '...'
            : item.text.replace(/\n/g, ' ');
        div.textContent = `${index + 1}. ${preview}`;
        div.onclick = () => {
            window.electronAPI.copyText(item.text);
            window.electronAPI.closeWindow();
        };
        recentItemsList.appendChild(div);
    });

    if (history.length === 0) {
        recentItemsList.innerHTML = '<div class="recent-item" style="opacity: 0.5; pointer-events: none;">No items</div>';
    }

    // Adjust window height to fit content
    setTimeout(() => {
        const height = document.querySelector('.tray-container').offsetHeight;
        window.electronAPI.resizeTray(height);
    }, 10);
}

// IPC Listeners
window.electronAPI.onClipboardUpdated(() => {
    updateTrayUI();
});

window.electronAPI.onMonitoringChanged((isMonitoringStatus) => {
    monitoringText.textContent = isMonitoringStatus ? 'Pause Monitoring' : 'Resume Monitoring';
    monitoringIcon.textContent = isMonitoringStatus ? '⏸' : '▶';
});

window.electronAPI.onAutoStartupChanged((enabled) => {
    startupCheckbox.checked = enabled;
});

// Initial load
updateTrayUI();

// Click-through and Click-to-hide logic for transparent padding
const trayContainer = document.querySelector('.tray-container');

// When mouse is over the actual menu, capture events
trayContainer.addEventListener('mouseenter', () => {
    window.electronAPI.setIgnoreMouseEvents(false);
});

// Avoid capturing events when mouse is over transparent padding
trayContainer.addEventListener('mouseleave', () => {
    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
});

// If user clicks on the transparent padding (body), hide the window
document.body.addEventListener('click', (e) => {
    if (e.target === document.body) {
        window.electronAPI.closeWindow();
    }
});

// Initially ignore mouse events on the transparent areas
window.electronAPI.setIgnoreMouseEvents(true, { forward: true });

// Need access to ipcRenderer directly for some custom signals if needed
// But we can also use window.electronAPI if we add them there.
// For now, let's assume we might need a tiny bit more in preload or just use what we have.
// Actually, I'll add 'tray-action' to the main preload or handle it via existing ones.
