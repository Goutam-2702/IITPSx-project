/*
 * api.js - every call to the backend in one place.
 *
 * The Vite dev server proxies /api to the Express port, so relative URLs
 * work in development and in a production build served by any static host
 * pointed at the same origin.
 */

const BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, options) {
  let response;
  try {
    response = await fetch(BASE + path, options);
  } catch (err) {
    throw new Error(
      'cannot reach the backend. Is it running on port 4000? (npm run dev)'
    );
  }

  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch (err) {
      throw new Error('the backend returned a response that was not JSON');
    }
  }

  if (!response.ok) {
    const message = body && body.error ? body.error : 'request failed (' + response.status + ')';
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function postJson(path, payload) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export const api = {
  health: () => request('/api/health'),
  examples: () => request('/api/examples'),

  assemble: (source, dumpFormat) => postJson('/api/assemble', { source, dumpFormat }),

  run: (objectFileId, options) =>
    postJson('/api/run', {
      objectFileId,
      trace: Boolean(options && options.trace),
      dumpBefore: Boolean(options && options.dumpBefore),
      dumpAfter: Boolean(options && options.dumpAfter)
    }),

  runSource: (source, options) =>
    postJson('/api/run-source', {
      source,
      dumpFormat: Boolean(options && options.dumpFormat),
      trace: options && options.trace !== undefined ? options.trace : true,
      dumpBefore: options && options.dumpBefore !== undefined ? options.dumpBefore : true,
      dumpAfter: options && options.dumpAfter !== undefined ? options.dumpAfter : true
    }),

  listPrograms: () => request('/api/programs'),
  savePrograms: (title, source) => postJson('/api/programs', { title, source }),
  deleteProgram: (id) => request('/api/programs/' + encodeURIComponent(id), { method: 'DELETE' }),

  downloadUrl: (objectFileId, kind) =>
    BASE + '/api/download/' + encodeURIComponent(objectFileId) + '/' + kind
};
