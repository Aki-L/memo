import { createDocument, appendToDocument, getDocument } from './lib/google-docs-api.js';

const CONTEXT_MENU_ID = 'save-to-gdocs';
const LOG = '[Memo:BG]';

// Map notification IDs to document URLs so clicks can open them
const notificationUrls = {};

console.log(`${LOG} Service worker starting up (v2 — with timeout)`);

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  console.log(`${LOG} onInstalled — creating context menu`);
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Save to Google Docs',
    contexts: ['selection']
  }, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.error(`${LOG} Failed to create context menu:`, err.message);
    } else {
      console.log(`${LOG} Context menu created successfully`);
    }
  });
});

// --- Notification Click — open the saved document ---
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log(`${LOG} Notification clicked: ${notificationId}`);
  const url = notificationUrls[notificationId];
  if (url) {
    console.log(`${LOG} Opening ${url}`);
    chrome.tabs.create({ url });
    delete notificationUrls[notificationId];
  }
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log(`${LOG} Context menu clicked: menuItemId=${info.menuItemId}, hasSelection=${!!info.selectionText}`);
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    const text = info.selectionText.trim();
    console.log(`${LOG} Selected text length: ${text.length}, pageUrl: ${info.pageUrl}`);
    handleSave(text, info.pageUrl);
  }
});

// --- Core Save Logic ---
async function handleSave(text, sourceUrl) {
  console.log(`${LOG} === handleSave start ===`);
  try {
    console.log(`${LOG} Getting auth token...`);
    const token = await getAuthToken();
    console.log(`${LOG} Auth token obtained (length=${token.length})`);

    console.log(`${LOG} Loading settings...`);
    const settings = await loadSettings();
    console.log(`${LOG} Settings:`, JSON.stringify({ ...settings, prefix: settings.prefix || '(none)', suffix: settings.suffix || '(none)' }));

    const formattedText = formatText(text, sourceUrl, settings);
    console.log(`${LOG} Formatted text length: ${formattedText.length}`);

    if (settings.saveMode === 'new') {
      console.log(`${LOG} Save mode: new doc each time`);
      await saveToNewDoc(token, formattedText);
    } else {
      console.log(`${LOG} Save mode: append to default doc`);
      await saveToDefaultDoc(token, formattedText);
    }
    console.log(`${LOG} === handleSave complete ===`);
  } catch (err) {
    console.error(`${LOG} handleSave error:`, err);
    console.error(`${LOG} Error stack:`, err.stack);
    handleError(err);
  }
}

async function getAuthToken() {
  // Step 1: Try cached token first (non-interactive, fast)
  console.log(`${LOG} getAuthToken: trying cached token (interactive=false)...`);
  const cachedToken = await tryGetToken(false);
  if (cachedToken) {
    console.log(`${LOG} getAuthToken: cached token valid`);
    return cachedToken;
  }

  // Step 2: Cached token invalid/missing — clear it and try interactive
  console.log(`${LOG} getAuthToken: cached token invalid, clearing...`);
  await clearCachedToken();

  console.log(`${LOG} getAuthToken: requesting new token (interactive=true)...`);
  const newToken = await tryGetToken(true);
  if (newToken) {
    console.log(`${LOG} getAuthToken: new token obtained`);
    return newToken;
  }

  // Step 3: getAuthToken failed (popup blocked?) — use launchWebAuthFlow
  console.log(`${LOG} getAuthToken: getAuthToken failed, trying launchWebAuthFlow...`);
  const webAuthToken = await launchOAuthFlow();
  if (webAuthToken) {
    console.log(`${LOG} getAuthToken: launchWebAuthFlow succeeded`);
    return webAuthToken;
  }

  throw new Error('All auth methods failed. Popup blocker may be preventing the sign-in window.');
}

function tryGetToken(interactive) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error(`${LOG} getAuthToken timed out after 10s (interactive=${interactive})`);
        resolve(null);
      }
    }, 10000);

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const err = chrome.runtime.lastError;
      if (err || !token) {
        console.error(`${LOG} getAuthToken callback error (interactive=${interactive}):`, err?.message || 'no token');
        resolve(null);
      } else {
        console.log(`${LOG} getAuthToken callback success (interactive=${interactive})`);
        resolve(token);
      }
    });
  });
}

function clearCachedToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.log(`${LOG} Cached token removed`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

async function launchOAuthFlow() {
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id;
  const scope = (manifest.oauth2?.scopes || ['https://www.googleapis.com/auth/documents']).join(' ');

  if (!clientId || clientId.includes('REPLACE')) {
    console.error(`${LOG} launchOAuthFlow: no valid client_id in manifest`);
    return null;
  }

  const redirectUri = chrome.identity.getRedirectURL();
  console.log(`${LOG} launchOAuthFlow: redirectUri=${redirectUri}`);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);

  console.log(`${LOG} launchOAuthFlow: opening auth window...`);

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    if (!responseUrl) {
      console.error(`${LOG} launchOAuthFlow: user cancelled or no response`);
      return null;
    }

    // Extract access_token from the redirect URL hash fragment
    const hash = new URL(responseUrl).hash.slice(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');

    if (token) {
      console.log(`${LOG} launchOAuthFlow: extracted token (length=${token.length})`);
      return token;
    }

    const error = params.get('error');
    console.error(`${LOG} launchOAuthFlow: no token in response, error=${error}`);
    return null;
  } catch (err) {
    console.error(`${LOG} launchOAuthFlow error:`, err.message);
    return null;
  }
}

async function loadSettings() {
  const defaults = {
    saveMode: 'append',
    targetDocId: '',
    targetDocUrl: '',
    prefix: '',
    suffix: ''
  };
  const stored = await chrome.storage.local.get(defaults);
  return stored;
}

function formatText(text, sourceUrl, settings) {
  let result = text;
  if (settings.prefix) {
    result = settings.prefix + result;
  }
  if (settings.suffix) {
    result = result + settings.suffix;
  }
  if (sourceUrl) {
    result += '\n— ' + sourceUrl;
  }
  return result;
}

function docUrl(documentId) {
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

function showNotification(title, message, url) {
  console.log(`${LOG} showNotification: title="${title}", url=${url || 'none'}`);
  chrome.notifications.create({ type: 'basic', iconUrl: 'assets/icon48.png', title, message }, (id) => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.error(`${LOG} Notification creation failed:`, err.message);
    } else {
      console.log(`${LOG} Notification created: id=${id}`);
      if (url) {
        notificationUrls[id] = url;
      }
    }
  });
}

async function saveToNewDoc(token, text) {
  const title = 'Memo — ' + new Date().toLocaleDateString();
  console.log(`${LOG} saveToNewDoc: creating doc "${title}"`);

  const doc = await createDocument(token, title);
  console.log(`${LOG} saveToNewDoc: doc created, id=${doc.documentId}`);

  await appendToDocument(token, doc.documentId, text);
  console.log(`${LOG} saveToNewDoc: text appended`);

  const url = docUrl(doc.documentId);
  console.log(`${LOG} saveToNewDoc: doc URL = ${url}`);

  showNotification(
    'Saved to Google Docs',
    `Created: "${title}"\nClick to open →`,
    url
  );
}

async function saveToDefaultDoc(token, text) {
  const settings = await loadSettings();
  let docId = settings.targetDocId;

  console.log(`${LOG} saveToDefaultDoc: stored targetDocId=${docId || '(none)'}`);

  if (!docId) {
    console.log(`${LOG} saveToDefaultDoc: no existing doc, creating one`);
    const title = 'Memo — Saved Selections';
    const doc = await createDocument(token, title);
    docId = doc.documentId;
    const url = docUrl(docId);

    console.log(`${LOG} saveToDefaultDoc: storing targetDocId=${docId}`);
    await chrome.storage.local.set({ targetDocId: docId, targetDocUrl: url });

    // Verify storage
    const verify = await chrome.storage.local.get('targetDocId');
    console.log(`${LOG} saveToDefaultDoc: storage verified, targetDocId=${verify.targetDocId}`);

    await appendToDocument(token, docId, text);

    showNotification(
      'Saved to Google Docs',
      `Created: "${title}"\nClick to open →`,
      url
    );
    return;
  }

  console.log(`${LOG} saveToDefaultDoc: verifying existing doc ${docId}...`);
  try {
    await getDocument(token, docId);
    console.log(`${LOG} saveToDefaultDoc: doc exists, appending`);
  } catch (err) {
    console.error(`${LOG} saveToDefaultDoc: verify failed:`, err.message);
    if (err.message.includes('404') || err.message.includes('not found')) {
      console.log(`${LOG} saveToDefaultDoc: doc deleted, creating replacement`);
      const title = 'Memo — Saved Selections';
      const doc = await createDocument(token, title);
      docId = doc.documentId;
      const url = docUrl(docId);
      await chrome.storage.local.set({ targetDocId: docId, targetDocUrl: url });
    } else {
      throw err;
    }
  }

  await appendToDocument(token, docId, text);

  const url = docUrl(docId);
  showNotification(
    'Saved to Google Docs',
    'Text appended.\nClick to open document →',
    url
  );
}

function handleError(err) {
  console.error(`${LOG} handleError:`, err.message);

  if (err.message?.includes('OAuth') || err.message?.includes('token') || err.message?.includes('401') || err.message?.includes('auth')) {
    console.log(`${LOG} Clearing cached auth token...`);
    clearCachedToken();
  }

  showNotification(
    'Memo — Error',
    err.message || 'Failed to save to Google Docs.',
    null
  );
}
