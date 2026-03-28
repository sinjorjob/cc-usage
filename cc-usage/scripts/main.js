/**
 * main.js - CC-Usage Electron main process
 * 3D character gadget showing Claude Code usage rate
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { UsageFetcher } = require('./usage-fetcher');
const { CliProvider } = require('./context/cli-provider');
const { MockProvider } = require('./context/mock-provider');
const { SessionProvider } = require('./context/session-provider');

// Disable GPU shader disk cache
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

// Memory / CPU reduction flags
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '64');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('disable-features', 'SpellCheck,MediaRouter,TranslateUI');

let mainWindow = null;
let dashboardWindow = null;
let tray = null;
const fetcher = new UsageFetcher();
// Use CliProvider (claude -p "/context") with MockProvider fallback
const contextProvider = new CliProvider();
const sessionProvider = new SessionProvider();
let fetchInterval = null;
let jsonlWatchInterval = null;
let lastUsageData = null;
let lastContextData = null;
let lastBaselineData = null;  // Cached baseline from cli-provider
let lastJsonlMtime = 0;      // Track JSONL file changes

const FETCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const JSONL_WATCH_MS = 10 * 1000;        // 10 seconds

const LOG_FILE = path.join(require('os').tmpdir(), 'cc-usage-session.log');
function sessionLog(msg) {
  const line = `[${new Date().toISOString()}] [main] ${msg}\n`;
  require('fs').appendFileSync(LOG_FILE, line);
  console.log(`[cc-usage] ${msg}`);
}

// ==================== Config (position save/load) ====================
const configFile = path.join(app.getPath('userData'), 'cc-usage-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configFile)) {
      return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function isPositionVisible(x, y, width, height) {
  const displays = screen.getAllDisplays();
  return displays.some(d => {
    const b = d.bounds;
    return x < b.x + b.width - 50 && x + width > b.x + 50 &&
           y < b.y + b.height - 50 && y + height > b.y + 50;
  });
}

function sanitizePosition(savedPos, defaultX, defaultY, width, height) {
  if (savedPos && isPositionVisible(savedPos.x, savedPos.y, width, height || 200)) {
    return { x: savedPos.x, y: savedPos.y };
  }
  return { x: defaultX, y: defaultY };
}

function saveConfig() {
  const config = {};
  if (mainWindow) {
    const b = mainWindow.getBounds();
    config.window = { x: b.x, y: b.y };
  }
  fs.writeFileSync(configFile, JSON.stringify(config));
}

// ==================== Main Window ====================
function createMainWindow() {
  const config = loadConfig();
  const display = screen.getPrimaryDisplay();
  const defaultX = display.workAreaSize.width - 250;
  const defaultY = display.workAreaSize.height - 250;
  const pos = sanitizePosition(config.window, defaultX, defaultY, 200, 230);

  mainWindow = new BrowserWindow({
    width: 200,
    height: 200,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  mainWindow.setVisibleOnAllWorkspaces(true);
  mainWindow.on('moved', () => saveConfig());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ==================== Tray (terracotta color) ====================
function createTrayIcon() {
  const iconSize = 16;
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const idx = (y * iconSize + x) * 4;
      const cx = x - 8, cy = y - 8;
      const dist = Math.sqrt(cx * cx + cy * cy);
      if (dist < 7) {
        // Terracotta color: #D08050
        canvas[idx] = 208;     // R
        canvas[idx + 1] = 128; // G
        canvas[idx + 2] = 80;  // B
        canvas[idx + 3] = 255; // A
      }
    }
  }

  const icon = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Gadget',
      click: () => { if (mainWindow) mainWindow.show(); },
    },
    {
      label: 'Refresh Usage',
      click: () => fetchUsage(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => quitApp(),
    },
  ]);

  tray.setToolTip('CC-Usage: Claude Code Usage Monitor');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// ==================== Usage Fetching ====================
async function fetchUsage() {
  console.log('[cc-usage] Fetching usage data...');
  if (mainWindow) {
    mainWindow.webContents.send('usage-fetching');
  }

  const data = await fetcher.fetch();
  if (data) {
    lastUsageData = data;
    console.log(`[cc-usage] Usage: ${data.utilization}% (reset: ${data.resetAt || 'unknown'})`);
    if (mainWindow) {
      mainWindow.webContents.send('usage-update', data);
    }
  } else {
    console.log('[cc-usage] Failed to fetch usage data');
    if (mainWindow) {
      mainWindow.webContents.send('usage-error', 'Failed to fetch');
    }
  }
}

// ==================== Dashboard Window ====================
function openDashboard() {
  if (dashboardWindow) {
    dashboardWindow.show();
    dashboardWindow.focus();
    fetchContext();
    return;
  }

  const mainBounds = mainWindow.getBounds();
  dashboardWindow = new BrowserWindow({
    width: 460,
    height: 640,
    x: mainBounds.x - 480,
    y: mainBounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-dashboard.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  dashboardWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'dashboard-window.html'));
  dashboardWindow.setVisibleOnAllWorkspaces(true);
  dashboardWindow.on('closed', () => { dashboardWindow = null; stopJsonlWatch(); });

  // Auto-detect active session and fetch context once loaded
  dashboardWindow.webContents.on('did-finish-load', () => {
    if (!sessionProvider.cwd) {
      sessionProvider.autoDetect();
    }
    fetchContext().then(() => startJsonlWatch());
  });
}

// ==================== Context Fetching ====================
// 1. Fetch baseline (System+Tools+Memory+Skills) via claude -p "/context"
// 2. Read JSONL file for real context usage (cache_read + cache_creation)
// 3. Messages = JSONL total - baseline

/**
 * Apply JSONL data to baseline context data.
 * Shared logic used by both full refresh and JSONL-only refresh.
 */
