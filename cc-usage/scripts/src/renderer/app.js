/**
 * app.js - CC-Usage renderer entry point
 * Initializes 3D character, handles drag, wheel, and usage data updates
 * Manages dashboard mode toggle and context visualization
 */
import { UsageCharacter } from './character.js';
import { ContextDashboard } from './dashboard.js';

const canvas = document.getElementById('character-canvas');
const character = new UsageCharacter(canvas);
const container = document.getElementById('character-container');
const usageBadge = document.getElementById('usage-badge');
const usageText = document.getElementById('usage-text');
const usageReset = document.getElementById('usage-reset');

let dashboard = null;
let isDashboardMode = false;
let lastUsageData = null;

// ========== Usage level class mapping ===========
function getUsageLevelClass(percent) {
  if (percent < 50) return 'level-low';
  if (percent < 80) return 'level-mid';
  return 'level-high';
}

function updateUsageDisplay(data) {
  const { utilization, resetsAt } = data;
  lastUsageData = data;

  // Update badge
  usageBadge.className = getUsageLevelClass(utilization);
  usageText.textContent = `${utilization}% used`;

  if (resetsAt) {
    usageReset.textContent = `reset ${resetsAt}`;
  } else {
    usageReset.textContent = '';
  }

  // Update dashboard API bar if in dashboard mode
  if (isDashboardMode) {
    const barFill = document.getElementById('apiBarFill');
    const barText = document.getElementById('apiBarText');
    const resetInfo = document.getElementById('apiResetInfo');
    if (barFill) {
      barFill.style.width = utilization + '%';
      barFill.className = 'bar-fill ' + (utilization < 50 ? 'green' : utilization < 80 ? 'yellow' : 'red');
    }
    if (barText) barText.textContent = `${utilization}% used`;
    if (resetInfo) resetInfo.textContent = resetsAt ? `Reset at ${resetsAt}` : '';
  }

  // Update 3D character gauge + animation
  character.setUsage(utilization);
}

// ========== Dashboard Mode ===========
function enterDashboard() {
  isDashboardMode = true;
  document.body.className = 'dashboard';
  character.resize(110);

  // Init dashboard if first time
  const panel = document.getElementById('dashboard-panel');
  if (!dashboard) {
    dashboard = new ContextDashboard(panel);
  }
  panel.style.display = 'block';

  // Update API bar with last known data
  if (lastUsageData) updateUsageDisplay(lastUsageData);

  // Request context data
  window.electronAPI.refreshContext();
}

function exitDashboard() {
  isDashboardMode = false;
  document.body.className = 'compact';
  character.resize(200);
  if (dashboard) dashboard.hide();
}

// ========== Drag (Left click = move window) ===========
let isDragging = false;
let startX = 0, startY = 0, winStartX = 0, winStartY = 0;

container.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  const cursor = await window.electronAPI.getCursorPosition();
  const winPos = await window.electronAPI.getWindowPosition();
  startX = cursor.x; startY = cursor.y;
  winStartX = winPos.x; winStartY = winPos.y;
});

window.addEventListener('mousemove', async () => {
  if (!isDragging) return;
  const cursor = await window.electronAPI.getCursorPosition();
  window.electronAPI.windowDragTo(
    winStartX + (cursor.x - startX),
    winStartY + (cursor.y - startY)
  );
});

window.addEventListener('mouseup', () => { isDragging = false; });

// ========== Mouse wheel = orbit view ===========
container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1;
  if (e.shiftKey) {
    character.addOrbit(0, delta * 5);
  } else {
    character.addOrbit(delta * 8, 0);
  }
}, { passive: false });

// ========== Right-click context menu ===========
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.electronAPI.showContextMenu();
});

// ========== Dashboard mode changed (from main process) ===========
window.electronAPI.onDashboardModeChanged(({ expanded }) => {
  if (expanded) enterDashboard();
  else exitDashboard();
});

// ========== Context data updates ===========
window.electronAPI.onContextUpdate((data) => {
  if (dashboard) dashboard.show(data);
  // Update model badge
  const badge = document.getElementById('modelBadge');
  if (badge) badge.textContent = data.model;
  const footModel = document.getElementById('footModel');
  if (footModel) footModel.textContent = data.model;
  const footUpdated = document.getElementById('footUpdated');
  if (footUpdated) footUpdated.textContent = `Updated ${new Date(data.timestamp).toLocaleTimeString()}`;

  // Update donut center text
  const donutUsed = document.getElementById('donutUsed');
  const donutTotal = document.getElementById('donutTotal');
  const donutPct = document.getElementById('donutPct');
  if (donutUsed) donutUsed.textContent = Math.round(data.usedTokens / 1000) + 'k';
  if (donutTotal) donutTotal.textContent = '/ ' + Math.round(data.totalTokens / 1000).toLocaleString() + 'k';
  if (donutPct) donutPct.textContent = data.usagePercent + '%';

  // Treemap summary
  const tmUsed = document.getElementById('tmUsed');
  const tmPct = document.getElementById('tmPct');
  if (tmUsed) tmUsed.textContent = Math.round(data.usedTokens / 1000) + 'k / ' + Math.round(data.totalTokens / 1000) + 'k';
  if (tmPct) tmPct.textContent = data.usagePercent + '%';
});

window.electronAPI.onContextFetching(() => {
  // Could show a loading indicator
});

window.electronAPI.onContextError((err) => {
  console.error('Context error:', err);
});

// ========== Listen for usage updates from main process ===========
window.electronAPI.onUsageUpdate((data) => {
  updateUsageDisplay(data);
});

window.electronAPI.onUsageFetching(() => {
  usageBadge.className = 'fetching';
  usageText.textContent = 'Fetching...';
});

window.electronAPI.onUsageError((err) => {
  usageBadge.className = 'error';
  usageText.textContent = 'Error';
  usageReset.textContent = '';
});

// ========== Init: check for cached data ===========
(async () => {
  const lastData = await window.electronAPI.getLastUsage();
  if (lastData) {
    updateUsageDisplay(lastData);
  }
})();
