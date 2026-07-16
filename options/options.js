// --- Default Settings ---
const DEFAULTS = {
  saveMode: 'append',
  targetDocId: '',
  targetDocUrl: '',
  prefix: '',
  suffix: ''
};

// --- DOM Elements ---
const saveModeRadios = document.getElementsByName('saveMode');
const targetDocInput = document.getElementById('targetDocId');
const prefixInput = document.getElementById('prefix');
const suffixInput = document.getElementById('suffix');
const clearDocBtn = document.getElementById('clear-doc');
const revokeAuthBtn = document.getElementById('revoke-auth');
const savedIndicator = document.getElementById('saved-indicator');
const authStatus = document.getElementById('auth-status');
const defaultDocSection = document.getElementById('default-doc-section');
const docLinkRow = document.getElementById('doc-link-row');
const docLink = document.getElementById('doc-link');

// --- Load Settings ---
async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  applySettings(settings);
  updateDocSectionVisibility(settings.saveMode);
}

function applySettings(settings) {
  // Save mode
  const activeRadio = document.querySelector(`input[name="saveMode"][value="${settings.saveMode}"]`);
  if (activeRadio) activeRadio.checked = true;

  // Text inputs
  targetDocInput.value = settings.targetDocId || '';
  prefixInput.value = settings.prefix || '';
  suffixInput.value = settings.suffix || '';

  // Document link
  if (settings.targetDocUrl) {
    docLink.href = settings.targetDocUrl;
    docLinkRow.style.display = '';
  } else {
    docLinkRow.style.display = 'none';
  }
}

function updateDocSectionVisibility(saveMode) {
  defaultDocSection.style.display = saveMode === 'append' ? '' : 'none';
}

// --- Save Handlers ---
async function saveSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
  showSaved();
}

function showSaved() {
  savedIndicator.classList.add('visible');
  clearTimeout(showSaved._timeout);
  showSaved._timeout = setTimeout(() => {
    savedIndicator.classList.remove('visible');
  }, 1500);
}

// --- Event Listeners ---
saveModeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    const value = e.target.value;
    saveSetting('saveMode', value);
    updateDocSectionVisibility(value);
  });
});

targetDocInput.addEventListener('change', () => {
  const docId = targetDocInput.value.trim();
  saveSetting('targetDocId', docId);
  if (docId) {
    const url = `https://docs.google.com/document/d/${docId}/edit`;
    chrome.storage.local.set({ targetDocUrl: url });
    docLink.href = url;
    docLinkRow.style.display = '';
  } else {
    docLinkRow.style.display = 'none';
  }
});

prefixInput.addEventListener('input', () => {
  saveSetting('prefix', prefixInput.value);
});

suffixInput.addEventListener('input', () => {
  saveSetting('suffix', suffixInput.value);
});

clearDocBtn.addEventListener('click', async () => {
  targetDocInput.value = '';
  docLinkRow.style.display = 'none';
  await chrome.storage.local.remove(['targetDocId', 'targetDocUrl']);
  showSaved();
});

revokeAuthBtn.addEventListener('click', () => {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) {
      // Revoke the token via Google's revocation endpoint
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
        .then(() => {
          chrome.identity.removeCachedToken({ token }, () => {
            authStatus.textContent = 'Disconnected. You will be prompted to sign in again on next save.';
            authStatus.className = 'status-text success';
          });
        })
        .catch(() => {
          chrome.identity.removeCachedToken({ token }, () => {
            authStatus.textContent = 'Disconnected (token cleared).';
            authStatus.className = 'status-text success';
          });
        });
    } else {
      authStatus.textContent = 'No active session found.';
      authStatus.className = 'status-text';
    }
  });
});

// --- Init ---
loadSettings();
