/**
 * background.js — Service Worker
 *
 * Manages per-tab state and sets the toolbar icon to a pre-made PNG
 * that reflects the detected issues.  The cat's expression changes
 * based on the combination of issues found:
 *
 *   neko-base.png   — no issues (front-facing)
 *   neko-og.png     — OG tag issues only (looking left)
 *   neko-logs.png   — console logs only (looking up)
 *   neko-errors.png — errors only (looking right)
 *   neko-multi.png  — 2+ issue types (angry eyes)
 */

// ---- Settings --------------------------------------------------------------

const DEFAULT_SETTINGS = {
  ogTitle: true,
  ogDescription: true,
  ogImage: true,
  ogImageBroken: true,
  ogUrl: true,
  consoleLogs: true,
  consoleInfo: true,
  consoleDebug: true,
  consoleWarn: true,
  consoleError: true,
  uncaughtErrors: true,
  unhandledRejections: true,
  networkHttp4xx: true,
  networkHttp5xx: true,
  networkConnection: true,
  networkErrCacheMiss: false,
  networkErrAborted: false,
  networkErrBlockedByClient: false,
  networkErrBlockedByResponse: false,
};

let settings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  const result = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  settings = { ...DEFAULT_SETTINGS, ...result.settings };
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
  }
});

loadSettings();

// ---- Per-tab state ---------------------------------------------------------

const tabState = new Map();

function getState(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, {
      logs: [],            // { level, text, timestamp }
      errors: [],          // { level, text, timestamp }
      ogIssues: [],        // { tag, problem, detail }
      networkErrors: [],   // { status, url, type, timestamp }
      url: '',
    });
  }
  return tabState.get(tabId);
}

// Clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

// Reset state on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabState.delete(tabId);
    updateIcon(tabId);
  }
});

// ---- Message handling ------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 'getState' comes from the popup (no sender.tab)
  if (msg.action === 'getState') {
    // The popup passes the desired tabId in the message body
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const id = tab ? tab.id : null;
      sendResponse(id ? getState(id) : { logs: [], errors: [], ogIssues: [], networkErrors: [] });
    })();
    return true; // keep channel open for async sendResponse
  }

  // All other messages come from content scripts
  const tabId = sender.tab && sender.tab.id;
  if (!tabId) return;

  const state = getState(tabId);

  switch (msg.action) {
    case 'consoleEvents':
      for (const ev of msg.events) {
        const entry = { level: ev.level, text: ev.text, timestamp: ev.timestamp };
        if (ev.category === 'log') {
          const allowed =
            (ev.level === 'log'   && settings.consoleLogs) ||
            (ev.level === 'info'  && settings.consoleInfo) ||
            (ev.level === 'debug' && settings.consoleDebug) ||
            (ev.level === 'warn'  && settings.consoleWarn);
          if (allowed) state.logs.push(entry);
        } else if (ev.category === 'error') {
          const allowed =
            (ev.level === 'error'    && settings.consoleError) ||
            (ev.level === 'uncaught' && settings.uncaughtErrors) ||
            (ev.level === 'unhandledrejection' && settings.unhandledRejections);
          if (allowed) state.errors.push(entry);
        }
      }
      updateIcon(tabId);
      break;

    case 'ogReport': {
      const ogFilter = {
        'og:title':       settings.ogTitle,
        'og:description': settings.ogDescription,
        'og:image':       settings.ogImage,
        'og:url':         settings.ogUrl,
      };
      state.ogIssues = (msg.issues || []).filter(i => ogFilter[i.tag]);
      state.url = msg.url || '';
      updateIcon(tabId);
      break;
    }

    case 'ogImageCheck':
      if (msg.issue && settings.ogImageBroken) {
        const dup = state.ogIssues.find(
          i => i.tag === 'og:image' && i.problem === msg.issue.problem
        );
        if (!dup) {
          state.ogIssues.push(msg.issue);
          updateIcon(tabId);
        }
      }
      break;
  }
});

// ---- Icon rendering --------------------------------------------------------

