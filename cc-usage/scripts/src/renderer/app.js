/**
 * app.js - CC-Usage renderer entry point
 * Initializes 3D character, handles drag, wheel, and usage data updates
 */
import { UsageCharacter } from './character.js';

const canvas = document.getElementById('character-canvas');
const character = new UsageCharacter(canvas);
const container = document.getElementById('character-container');
const usageBadge = document.getElementById('usage-badge');
const usageText = document.getElementById('usage-text');
const usageReset = document.getElementById('usage-reset');

// ========== Usage level class mapping ===========
function getUsageLevelClass(percent) {
  if (percent < 50) return 'level-low';
  if (percent < 80) return 'level-mid';
  return 'level-high';
}

function updateUsageDisplay(data) {
  const { utilization, resetsAt } = data;

  // Update badge
  usageBadge.className = getUsageLevelClass(utilization);
  usageText.textContent = `${utilization}% used`;

  if (resetsAt) {
    usageReset.textContent = `reset ${resetsAt}`;
  } else {
    usageReset.textContent = '';
  }

  // Update 3D character gauge + animation
  character.setUsage(utilization);
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
