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
};

for (const el of document.querySelectorAll('[data-i18n]')) {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
}

const saved = document.getElementById('saved');
let saveTimeout;

async function load() {
  const result = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  const settings = { ...DEFAULT_SETTINGS, ...result.settings };

  for (const input of document.querySelectorAll('[data-key]')) {
    input.checked = settings[input.dataset.key];
  }
}

async function save() {
  const settings = {};
  for (const input of document.querySelectorAll('[data-key]')) {
    settings[input.dataset.key] = input.checked;
  }
  await chrome.storage.sync.set({ settings });

  saved.classList.add('show');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saved.classList.remove('show'), 1500);
}

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-key]')) save();
});

load();