function getIconPath(state) {
  const hasOg     = state.ogIssues.length > 0;
  const hasLogs   = state.logs.length > 0;
  const hasErrors = state.errors.length > 0 || state.networkErrors.length > 0;

  const count = [hasOg, hasLogs, hasErrors].filter(Boolean).length;

  if (count === 0) return 'icons/neko-base.png';
  if (count >= 2)  return 'icons/neko-multi.png';
  if (hasOg)       return 'icons/neko-og.png';
  if (hasLogs)     return 'icons/neko-logs.png';
  if (hasErrors)   return 'icons/neko-errors.png';
}

function getBgColor(state) {
  const hasOg     = state.ogIssues.length > 0;
  const hasLogs   = state.logs.length > 0;
  const hasErrors = state.errors.length > 0 || state.networkErrors.length > 0;

  if (!hasOg && !hasLogs && !hasErrors) return null;
  if (hasErrors) return '#EF4444';
  if (hasLogs)   return '#9CA3AF';
  return '#EAB308';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function renderIcon(size, iconPath, bgColor) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (bgColor) {
    ctx.fillStyle = bgColor;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const response = await fetch(chrome.runtime.getURL(iconPath));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();

  return ctx.getImageData(0, 0, size, size);
}

// ---- Icon update -----------------------------------------------------------

async function updateIcon(tabId) {
  const state = getState(tabId);
  const iconPath = getIconPath(state);
  const bgColor = getBgColor(state);

  try {
    const img16 = await renderIcon(16, iconPath, bgColor);
    const img32 = await renderIcon(32, iconPath, bgColor);
    await chrome.action.setIcon({
      tabId: tabId,
      imageData: { '16': img16, '32': img32 },
    });
  } catch (e) {
    // Tab might have closed
  }

  const hasOg     = state.ogIssues.length > 0;
  const hasLogs   = state.logs.length > 0;
  const hasErrors = state.errors.length > 0 || state.networkErrors.length > 0;

  const parts = [];
  if (hasOg)     parts.push(chrome.i18n.getMessage('tooltipOg', [String(state.ogIssues.length)]));
  if (hasLogs)   parts.push(chrome.i18n.getMessage('tooltipLogs', [String(state.logs.length)]));
  if (state.errors.length > 0) parts.push(chrome.i18n.getMessage('tooltipErrors', [String(state.errors.length)]));
  if (state.networkErrors.length > 0) parts.push(chrome.i18n.getMessage('tooltipNetwork', [String(state.networkErrors.length)]));

  const title = parts.length > 0
    ? chrome.i18n.getMessage('tooltipPrefix') + parts.join(' / ')
    : chrome.i18n.getMessage('tooltipNoIssues');

  try {
    await chrome.action.setTitle({ tabId: tabId, title: title });
  } catch (e) { /* ignore */ }
}

// ---- Network error monitoring ----------------------------------------------

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0 || details.statusCode < 400) return;
    const is4xx = details.statusCode >= 400 && details.statusCode < 500;
    if (is4xx && !settings.networkHttp4xx) return;
    if (!is4xx && !settings.networkHttp5xx) return;
    const state = getState(details.tabId);
    state.networkErrors.push({
      status: details.statusCode,
      url: details.url,
      type: details.type,
      timestamp: Date.now(),
    });
    updateIcon(details.tabId);
  },
  { urls: ['<all_urls>'] }
);

const OPT_IN_NET_ERRORS = {
  'net::ERR_CACHE_MISS':        'networkErrCacheMiss',
  'net::ERR_ABORTED':           'networkErrAborted',
  'net::ERR_BLOCKED_BY_CLIENT': 'networkErrBlockedByClient',
  'net::ERR_BLOCKED_BY_RESPONSE': 'networkErrBlockedByResponse',
};

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const optInKey = OPT_IN_NET_ERRORS[details.error];
    if (optInKey !== undefined) {
      if (!settings[optInKey]) return;
    } else {
      if (!settings.networkConnection) return;
    }
    const state = getState(details.tabId);
    state.networkErrors.push({
      status: 0,
      url: details.url,
      type: details.type,
      error: details.error,
      timestamp: Date.now(),
    });
    updateIcon(details.tabId);
  },
  { urls: ['<all_urls>'] }
);

// ---- Initialization --------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});