function applyJsonlToContext(data, jsonlData) {
  // Baseline = sum of active overhead categories only
  // Exclude: messages (what we're calculating), deferred (not in context), autocompact buffer (reserved space, not actual tokens)
  const baseline = data.categories
    .filter(c => c.key !== 'messages'
      && !c.name.toLowerCase().includes('deferred')
      && !c.name.toLowerCase().includes('autocompact'))
    .reduce((sum, c) => sum + c.tokens, 0);

  const messagesTokens = Math.max(0, jsonlData.totalContext - baseline);
  const messagesPercent = Math.round((messagesTokens / data.totalTokens) * 1000) / 10;

  const msgCat = data.categories.find(c => c.key === 'messages');
  if (msgCat) {
    msgCat.tokens = messagesTokens;
    msgCat.percent = messagesPercent;
  }

  // Recalculate totals using JSONL total (= actual active context, excludes deferred)
  data.usedTokens = jsonlData.totalContext;
  data.usagePercent = Math.round((data.usedTokens / data.totalTokens) * 1000) / 10;
  data.freeSpace = {
    tokens: data.totalTokens - data.usedTokens,
    percent: Math.round((1 - data.usedTokens / data.totalTokens) * 1000) / 10,
  };
  // Remove deferred categories from display (not in active context)
  // Keep autocompact buffer as it's informational
  data.categories = data.categories.filter(c =>
    !c.name.toLowerCase().includes('deferred'));

  sessionLog(`Messages: ${messagesTokens} (${messagesPercent}%), baseline: ${baseline}, jsonlTotal: ${jsonlData.totalContext}`);
  return data;
}

async function fetchContext() {
  if (dashboardWindow) dashboardWindow.webContents.send('context-fetching');
  try {
    // Fetch baseline via /context (new session, Messages≈0)
    const data = await contextProvider.fetch();

    // Cache baseline for JSONL-only refreshes (deep copy categories)
    lastBaselineData = JSON.parse(JSON.stringify(data));

    // Auto-detect session only once (on first load). Subsequent refreshes keep the same session.
    // To switch sessions, restart cc-usage.
    if (!sessionProvider._cachedJsonlPath) {
      const detected = sessionProvider.autoDetect();
      sessionLog(`autoDetect result: ${detected}, cachedPath: ${sessionProvider._cachedJsonlPath}`);
    } else {
      sessionLog(`Using cached session: ${sessionProvider._cachedJsonlPath}`);
    }
    const jsonlData = sessionProvider.fetchFromJsonl();
    sessionLog(`baseline cats: ${data.categories.length}, jsonl: ${jsonlData ? 'total=' + jsonlData.totalContext : 'null'}`);

    if (jsonlData) {
      applyJsonlToContext(data, jsonlData);
    } else {
      // No JSONL data (fresh session after /clear) — still filter deferred categories
      data.categories = data.categories.filter(c =>
        !c.name.toLowerCase().includes('deferred'));
    }

    lastContextData = data;
    if (dashboardWindow) dashboardWindow.webContents.send('context-update', data);

    // Track JSONL mtime for change detection
    updateJsonlMtime();
  } catch (err) {
    console.error('[cc-usage] Context fetch error:', err);
    if (dashboardWindow) dashboardWindow.webContents.send('context-error', err.message);
  }
}

/**
 * Lightweight JSONL-only refresh: re-read JSONL and recalculate Messages
 * using cached baseline. No cli-provider call needed.
 * Detects compact events and conversation progression.
 */
function refreshFromJsonl() {
  if (!lastBaselineData || !dashboardWindow) return;

  try {
    // Use cached JSONL path only — don't re-detect to avoid switching sessions
    const jsonlData = sessionProvider.fetchFromJsonl();
    if (!jsonlData) return;

    // Deep copy the cached baseline so we don't mutate the original
    const data = JSON.parse(JSON.stringify(lastBaselineData));
    applyJsonlToContext(data, jsonlData);

    lastContextData = data;
    dashboardWindow.webContents.send('context-update', data);

    // Update footer timestamp
    data.timestamp = new Date().toISOString();
  } catch (err) {
    sessionLog(`JSONL refresh error: ${err.message}`);
  }
}

/**
 * Track JSONL file mtime. Returns true if changed.
 */
