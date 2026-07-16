# Memo — Save to Google Docs

A Chrome Extension that lets you save selected text to Google Docs via right-click context menu.

## Features

- Right-click any selected text → "Save to Google Docs"
- Append all selections to one default document, or create a new doc each time
- Customizable text prefix/suffix templates
- Source URL automatically appended to each entry
- OAuth 2.0 authentication via `chrome.identity` — no API keys to manage
- Clean options page for configuration

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable the **Google Docs API**
3. Configure the **OAuth consent screen** (External)
4. Create an **OAuth 2.0 Client ID** of type **Chrome Extension**
5. Copy the Client ID

### 2. Configure the Extension

1. Open `manifest.json`
2. Replace `REPLACE_WITH_YOUR_CLIENT_ID` with your OAuth Client ID

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this directory

## Usage

1. Select text on any web page
2. Right-click → **Save to Google Docs**
3. Sign in with Google when prompted
4. Your text is saved to Google Docs

Configure save mode, document target, and text templates in the extension options (right-click extension icon → Options).

## Project Structure

```
memo-extension/
├── manifest.json            # Chrome Extension Manifest V3
├── background.js            # Service worker (core logic)
├── lib/
│   └── google-docs-api.js   # Google Docs API wrapper
├── options/
│   ├── options.html         # Settings page
│   ├── options.js           # Settings logic
│   └── options.css          # Styles
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Permissions

| Permission       | Reason                                    |
|------------------|-------------------------------------------|
| `contextMenus`   | Right-click menu item                     |
| `identity`       | Google OAuth 2.0 authentication           |
| `storage`        | Save user settings and document ID        |
| `notifications`  | Show success/error notifications          |

## License

MIT
