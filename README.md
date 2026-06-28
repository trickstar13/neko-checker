# NEKO Checker

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.2.0-green.svg)
![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow.svg?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E.svg?logo=javascript&logoColor=black)

**Notice Every Kind of Oversight**

[日本語](README.ja.md)

A Chrome extension that instantly visualizes easy-to-miss issues in web development through a cat icon in the toolbar.

## What It Detects

- `console.log` / `info` / `debug` / `warn` left in the page
- `console.error` or uncaught exceptions
- `og:title` / `og:description` / `og:image` / `og:url` issues
- Broken `og:image` links
- HTTP 4xx / 5xx network errors
- Connection failures (DNS resolution failure, connection refused, etc.)

## Cat Expressions at a Glance

| Status | Expression | Background |
| --- | --- | --- |
| No issues | Front face | Transparent |
| OG tag issues | Looking upper-left | Yellow |
| Logs present | Looking up | Gray |
| Errors found | Looking upper-right | Red |
| Multiple issues | Angry face | Most severe color |

## Installation

### Chrome Web Store

[NEKO Checker](#) (available after review approval)

### Development Build

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked"
4. Select the `neko-checker` folder

## Usage

- Open any page and the cat icon in the toolbar will change based on detected issues
- Click the icon to see details in a popup
- Hover over the icon to see a summary tooltip with issue counts

## Settings

Detection items can be toggled individually. Open the settings page from the "Settings" button at the bottom of the popup.

| Category | Options |
| --- | --- |
| OG Tags | `og:title` / `og:description` / `og:image` / `og:url` individually toggleable |
| Console Logs | `log` / `info` / `debug` / `warn` individually toggleable |
| Errors | `console.error` / uncaught exceptions / unhandled rejections individually toggleable |
| Network | HTTP 4xx / HTTP 5xx / connection errors individually toggleable |

## Testing

E2E tests are available using Puppeteer.

```bash
npm install
npm test
```

## File Structure

```
manifest.json          MV3 manifest
background.js          Service Worker (state management & icon rendering)
content-main.js        MAIN world (console interception)
content-isolated.js    ISOLATED world (OG inspection & message relay)
popup.html/css/js      Popup UI
options.html/css/js    Settings page
welcome.html/css/js    Welcome page
_locales/              i18n (Japanese & English)
icons/                 Cat icons (5 expressions + manifest icons)
test/                  Puppeteer E2E tests + fixtures
```

## Technical Details

- Chrome Extension Manifest V3
- No external libraries (vanilla JavaScript only)
- Composites expression PNGs with background colors via OffscreenCanvas for icon rendering
- Wraps the console object in the MAIN world (same execution context as the page)
- Monitors network errors via `chrome.webRequest`
- Persists settings via `chrome.storage.sync`
- Supports Japanese and English via `chrome.i18n`

## Requirements

Chrome 111 or later (supports `"world": "MAIN"` in content_scripts)

## License

MIT