function updateJsonlMtime() {
  const jsonlPath = sessionProvider._cachedJsonlPath;
  if (!jsonlPath) return false;
  try {
    const mtime = fs.statSync(jsonlPath).mtimeMs;
    const changed = lastJsonlMtime > 0 && mtime !== lastJsonlMtime;
    lastJsonlMtime = mtime;
    return changed;
  } catch (e) {
    return false;
  }
}

/**
 * Start watching the JSONL file for changes (compact, new messages, etc.)
 * Runs every 10 seconds while dashboard is open.
 */
function startJsonlWatch() {
  stopJsonlWatch();
  jsonlWatchInterval = setInterval(() => {
    if (!dashboardWindow || !sessionProvider._cachedJsonlPath) return;
    try {
      // Only watch the current file for changes — no session switching here.
      // Session switching is handled by autoDetect() in fetchContext() (manual refresh).
      const currentMtime = fs.statSync(sessionProvider._cachedJsonlPath).mtimeMs;
      if (currentMtime !== lastJsonlMtime) {
        sessionLog(`JSONL changed (mtime: ${lastJsonlMtime} → ${currentMtime}), refreshing...`);
        lastJsonlMtime = currentMtime;
        refreshFromJsonl();
      }
    } catch (e) {
      // File may be temporarily locked during write
    }
  }, JSONL_WATCH_MS);
}

function stopJsonlWatch() {
  if (jsonlWatchInterval) {
    clearInterval(jsonlWatchInterval);
    jsonlWatchInterval = null;
  }
}

function startPolling() {
  // Fetch immediately on start
  fetchUsage();
  // Then every 5 minutes
  fetchInterval = setInterval(() => fetchUsage(), FETCH_INTERVAL_MS);
}

// ==================== IPC ====================
function setupIPC() {
  // Window drag
  ipcMain.on('window-drag-to', (event, { x, y }) => {
    if (mainWindow) mainWindow.setPosition(x, y);
  });

  // Get positions
  ipcMain.handle('get-cursor-position', () => screen.getCursorScreenPoint());

  ipcMain.handle('get-window-position', () => {
    if (!mainWindow) return { x: 0, y: 0 };
    const [x, y] = mainWindow.getPosition();
    return { x, y };
  });

  // Context menu
  ipcMain.on('show-context-menu', () => {
    if (!mainWindow) return;
    const menu = Menu.buildFromTemplate([
      {
        label: 'コンテキスト空間',
        click: () => openDashboard(),
      },
      { type: 'separator' },
      {
        label: 'Refresh Usage',
        click: () => fetchUsage(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => quitApp(),
      },
    ]);
    menu.popup({ window: mainWindow });
  });

  // Dashboard window drag
  ipcMain.on('dashboard-drag-to', (event, { x, y }) => {
    if (dashboardWindow) dashboardWindow.setPosition(x, y);
  });

  ipcMain.handle('get-dashboard-position', () => {
    if (!dashboardWindow) return { x: 0, y: 0 };
    const [x, y] = dashboardWindow.getPosition();
    return { x, y };
  });

  // Close dashboard
  ipcMain.on('close-dashboard', () => {
    if (dashboardWindow) { dashboardWindow.close(); dashboardWindow = null; }
  });

  // Manual refresh request
  ipcMain.on('refresh-usage', () => {
    fetchUsage();
  });

  // Get last known usage data (for renderer init)
  ipcMain.handle('get-last-usage', () => {
    return lastUsageData;
  });

  // ---- Context data ----
  ipcMain.on('refresh-context', () => fetchContext());

  ipcMain.handle('get-last-context', () => lastContextData);

  // ---- Session CWD (for JSONL file lookup) ----
  ipcMain.on('set-session-cwd', (event, cwd) => {
    if (cwd) {
      sessionProvider.setCwd(cwd);
      sessionLog(`Session CWD set: ${cwd}`);
      // Re-fetch context with JSONL-based Messages
      fetchContext();
    }
  });

  ipcMain.handle('get-session-cwd', () => sessionProvider.cwd);
}

// ==================== Quit ====================
function quitApp() {
  saveConfig();
  if (fetchInterval) clearInterval(fetchInterval);
  stopJsonlWatch();
  if (mainWindow) mainWindow.destroy();
  app.quit();
}

// ==================== Single Instance Lock ====================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('Another instance is already running. Focusing existing window.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
    }
  });
}

// ==================== App Lifecycle ====================
app.whenReady().then(() => {
  createMainWindow();
  createTrayIcon();
  setupIPC();

  // Start polling after a short delay to let the window load
  setTimeout(() => startPolling(), 2000);

  // Ctrl+Shift+U to toggle visibility
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  // Reposition when display changes
  screen.on('display-removed', () => {
    const display = screen.getPrimaryDisplay();
    if (mainWindow) {
      const b = mainWindow.getBounds();
      if (!isPositionVisible(b.x, b.y, b.width, b.height)) {
        mainWindow.setPosition(display.workAreaSize.width - 250, display.workAreaSize.height - 250);
      }
    }
  });
});

app.on('window-all-closed', () => {
  quitApp();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (fetchInterval) clearInterval(fetchInterval);
  stopJsonlWatch();
});
