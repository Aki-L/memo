import { createDocument, appendToDocument, getDocument } from './lib/google-docs-api.js';

const CONTEXT_MENU_ID = 'save-to-gdocs';
const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Save to Google Docs',
    contexts: ['selection']
  });
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
    saveMode: 'append',    // 'append' | 'new'
    targetDocId: '',        // stored after first save when mode is 'append'
    prefix: '',             // optional text prepended to each selection
    suffix: ''              // optional text appended to each selection
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
  // Append source URL on a new line if available
  if (sourceUrl) {
    result += '\n— ' + sourceUrl;
  }
  return result;
}

async function saveToNewDoc(token, text) {
  const title = 'Memo — ' + new Date().toLocaleDateString();
  const doc = await createDocument(token, title);
  await appendToDocument(token, doc.documentId, text);

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon48.png',
    title: 'Saved to Google Docs',
    message: `Created new document: "${title}"`
  });
}

async function saveToDefaultDoc(token, text) {
  const settings = await loadSettings();
  let docId = settings.targetDocId;

  if (!docId) {
    // First save — create the default doc and store its ID
    const title = 'Memo — Saved Selections';
    const doc = await createDocument(token, title);
    docId = doc.documentId;
    await chrome.storage.local.set({ targetDocId: docId });

    await appendToDocument(token, docId, text);

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icon48.png',
      title: 'Saved to Google Docs',
      message: `Created default document. Future saves will append here.`
    });
    return;
  }

  // Verify the stored doc still exists
  try {
    await getDocument(token, docId);
  } catch (err) {
    if (err.message.includes('404') || err.message.includes('not found')) {
      // Doc was deleted — create a new one
      const title = 'Memo — Saved Selections';
      const doc = await createDocument(token, title);
      docId = doc.documentId;
      await chrome.storage.local.set({ targetDocId: docId });
    } else {
      throw err;
    }
  }

  await appendToDocument(token, docId, text);

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon48.png',
    title: 'Saved to Google Docs',
    message: 'Text appended to your document.'
  });
}

function handleError(err) {
  console.error('Memo extension error:', err);

  if (err.message?.includes('OAuth') || err.message?.includes('token')) {
    chrome.identity.removeCachedToken({ token: '' }, () => {});
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon48.png',
    title: 'Memo — Error',
    message: err.message || 'Failed to save to Google Docs. Check your connection and try again.'
  });

  // If we get an auth error, clear cached token so next attempt re-prompts
  if (err.message?.includes('401') || err.message?.includes('auth')) {
    chrome.identity.removeCachedToken({ token: '' }, () => {});
  }
}
