/** 浏览器半访问宿主的唯一出口。所有失败都抛 Error，message 已是给人看的中文。 */
export const API_BASE = '/api/immersive-reader'

async function call(method, path, { json, body, headers } = {}) {
  let res
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: 'same-origin',
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : body,
    })
  } catch (error) {
    throw new Error('连不上 dsh 宿主，检查它是否还在运行')
  }
  let data = null
  try { data = await res.json() } catch { /* 非 JSON */ }
  if (!data || typeof data !== 'object') throw new Error(`宿主返回了异常响应（HTTP ${res.status}）`)
  if (!data.ok) {
    const error = new Error(data.error?.message ?? '操作失败')
    error.code = data.error?.code
    throw error
  }
  return data.value
}

export const api = {
  books: () => call('GET', '/books'),
  importFile: (file) => call('POST', '/books/import', { body: file, headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) } }),
  importPath: (path) => call('POST', '/books/import-path', { json: { path } }),
  importUrl: (url) => call('POST', '/books/import-url', { json: { url } }),
  book: (id) => call('GET', `/books/${id}`),
  removeBook: (id) => call('DELETE', `/books/${id}`),
  chapter: (id, cid) => call('GET', `/books/${id}/chapters/${cid}`),
  saveState: (id, state) => call('POST', `/books/${id}/state`, { json: state }),
  translate: (id, options) => call('POST', `/books/${id}/translate`, { json: options ?? {} }),
  retranslate: (id, paraIds, instruction) => call('POST', `/books/${id}/retranslate`, { json: { paraIds, instruction } }),
  cancel: (id) => call('POST', `/books/${id}/cancel`, { json: {} }),
  status: (id) => call('GET', `/books/${id}/status`),
  glossary: (id, entry) => call('POST', `/books/${id}/glossary`, { json: entry }),
  bookSettings: (id) => call('GET', `/books/${id}/settings`),
  saveBookSettings: (id, patch) => call('POST', `/books/${id}/settings`, { json: patch }),
  session: (id, extend) => call('GET', `/books/${id}/session${extend ? '?extend=1' : ''}`),
  recall: (id) => call('POST', `/books/${id}/session/recall`, { json: {} }),
  recallBook: (id) => call('POST', `/books/${id}/recall-book`, { json: {} }),
  search: (id, q) => call('GET', `/books/${id}/search?q=${encodeURIComponent(q)}`),
  paragraph: (id, pid) => call('GET', `/books/${id}/paragraphs/${pid}`),
  marks: (id) => call('GET', `/books/${id}/marks`),
  setMark: (id, paraId, patch) => call('POST', `/books/${id}/marks`, { json: { paraId, ...patch } }),
  stats: (id, payload) => call('POST', `/books/${id}/stats`, { json: payload }),
  ask: (id, payload) => call('POST', `/books/${id}/ask`, { json: payload }),
  asks: (id) => call('GET', `/books/${id}/asks`),
  removeAsk: (id, askId) => call('DELETE', `/books/${id}/asks/${askId}`),
  exportBook: (id, params) => call('GET', `/books/${id}/export?${new URLSearchParams(params)}`),
  settings: () => call('GET', '/settings'),
  saveSettings: (patch) => call('POST', '/settings', { json: patch }),
  models: () => call('GET', '/models'),
}
