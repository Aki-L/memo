const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';

/**
 * Create a new Google Doc.
 * @param {string} token - OAuth access token
 * @param {string} title - Document title
 * @returns {Promise<{documentId: string, title: string}>}
 */
export async function createDocument(token, title) {
  const response = await fetch(DOCS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create document: ${response.status} ${body}`);
  }

  return response.json();
}

/**
 * Append text to an existing Google Doc using endOfSegmentLocation.
 * @param {string} token - OAuth access token
 * @param {string} documentId - Target document ID
 * @param {string} text - Text to append (with newlines)
 * @returns {Promise<object>}
 */
export async function appendToDocument(token, documentId, text) {
  const response = await fetch(
    `${DOCS_API_BASE}/${documentId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              endOfSegmentLocation: { segmentId: '' },
              text: text + '\n\n'
            }
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 404) {
      throw new Error(`Document not found: ${documentId}`);
    }
    throw new Error(`Failed to append to document: ${response.status} ${body}`);
  }

  return response.json();
}

/**
 * Get document metadata (used to verify a doc still exists).
 * @param {string} token - OAuth access token
 * @param {string} documentId - Document ID
 * @returns {Promise<object>}
 */
export async function getDocument(token, documentId) {
  const response = await fetch(`${DOCS_API_BASE}/${documentId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 404) {
      throw new Error(`Document not found: ${documentId}`);
    }
    throw new Error(`Failed to get document: ${response.status} ${body}`);
  }

  return response.json();
}
