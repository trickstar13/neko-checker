/**
 * popup.js — Popup logic
 *
 * When the popup opens, queries the service worker for the active tab's
 * state and renders the results in the popup UI.
 */
(async function () {
  'use strict';

  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
  }

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Request state from service worker
  let state;
  try {
    state = await chrome.runtime.sendMessage({ action: 'getState', tabId: tab.id });
  } catch (e) {
    // Service worker might be asleep; state will be null
  }

  if (!state) {
    state = { logs: [], errors: [], ogIssues: [], networkErrors: [] };
  }
  if (!state.networkErrors) state.networkErrors = [];

  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'options.html' });
  });

  const hasOg      = state.ogIssues.length > 0;
  const hasLogs    = state.logs.length > 0;
  const hasErrors  = state.errors.length > 0;
  const hasNetwork = state.networkErrors.length > 0;
  const hasAny     = hasOg || hasLogs || hasErrors || hasNetwork;

  // ---- Show/hide sections ----

  if (!hasAny) {
    document.getElementById('status-ok').hidden = false;
    return;
  }

  // ---- OG Issues ----
  if (hasOg) {
    const section = document.getElementById('section-og');
    section.hidden = false;
    document.getElementById('count-og').textContent = state.ogIssues.length;

    const list = document.getElementById('list-og');
    for (const issue of state.ogIssues) {
      const li = document.createElement('li');
      li.setAttribute('data-tag', issue.tag);
      li.textContent = issue.detail;
      list.appendChild(li);
    }
  }

  // ---- Console Logs ----
  if (hasLogs) {
    const section = document.getElementById('section-logs');
    section.hidden = false;

    // Show max 50 entries (most recent first)
    const logs = state.logs.slice(-50).reverse();
    document.getElementById('count-logs').textContent = state.logs.length;

    const list = document.getElementById('list-logs');
    for (const entry of logs) {
      const li = document.createElement('li');
      li.setAttribute('data-level', entry.level);
      li.textContent = entry.text;
      list.appendChild(li);
    }
  }

  // ---- Errors ----
  if (hasErrors) {
    const section = document.getElementById('section-errors');
    section.hidden = false;

    const errors = state.errors.slice(-50).reverse();
    document.getElementById('count-errors').textContent = state.errors.length;

    const list = document.getElementById('list-errors');
    for (const entry of errors) {
      const li = document.createElement('li');
      li.setAttribute('data-level', entry.level);
      li.textContent = entry.text;
      list.appendChild(li);
    }
  }

  // ---- Network Errors ----
  if (hasNetwork) {
    const section = document.getElementById('section-network');
    section.hidden = false;

    const netErrors = state.networkErrors.slice(-50).reverse();
    document.getElementById('count-network').textContent = state.networkErrors.length;

    const list = document.getElementById('list-network');
    for (const entry of netErrors) {
      const li = document.createElement('li');
      const label = entry.status ? `${entry.status}` : entry.error || 'ERR';
      li.setAttribute('data-status', label);
      const url = new URL(entry.url);
      li.textContent = url.pathname + url.search;
      list.appendChild(li);
    }
  }

})();
