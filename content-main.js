/**
 * content-main.js — MAIN world content script
 *
 * Runs in the page's JavaScript context (not the extension's isolated world).
 * Intercepts console.log/info/debug/warn/error and uncaught errors,
 * then forwards summaries to the isolated-world content script via
 * a custom DOM event on document (shared between worlds).
 *
 * Injected at document_start so it patches console BEFORE page scripts run.
 */
(function () {
  'use strict';

  // Guard against double-injection
  if (window.__nekoCheckerInjected) return;
  window.__nekoCheckerInjected = true;

  const EVENT_NAME = '__neko_checker_event__';

  // ---- Console interception ------------------------------------------------

  const originalConsole = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    debug: console.debug.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  };

  /**
   * Safely stringify a console argument for display in the popup.
   * Avoids circular references and huge objects.
   */
  function safeStringify(arg) {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return arg.name + ': ' + arg.message;
    try {
      var s = JSON.stringify(arg, null, 0);
      return s && s.length > 200 ? s.slice(0, 200) + '…' : s;
    } catch (e) {
      return String(arg);
    }
  }

  function send(category, level, args) {
    var text = '';
    for (var i = 0; i < args.length; i++) {
      if (i > 0) text += ' ';
      text += safeStringify(args[i]);
    }
    // Use a CustomEvent on document — reliably crosses world boundaries
    // Detail is serialized as a JSON string to avoid cross-world cloning issues
    try {
      document.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: JSON.stringify({
          category: category,
          level: level,
          text: text.slice(0, 500),
          timestamp: Date.now(),
        })
      }));
    } catch (e) {
      // Silently fail if CustomEvent is not available
    }
  }

  // Wrap log-level methods → category 'log'
  ['log', 'info', 'debug'].forEach(function (method) {
    console[method] = function () {
      send('log', method, arguments);
      return originalConsole[method].apply(console, arguments);
    };
  });

  // console.warn → category 'log' (treated as a log, not a blocking error)
  console.warn = function () {
    send('log', 'warn', arguments);
    return originalConsole.warn.apply(console, arguments);
  };

  // console.error → category 'error'
  console.error = function () {
    send('error', 'error', arguments);
    return originalConsole.error.apply(console, arguments);
  };

  // ---- Uncaught errors & unhandled rejections ------------------------------

  window.addEventListener('error', function (e) {
    var msg = e.message || 'Unknown error';
    var loc = e.filename
      ? e.filename + ':' + e.lineno + ':' + e.colno
      : '';
    send('error', 'uncaught', [msg + (loc ? ' (' + loc + ')' : '')]);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    var msg = (reason instanceof Error)
      ? reason.name + ': ' + reason.message
      : safeStringify(reason);
    send('error', 'unhandledrejection', ['Unhandled Promise: ' + msg]);
  });

})();
