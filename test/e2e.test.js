const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const FIXTURES_PATH = path.join(__dirname, 'fixtures');
const PORT = 9222;

let browser, server;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const filePath = path.join(FIXTURES_PATH, req.url === '/' ? 'clean.html' : req.url);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const ext = path.extname(filePath);
        const contentType = ext === '.png' ? 'image/png' : 'text/html; charset=utf-8';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve());
  });
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });
}

async function getServiceWorker(browser) {
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().includes('chrome-extension://'),
    { timeout: 10000 }
  );
  return swTarget.worker();
}

async function getState(worker) {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return { logs: [], errors: [], ogIssues: [], networkErrors: [] };
    const state = tabState.get(tab.id);
    if (!state) return { logs: [], errors: [], ogIssues: [], networkErrors: [] };
    return {
      logs: [...state.logs],
      errors: [...state.errors],
      ogIssues: [...state.ogIssues],
      networkErrors: [...state.networkErrors],
    };
  });
}

async function navigateAndWait(page, url, waitMs = 2000) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, waitMs));
}

// ---- Test runner -----------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

async function run() {
  await startServer();
  console.log(`Test server running on port ${PORT}\n`);

  browser = await launchBrowser();
  const worker = await getServiceWorker(browser);
  console.log('Service worker connected\n');

  // Wait for and close the welcome tab opened on install
  await new Promise((r) => setTimeout(r, 1000));
  let allPages = await browser.pages();
  for (const p of allPages) {
    if (p.url().includes('welcome.html')) {
      await p.close();
    }
  }

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  // ---- Test 1: Clean page — no issues ----
  console.log('Test 1: Clean page — no issues');
  await navigateAndWait(page, `http://localhost:${PORT}/clean.html`);

  let state = await getState(worker);
  assert(state.ogIssues.length === 0, `OG issues: 0 (got ${state.ogIssues.length})`);
  assert(state.logs.length === 0, `Logs: 0 (got ${state.logs.length})`);
  assert(state.errors.length === 0, `Errors: 0 (got ${state.errors.length})`);
  assert(state.networkErrors.length === 0, `Network errors: 0 (got ${state.networkErrors.length})`);

  // ---- Test 2: OG issues only ----
  console.log('\nTest 2: OG issues only');
  await navigateAndWait(page, `http://localhost:${PORT}/og-issues.html`);

  state = await getState(worker);
  assert(state.ogIssues.length >= 2, `OG issues: ≥2 (got ${state.ogIssues.length})`);
  assert(state.logs.length === 0, `Logs: 0 (got ${state.logs.length})`);
  assert(state.errors.length === 0, `Errors: 0 (got ${state.errors.length})`);

  const ogTags = state.ogIssues.map((i) => i.tag);
  assert(ogTags.includes('og:description'), 'Detected og:description issue');
  assert(ogTags.includes('og:image'), 'Detected og:image issue');
  assert(ogTags.includes('og:url'), 'Detected og:url issue');

  // ---- Test 3: Logs only ----
  console.log('\nTest 3: Console logs only');
  await navigateAndWait(page, `http://localhost:${PORT}/logs-only.html`);

  state = await getState(worker);
  assert(state.logs.length === 2, `Logs: 2 (got ${state.logs.length})`);
  assert(state.errors.length === 0, `Errors: 0 (got ${state.errors.length})`);
  assert(state.ogIssues.length === 0, `OG issues: 0 (got ${state.ogIssues.length})`);

  const levels = state.logs.map((l) => l.level);
  assert(levels.includes('log'), 'Detected console.log');
  assert(levels.includes('warn'), 'Detected console.warn');

  // ---- Test 4: Errors only ----
  console.log('\nTest 4: Errors only');
  await navigateAndWait(page, `http://localhost:${PORT}/errors-only.html`);

  state = await getState(worker);
  assert(state.errors.length === 1, `Errors: 1 (got ${state.errors.length})`);
  assert(state.logs.length === 0, `Logs: 0 (got ${state.logs.length})`);
  assert(state.errors[0].level === 'error', 'Error level is "error"');

  // ---- Test 5: Multiple issue types ----
  console.log('\nTest 5: Multiple issue types');
  await navigateAndWait(page, `http://localhost:${PORT}/multi-issues.html`);

  state = await getState(worker);
  assert(state.ogIssues.length >= 1, `OG issues: ≥1 (got ${state.ogIssues.length})`);
  assert(state.logs.length >= 1, `Logs: ≥1 (got ${state.logs.length})`);
  assert(state.errors.length >= 1, `Errors: ≥1 (got ${state.errors.length})`);

  // ---- Test 6: og:image broken (absolute URL, 404) ----
  console.log('\nTest 6: og:image broken (absolute URL returning 404)');
  await navigateAndWait(page, `http://localhost:${PORT}/og-image-broken.html`, 3000);

  state = await getState(worker);
  const brokenIssue = state.ogIssues.find(
    (i) => i.tag === 'og:image' && i.problem === 'broken'
  );
  assert(brokenIssue !== undefined, 'Detected og:image broken link');
  assert(state.logs.length === 0, `No logs (got ${state.logs.length})`);
  assert(state.errors.length === 0, `No errors (got ${state.errors.length})`);

  // ---- Test 7: og:image OK (absolute URL, 200) ----
  console.log('\nTest 7: og:image OK (absolute URL returning 200)');
  await navigateAndWait(page, `http://localhost:${PORT}/og-image-ok.html`, 3000);

  state = await getState(worker);
  const falsePositive = state.ogIssues.find(
    (i) => i.tag === 'og:image'
  );
  assert(falsePositive === undefined, 'No false positive for valid og:image');
  assert(state.ogIssues.length === 0, `OG issues: 0 (got ${state.ogIssues.length})`);

  // ---- Test 8: Navigation resets state ----
  console.log('\nTest 8: Navigation resets state');
  await navigateAndWait(page, `http://localhost:${PORT}/multi-issues.html`);
  state = await getState(worker);
  assert(state.logs.length >= 1, 'Has issues before navigation');

  await navigateAndWait(page, `http://localhost:${PORT}/clean.html`);
  state = await getState(worker);
  assert(state.logs.length === 0, 'State reset after navigation');
  assert(state.errors.length === 0, 'Errors reset after navigation');

  // ---- Test 9: Network errors ----
  console.log('\nTest 9: Network errors');
  await navigateAndWait(page, `http://localhost:${PORT}/network-errors.html`, 3000);

  state = await getState(worker);
  assert(state.networkErrors.length >= 1, `Network errors: ≥1 (got ${state.networkErrors.length})`);

  // ---- Test 10: Settings disable OG detection ----
  console.log('\nTest 10: Settings disable OG detection');
  await worker.evaluate(() =>
    chrome.storage.sync.set({ settings: {
      ogTitle: false, ogDescription: false, ogImage: false,
      ogImageBroken: false, ogUrl: false,
      consoleLogs: true, consoleInfo: true, consoleDebug: true, consoleWarn: true,
      consoleError: true, uncaughtErrors: true, unhandledRejections: true,
      networkHttp4xx: true, networkHttp5xx: true, networkConnection: true,
      networkErrCacheMiss: false, networkErrAborted: false, networkErrBlockedByClient: false, networkErrBlockedByResponse: false,
    }})
  );
  await new Promise((r) => setTimeout(r, 500));
  await navigateAndWait(page, `http://localhost:${PORT}/og-issues.html`);

  state = await getState(worker);
  assert(state.ogIssues.length === 0, `OG issues suppressed: 0 (got ${state.ogIssues.length})`);

  // ---- Test 11: Settings disable console log detection ----
  console.log('\nTest 11: Settings disable console log detection');
  await worker.evaluate(() =>
    chrome.storage.sync.set({ settings: {
      ogTitle: true, ogDescription: true, ogImage: true,
      ogImageBroken: true, ogUrl: true,
      consoleLogs: false, consoleInfo: false, consoleDebug: false, consoleWarn: false,
      consoleError: true, uncaughtErrors: true, unhandledRejections: true,
      networkHttp4xx: true, networkHttp5xx: true, networkConnection: true,
    }})
  );
  await new Promise((r) => setTimeout(r, 500));
  await navigateAndWait(page, `http://localhost:${PORT}/logs-only.html`);

  state = await getState(worker);
  assert(state.logs.length === 0, `Logs suppressed: 0 (got ${state.logs.length})`);

  // ---- Test 12: Settings disable error detection ----
  console.log('\nTest 12: Settings disable error detection');
  await worker.evaluate(() =>
    chrome.storage.sync.set({ settings: {
      ogTitle: true, ogDescription: true, ogImage: true,
      ogImageBroken: true, ogUrl: true,
      consoleLogs: true, consoleInfo: true, consoleDebug: true, consoleWarn: true,
      consoleError: false, uncaughtErrors: false, unhandledRejections: false,
      networkHttp4xx: true, networkHttp5xx: true, networkConnection: true,
    }})
  );
  await new Promise((r) => setTimeout(r, 500));
  await navigateAndWait(page, `http://localhost:${PORT}/errors-only.html`);

  state = await getState(worker);
  assert(state.errors.length === 0, `Errors suppressed: 0 (got ${state.errors.length})`);

  // Restore defaults
  await worker.evaluate(() =>
    chrome.storage.sync.set({ settings: {
      ogTitle: true, ogDescription: true, ogImage: true,
      ogImageBroken: true, ogUrl: true,
      consoleLogs: true, consoleInfo: true, consoleDebug: true, consoleWarn: true,
      consoleError: true, uncaughtErrors: true, unhandledRejections: true,
      networkHttp4xx: true, networkHttp5xx: true, networkConnection: true,
      networkErrCacheMiss: false, networkErrAborted: false, networkErrBlockedByClient: false, networkErrBlockedByResponse: false,
    }})
  );

  // ---- Summary ----
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);

  await browser.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  if (browser) browser.close();
  if (server) server.close();
  process.exit(1);
});
