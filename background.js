import { createDocument, appendToDocument, getDocument } from './lib/google-docs-api.js';

const CONTEXT_MENU_ID = 'save-to-gdocs';

// Map notification IDs to document URLs so clicks can open them
const notificationUrls = {};

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Save to Google Docs',
    contexts: ['selection']
  });
});

// --- Notification Click — open the saved document ---
chrome.notifications.onClicked.addListener((notificationId) => {
  const url = notificationUrls[notificationId];
  if (url) {
    chrome.tabs.create({ url });
    delete notificationUrls[notificationId];
  }
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    handleSave(info.selectionText.trim(), info.pageUrl);
  }
});

// --- Core Save Logic ---
async function handleSave(text, sourceUrl) {
  try {
    const token = await getAuthToken();

    const settings = await loadSettings();
    const formattedText = formatText(text, sourceUrl, settings);

    if (settings.saveMode === 'new') {
      await saveToNewDoc(token, formattedText);
    } else {
      await saveToDefaultDoc(token, formattedText);
    }
  } catch (err) {
    handleError(err);
  }
}

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(new Error(err?.message || 'Failed to get auth token'));
      } else {
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
  chrome.notifications.create({ type: 'basic', iconUrl: 'assets/icon48.png', title, message }, (id) => {
    if (url) {
      notificationUrls[id] = url;
    }
  });
}

async function saveToNewDoc(token, text) {
  const title = 'Memo — ' + new Date().toLocaleDateString();
  const doc = await createDocument(token, title);
  await appendToDocument(token, doc.documentId, text);

  const url = docUrl(doc.documentId);
  showNotification(
    'Saved to Google Docs',
    `Created: "${title}"\nClick to open →`,
    url
  );
}

async function saveToDefaultDoc(token, text) {
  const settings = await loadSettings();
  let docId = settings.targetDocId;

  if (!docId) {
    const title = 'Memo — Saved Selections';
    const doc = await createDocument(token, title);
    docId = doc.documentId;
    const url = docUrl(docId);

    await chrome.storage.local.set({ targetDocId: docId, targetDocUrl: url });
    await appendToDocument(token, docId, text);

    showNotification(
      'Saved to Google Docs',
      `Created: "${title}"\nClick to open →`,
      url
    );
    return;
  }

  try {
    await getDocument(token, docId);
  } catch (err) {
    if (err.message.includes('404') || err.message.includes('not found')) {
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
  console.error('Memo extension error:', err);

  if (err.message?.includes('OAuth') || err.message?.includes('token')) {
    chrome.identity.removeCachedToken({ token: '' }, () => {});
  }

  showNotification(
    'Memo — Error',
    err.message || 'Failed to save to Google Docs. Check your connection and try again.',
    null
  );

  if (err.message?.includes('401') || err.message?.includes('auth')) {
    chrome.identity.removeCachedToken({ token: '' }, () => {});
  }
}
