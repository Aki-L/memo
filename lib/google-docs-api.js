const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';
const LOG = '[Memo:API]';

/**
 * Create a new Google Doc.
 */
export async function createDocument(token, title) {
  console.log(`${LOG} createDocument called, title="${title}"`);
  const url = DOCS_API_BASE;
  const body = JSON.stringify({ title });

  console.log(`${LOG} POST ${url}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const responseBody = await response.text();
  console.log(`${LOG} createDocument response: ${response.status} ${response.statusText}`);
  console.log(`${LOG} createDocument body:`, responseBody);

  if (!response.ok) {
    throw new Error(`Failed to create document: ${response.status} ${responseBody}`);
  }

  const doc = JSON.parse(responseBody);
  console.log(`${LOG} createDocument success, documentId=${doc.documentId}`);
  return doc;
}

/**
 * Append text to an existing Google Doc.
 */
export async function appendToDocument(token, documentId, text) {
  console.log(`${LOG} appendToDocument called, documentId=${documentId}, text length=${text.length}`);
  const url = `${DOCS_API_BASE}/${documentId}:batchUpdate`;
  const body = JSON.stringify({
    requests: [{
      insertText: {
        endOfSegmentLocation: { segmentId: '' },
        text: text + '\n\n'
      }
    }]
  });

  console.log(`${LOG} POST ${url}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });

  const responseBody = await response.text();
  console.log(`${LOG} appendToDocument response: ${response.status} ${response.statusText}`);
  console.log(`${LOG} appendToDocument body:`, responseBody);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Document not found: ${documentId}`);
    }
    throw new Error(`Failed to append to document: ${response.status} ${responseBody}`);
  }

  console.log(`${LOG} appendToDocument success`);
  return JSON.parse(responseBody);
}

/**
 * Get document metadata (used to verify a doc still exists).
 */
export async function getDocument(token, documentId) {
  console.log(`${LOG} getDocument called, documentId=${documentId}`);
  const url = `${DOCS_API_BASE}/${documentId}`;

  console.log(`${LOG} GET ${url}`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const responseBody = await response.text();
  console.log(`${LOG} getDocument response: ${response.status} ${response.statusText}`);
  console.log(`${LOG} getDocument body:`, responseBody);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Document not found: ${documentId}`);
    }
    throw new Error(`Failed to get document: ${response.status} ${responseBody}`);
  }

  console.log(`${LOG} getDocument success, doc exists`);
  return JSON.parse(responseBody);
}
