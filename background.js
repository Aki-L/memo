import { createDocument, appendToDocument, getDocument } from './lib/google-docs-api.js';

const CONTEXT_MENU_ID = 'save-to-gdocs';
const LOG = '[Memo:BG]';

// Map notification IDs to document URLs so clicks can open them
const notificationUrls = {};

console.log(`${LOG} Service worker starting up`);

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
  return new Promise((resolve, reject) => {
    let settled = false;

    // Timeout: identity API silently fails on chrome:// and edge:// pages
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error(`${LOG} getAuthToken timed out after 8s — likely a chrome:// page`);
        reject(new Error('Cannot authenticate on this page. Try on any website (https://...).'));
      }
    }, 8000);

    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const err = chrome.runtime.lastError;
      if (err || !token) {
        console.error(`${LOG} getAuthToken failed:`, err?.message);
        reject(new Error(err?.message || 'Failed to get auth token'));
      } else {
        console.log(`${LOG} getAuthToken success`);
        resolve(token);
      }
    });
  });
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

  if (err.message?.includes('OAuth') || err.message?.includes('token')) {
    console.log(`${LOG} Clearing cached token`);
    chrome.identity.removeCachedToken({ token: '' }, () => {});
  }

  showNotification(
    'Memo — Error',
    err.message || 'Failed to save to Google Docs.',
    null
  );

  if (err.message?.includes('401') || err.message?.includes('auth')) {
    chrome.identity.removeCachedToken({ token: '' }, () => {});
  }
}
