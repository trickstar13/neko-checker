/**
 * content-isolated.js — ISOLATED world content script
 *
 * 1. Receives console interception data from the MAIN world script
 *    via a custom DOM event on document (shared between worlds).
 * 2. Inspects <meta property="og:..."> tags in the DOM.
 * 3. Sends reports to the service worker via chrome.runtime.sendMessage.
 *
 * Runs at document_start so the event listener is ready before any
 * page scripts execute.  OG tag inspection is deferred until the DOM
 * is fully parsed.
 */
(function () {
  'use strict';

  const EVENT_NAME = '__neko_checker_event__';

  // ---- Bridge: MAIN world → service worker --------------------------------

  let pendingMessages = [];
  let flushTimer = null;

  function flushMessages() {
    if (pendingMessages.length === 0) return;
    const batch = pendingMessages.splice(0);
    try {
      chrome.runtime.sendMessage({
        action: 'consoleEvents',
        events: batch,
      });
    } catch (e) {
      // Extension context might be invalidated on navigation
    }
    flushTimer = null;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushMessages, 300);
  }

  // Listen for custom DOM events from the MAIN world script.
  // Registered at document_start so we never miss early events.
  document.addEventListener(EVENT_NAME, function (e) {
    if (!e.detail) return;
    let data;
    try {
      data = JSON.parse(e.detail);
    } catch { return; }
    pendingMessages.push({
      category: data.category,
      level:    data.level,
      text:     data.text,
      timestamp: data.timestamp,
    });
    scheduleFlush();
  });

  // ---- OG tag inspection ---------------------------------------------------

  function checkOgTags() {
    const issues = [];

    // --- og:description ---
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      issues.push({
        tag: 'og:description',
        problem: 'missing',
        detail: chrome.i18n.getMessage('ogMissing', ['og:description']),
      });
    } else {
      const content = (ogDesc.getAttribute('content') || '').trim();
      if (content === '') {
        issues.push({
          tag: 'og:description',
          problem: 'empty',
          detail: chrome.i18n.getMessage('ogEmpty', ['og:description']),
        });
      }
    }

    // --- og:title ---
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      issues.push({
        tag: 'og:title',
        problem: 'missing',
        detail: chrome.i18n.getMessage('ogMissing', ['og:title']),
      });
    } else {
      const content = (ogTitle.getAttribute('content') || '').trim();
      if (content === '') {
        issues.push({
          tag: 'og:title',
          problem: 'empty',
          detail: chrome.i18n.getMessage('ogEmpty', ['og:title']),
        });
      }
    }

    // --- og:image ---
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (!ogImage) {
      issues.push({
        tag: 'og:image',
        problem: 'missing',
        detail: chrome.i18n.getMessage('ogMissing', ['og:image']),
      });
    } else {
      const url = (ogImage.getAttribute('content') || '').trim();
      if (url === '') {
        issues.push({
          tag: 'og:image',
          problem: 'empty',
          detail: chrome.i18n.getMessage('ogEmpty', ['og:image']),
        });
      } else {
        checkImageUrl(url);
      }
    }

    // --- og:url ---
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      issues.push({
        tag: 'og:url',
        problem: 'missing',
        detail: chrome.i18n.getMessage('ogMissing', ['og:url']),
      });
    }

    return issues;
  }

  /**
   * Check if an og:image URL is reachable using an Image element.
   */
  function checkImageUrl(url) {
    let absoluteUrl;
    try {
      absoluteUrl = new URL(url, document.location.href).href;
    } catch {
      sendOgImageResult(url, 'invalid', chrome.i18n.getMessage('ogImageInvalid'));
      return;
    }

    const img = new Image();
    img.onload = function () { /* reachable — OK */ };
    img.onerror = function () {
      sendOgImageResult(url, 'broken',
        chrome.i18n.getMessage('ogImageBroken'));
    };
    img.src = absoluteUrl;
  }

  function sendOgImageResult(url, problem, detail) {
    try {
      chrome.runtime.sendMessage({
        action: 'ogImageCheck',
        issue: { tag: 'og:image', problem: problem, detail: detail, url: url },
      });
    } catch (e) { /* ignore */ }
  }

  // ---- Wait for DOM ready, then run OG checks -----------------------------

  function onDomReady() {
    setTimeout(function () {
      const issues = checkOgTags();
      try {
        chrome.runtime.sendMessage({
          action: 'ogReport',
          issues: issues,
          url: location.href,
        });
      } catch (e) { /* ignore */ }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady);
  } else {
    onDomReady();
  }

})();
