/**
 * routes.js —— `/api/immersive-reader/**`，浏览器半访问宿主的唯一出口。
 *
 * 只注册一条 prefix 路由，内部按 method + path 分派。
 * 响应信封固定：{ ok:true, value } / { ok:false, error:{ code, message } }。
 * 导入接口收原始字节（application/octet-stream + X-Filename 头），不走 base64，手机上传大书也不卡。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { extractArticle, fetchPage, filenameForUrl } from './web.js'
import { notesMarkdown, textMarkdown, safeName } from './export.js'
import { parseEpub } from './epub.js'
import { parseText } from './text.js'
import { linearize, sliceSession, isFrontMatter, firstContentChapter } from './translate.js'
import { summarizeStats, localDateString } from './store.js'

export const API_PREFIX = '/api/immersive-reader'

function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const JSON_LIMIT = 2 * 1024 * 1024
const IMPORT_LIMIT = 256 * 1024 * 1024

export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new AppError('E_TOO_BIG', '请求体太大', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req) {
  const body = await readBody(req, JSON_LIMIT)
  if (body.length === 0) return {}
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    throw new AppError('E_BAD_REQUEST', '请求体不是合法 JSON')
  }
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

const ok = (res, value) => send(res, 200, { ok: true, value })

function fail(res, error, logger) {
  if (error instanceof AppError) {
    send(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const code = typeof error?.code === 'string' ? error.code : 'E_INTERNAL'
  const known = {
    E_NOT_FOUND: [404, '找不到这本书或这一段'],
    E_BAD_REQUEST: [400, '请求不合法'],
    E_NO_MODEL: [409, error?.message],
    E_LLM: [502, error?.message],
    E_FETCH: [502, error?.message],
    E_UNSUPPORTED: [400, error?.message],
    E_TOO_BIG: [413, error?.message],
    EPUB_ENCRYPTED: [400, '这本 EPUB 有 DRM 加密，读不了'],
    EPUB_INVALID: [400, '这个文件不是完整的 EPUB'],
    EPUB_TOO_BIG: [413, '这本 EPUB 解压后太大'],
  }
  const [status, message] = known[code] ?? known[error?.message] ?? [500, '后台出了点问题，详情见 dsh 日志']
  if (status === 500) logger.warn(`[immersive-reader] ${error?.stack ?? error}`)
  send(res, status, { ok: false, error: { code: known[error?.message] ? error.message : code, message } })
}

/** 解码文本文件：UTF-8 优先，出现替换符太多时退到 GB18030。 */
function decodeText(bytes) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad === 0 || bad < utf8.length / 500) return utf8
  try {
    return new TextDecoder('gb18030').decode(bytes)
  } catch {
    return utf8
  }
}

export async function parseByFilename(bytes, filename) {
  const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  if (ext === 'epub') return parseEpub(bytes, { filename })
  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'text') {
    return parseText(decodeText(bytes), { filename })
  }
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return extractArticle(decodeText(bytes), { filename })
  throw new AppError('E_UNSUPPORTED', '目前只支持 EPUB、TXT、Markdown、HTML 和网页链接')
}

/**
 * @param {{ store: import('./store.js').LibraryStore, translator: import('./translate.js').Translator, logger: object }} deps
 */
export function createHandler({ store, translator, logger }) {
  const routes = []
  const route = (method, pattern, fn) => routes.push({ method, pattern, fn })

  route('GET', '/books', async () => store.listBooks())

  route('POST', '/books/import', async (req) => {
    const bytes = await readBody(req, IMPORT_LIMIT)
    if (bytes.length === 0) throw new AppError('E_EMPTY', '没有收到文件')
    const filename = decodeURIComponent(req.headers['x-filename'] ?? 'book.txt')
    const doc = await parseByFilename(bytes, filename)
    if (!doc.chapters.length) throw new AppError('E_EMPTY', '这个文件里没有读到正文')
    return store.addBook(bytes, { filename, doc })
  })

  route('POST', '/books/import-path', async (req) => {
    const { path } = await readJsonBody(req)
    if (typeof path !== 'string' || !path.startsWith('/')) throw new AppError('E_BAD_REQUEST', '需要绝对路径')
    const bytes = await readFile(path)
    const doc = await parseByFilename(bytes, basename(path))
    if (!doc.chapters.length) throw new AppError('E_EMPTY', '这个文件里没有读到正文')
    return store.addBook(bytes, { filename: basename(path), doc, sourceDir: dirname(path) })
  })

  /** 网页文章：抓下来抠正文，当一本（一章或几章的）书 */
  route('POST', '/books/import-url', async (req) => {
    const { url } = await readJsonBody(req)
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) throw new AppError('E_BAD_REQUEST', '需要 http / https 链接')
    const page = await fetchPage(url.trim())
    const doc = extractArticle(page.html, { url: page.url })
    if (!doc.chapters.length) throw new AppError('E_EMPTY', '这个网页里没有读到正文')
    const existing = (await store.findByUrl(page.url)) ?? (await store.findByUrl(url.trim()))
    return store.addBook(page.bytes, { filename: filenameForUrl(page.url), doc, ...(existing ? { id: existing.id } : {}) })
  })

  route('GET', '/books/:id', async (_req, { id }) => {
    const book = await store.book(id)
    const trans = await store.translations(id)
    const state = await store.state(id)
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      language: book.language,
      source: book.source,
      url: book.url ?? '',
      startChapterId: firstContentChapter(book)?.id ?? null,
      paragraphs: book.paragraphs,
      intro: trans.intro,
      bookRecall: trans.bookRecall ?? null,
      glossary: trans.glossary,
      state,
      stats: summarizeStats(state?.stats),
      marks: await store.marks(id),
      asks: await store.asks(id),
      status: translator.status(id),
      chapters: book.chapters.map(c => ({
        id: c.id,
        title: c.title,
        paragraphs: c.paragraphs.length,
        translated: c.paragraphs.filter(p => p.kind !== 'img' && trans.paragraphs[p.id]).length,
        translatable: c.paragraphs.filter(p => p.kind !== 'img').length,
        intro: Boolean(trans.chapters[c.id]?.intro),
      })),
    }
  })

  // 二进制路由约定：fn 自行 res.writeHead + res.end 并返回 undefined，handler 看到 res.writableEnded 就不再 ok()
  const ASSET_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
  route('GET', '/books/:id/assets/:file', async (_req, { id, file }, _url, res) => {
    if (!/^[A-Za-z0-9._-]+$/.test(file) || /^\.+$/.test(file)) throw new AppError('E_BAD_REQUEST', '文件名不合法', 400)
    const buffer = await store.asset(id, file)
    if (!buffer) throw new AppError('E_NOT_FOUND', '没有这张图片', 404)
    const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
    res.writeHead(200, {
      'content-type': ASSET_TYPES[ext] ?? 'application/octet-stream',
      'content-length': buffer.length,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    })
    res.end(buffer)
  })

  route('DELETE', '/books/:id', async (_req, { id }) => {
    translator.cancel(id)
    // 删书前把划线、笔记、追问留一份 Markdown，免得手滑
    let kept = null
    try {
      const marks = await store.marks(id)
      const asks = await store.asks(id)
      if (Object.keys(marks).length || asks.length) {
        const book = await store.book(id)
        const { markdown } = notesMarkdown(book, await store.translations(id), marks, asks)
        kept = join(await store.exportDir(safeName(book.title)), '划线与笔记（删书前备份）.md')
        await writeFile(kept, markdown, 'utf8')
      }
    } catch (error) { logger.warn(`[immersive-reader] 删书前备份笔记失败：${error?.message ?? error}`) }
    await store.removeBook(id)
    return { removed: id, kept }
  })

  route('GET', '/books/:id/chapters/:cid', async (_req, { id, cid }) => {
    const book = await store.book(id)
    const index = book.chapters.findIndex(c => c.id === cid)
    if (index < 0) throw new AppError('E_NOT_FOUND', '没有这一章', 404)
    const chapter = book.chapters[index]
    const trans = await store.translations(id)
    return {
      id: chapter.id,
      title: chapter.title,
      index,
      prev: book.chapters[index - 1]?.id ?? null,
      next: book.chapters[index + 1]?.id ?? null,
      intro: trans.chapters[cid]?.intro ?? null,
      paragraphs: chapter.paragraphs.map(p => ({ ...p, zh: trans.paragraphs[p.id]?.zh ?? null, note: trans.paragraphs[p.id]?.note ?? null })),
      status: translator.status(id),
    }
  })

  route('POST', '/books/:id/state', async (req, { id }) => {
    const { chapterId, paraId, lookahead } = await readJsonBody(req)
    const state = await store.saveState(id, { chapterId, paraId })
    let queued = 0
    if (lookahead !== false) queued = await translator.ensureLookahead(id, state)
    return { state, queued, status: translator.status(id) }
  })

  route('POST', '/books/:id/translate', async (req, { id }) => {
    const { chapterId, all, force } = await readJsonBody(req)
    let queued
    if (all) queued = await translator.translateAll(id)
    else if (chapterId) queued = await translator.translateChapter(id, chapterId, undefined, { force: Boolean(force) })
    else queued = await translator.ensureLookahead(id, await store.state(id))
    return { queued, status: translator.status(id) }
  })

  route('POST', '/books/:id/retranslate', async (req, { id }) => {
    const { paraIds, instruction } = await readJsonBody(req)
    if (!Array.isArray(paraIds) || paraIds.length === 0) throw new AppError('E_BAD_REQUEST', '需要 paraIds')
    const items = await translator.retranslate(id, paraIds.slice(0, 30), typeof instruction === 'string' ? instruction : '')
    return { items }
  })

  route('POST', '/books/:id/cancel', async (_req, { id }) => ({ cancelled: translator.cancel(id) }))

  route('GET', '/books/:id/status', async (_req, { id }) => {
    const trans = await store.translations(id)
    return { ...translator.status(id), translated: Object.keys(trans.paragraphs).length }
  })

  route('POST', '/books/:id/glossary', async (req, { id }) => {
    const { term, zh, remove } = await readJsonBody(req)
    if (remove) return (await store.mergeTranslations(id, { removeGlossary: [String(remove)] })).glossary
    if (typeof term !== 'string' || typeof zh !== 'string') throw new AppError('E_BAD_REQUEST', '需要 term 与 zh')
    return (await store.mergeTranslations(id, { glossary: [{ term, zh }] })).glossary
  })

  route('GET', '/books/:id/settings', async (_req, { id }) => store.bookSettings(id))
  route('POST', '/books/:id/settings', async (req, { id }) => {
    const { style, instruction } = await readJsonBody(req)
    return store.saveBookSettings(id, { style: typeof style === 'string' ? style : '', instruction: typeof instruction === 'string' ? instruction : '' })
  })

  /** 今日份：没有就按当前位置切一份；?extend=1 在当前份后面再接一份。 */
  route('GET', '/books/:id/session', async (_req, { id }, url) => {
    const book = await store.book(id)
    const settings = await store.settings()
    const state = (await store.state(id)) ?? {}
    const sessions = Array.isArray(state.sessions) ? [...state.sessions] : []
    const rows = linearize(book)
    const today = localDate()
    const target = Math.max(5, Number(settings.sessionMinutes) || 30) * 600
    const indexOf = pid => rows.findIndex(r => r.paragraph.id === pid)
    let current = sessions.length && sessions[sessions.length - 1].date === today ? sessions[sessions.length - 1] : null
    const extend = url.searchParams.get('extend') === '1'
    if (current && extend) {
      const start = indexOf(current.to) + 1
      if (start > 0 && start < rows.length) {
        const slice = sliceSession(rows, start, target)
        current = { ...current, to: slice[slice.length - 1].paragraph.id, recall: null, extended: (current.extended ?? 0) + 1 }
        sessions[sessions.length - 1] = current
        await store.saveSessions(id, sessions)
        translator.enqueueParagraphs(id, await translator.loadBook(id), await store.translations(id), slice, settings)
      }
    } else if (!current) {
      let start = state.paraId ? indexOf(state.paraId) : -1
      if (start < 0 && state.chapterId) start = rows.findIndex(r => r.chapter.id === state.chapterId)
      if (start < 0) start = 0
      // 还没开始读、或停在目录/版权页这类前置材料里：从第一个正文章节开始
      while (start < rows.length - 1 && isFrontMatter(rows[start].chapter.title)) {
        const cid = rows[start].chapter.id
        while (start < rows.length - 1 && rows[start].chapter.id === cid) start++
      }
      const slice = sliceSession(rows, start, target)
      if (slice.length === 0) return null
      current = { date: today, day: sessions.length + 1, from: slice[0].paragraph.id, to: slice[slice.length - 1].paragraph.id, recall: null }
      sessions.push(current)
      await store.saveSessions(id, sessions)
      translator.enqueueParagraphs(id, await translator.loadBook(id), await store.translations(id), slice, settings)
    }
    const from = indexOf(current.from)
    const to = indexOf(current.to)
    return { ...current, paragraphs: to >= from ? to - from + 1 : 0, chapters: [...new Set(rows.slice(from, to + 1).map(r => r.chapter.id))], total: rows.length, position: to + 1 }
  })

  /** 读完这一份的回想：论证脉络 + 问题 + 术语，存回 session。 */
  route('POST', '/books/:id/session/recall', async (_req, { id }) => {
    const book = await store.book(id)
    const state = (await store.state(id)) ?? {}
    const sessions = Array.isArray(state.sessions) ? [...state.sessions] : []
    const current = sessions[sessions.length - 1]
    if (!current) throw new AppError('E_BAD_REQUEST', '还没有今日份')
    const rows = linearize(book)
    const from = rows.findIndex(r => r.paragraph.id === current.from)
    const to = rows.findIndex(r => r.paragraph.id === current.to)
    const recall = await translator.recall(id, rows.slice(from, to + 1))
    sessions[sessions.length - 1] = { ...current, recall }
    await store.saveSessions(id, sessions)
    return recall
  })

  /** 读完全书的回想 */
  route('POST', '/books/:id/recall-book', async (_req, { id }) => translator.recallBook(id))

  /** 全书搜索：原文与译文都搜，返回命中段落与上下文片段 */
  route('GET', '/books/:id/search', async (_req, { id }, url) => {
    const q = (url.searchParams.get('q') ?? '').trim()
    if (q.length < 1) return []
    const book = await store.book(id)
    const trans = await store.translations(id)
    const needle = q.toLowerCase()
    const hits = []
    for (const chapter of book.chapters) {
      for (const p of chapter.paragraphs) {
        if (p.kind === 'img') continue
        const zh = trans.paragraphs[p.id]?.zh ?? ''
        const inZh = zh.toLowerCase().indexOf(needle)
        const inText = p.text.toLowerCase().indexOf(needle)
        if (inZh < 0 && inText < 0) continue
        const src = inZh >= 0 ? zh : p.text
        const at = inZh >= 0 ? inZh : inText
        const start = Math.max(0, at - 40)
        hits.push({ chapterId: chapter.id, chapterTitle: chapter.title, paraId: p.id, where: inZh >= 0 ? 'zh' : 'text', snippet: (start > 0 ? '…' : '') + src.slice(start, at + q.length + 60) + (at + q.length + 60 < src.length ? '…' : '') })
        if (hits.length >= 100) return hits
      }
    }
    return hits
  })

  /** 单段（给脚注弹层用） */
  route('GET', '/books/:id/paragraphs/:pid', async (_req, { id, pid }) => {
    const book = await store.book(id)
    for (const chapter of book.chapters) {
      const p = chapter.paragraphs.find(x => x.id === pid)
      if (p) {
        const trans = await store.translations(id)
        return { ...p, chapterId: chapter.id, chapterTitle: chapter.title, zh: trans.paragraphs[pid]?.zh ?? null }
      }
    }
    throw new AppError('E_NOT_FOUND', '没有这一段', 404)
  })

  /** 划线与笔记 */
  route('GET', '/books/:id/marks', async (_req, { id }) => store.marks(id))
  route('POST', '/books/:id/marks', async (req, { id }) => {
    const { paraId, highlight, note, addRange, removeRange } = await readJsonBody(req)
    if (typeof paraId !== 'string') throw new AppError('E_BAD_REQUEST', '需要 paraId')
    const patch = {}
    if (typeof addRange === 'string') patch.addRange = addRange.slice(0, 2000)
    if (typeof removeRange === 'string') patch.removeRange = removeRange
    if (highlight !== undefined) patch.highlight = Boolean(highlight)
    if (note !== undefined) patch.note = typeof note === 'string' ? note : ''
    return store.setMark(id, paraId, patch)
  })

  /** 行内追问：对选中文字或整段提问，答案落盘 */
  route('POST', '/books/:id/ask', async (req, { id }) => {
    const { paraId, selection, question, kind } = await readJsonBody(req)
    if (typeof paraId !== 'string') throw new AppError('E_BAD_REQUEST', '需要 paraId')
    const k = kind === 'explain' || kind === 'intent' ? kind : 'custom'
    const sel = typeof selection === 'string' ? selection.trim().slice(0, 600) : ''
    const q = typeof question === 'string' ? question.trim().slice(0, 1000) : ''
    if (k === 'explain' && !sel) throw new AppError('E_BAD_REQUEST', '「解释」需要选中一段文字')
    if (k === 'custom' && !q) throw new AppError('E_BAD_REQUEST', '写一个问题')
    const book = await store.book(id)
    const chapterId = book.chapters.find(c => c.paragraphs.some(p => p.id === paraId))?.id ?? null
    const { answer, model } = await translator.ask(id, { paraId, selection: sel, question: q, kind: k })
    return store.addAsk(id, { paraId, chapterId, selection: sel, question: q, kind: k, answer, model })
  })
  route('GET', '/books/:id/asks', async (_req, { id }) => store.asks(id))
  route('DELETE', '/books/:id/asks/:aid', async (_req, { id, aid }) => store.removeAsk(id, aid))

  /** 导出 Markdown：kind=notes | chapter（带 cid）| book；mode=zh | bilingual。写到书库 exports/ 目录并返回内容 */
  route('GET', '/books/:id/export', async (_req, { id }, url) => {
    const kind = url.searchParams.get('kind') ?? 'notes'
    const mode = url.searchParams.get('mode') === 'bilingual' ? 'bilingual' : 'zh'
    const cid = url.searchParams.get('cid') ?? ''
    const book = await store.book(id)
    const trans = await store.translations(id)
    let result
    let file
    if (kind === 'notes') {
      result = notesMarkdown(book, trans, await store.marks(id), await store.asks(id))
      file = '划线与笔记.md'
    } else if (kind === 'chapter') {
      const chapter = book.chapters.find(c => c.id === cid)
      if (!chapter) throw new AppError('E_NOT_FOUND', '没有这一章', 404)
      result = textMarkdown(book, trans, { chapterId: cid, mode })
      file = `${String(book.chapters.indexOf(chapter) + 1).padStart(2, '0')} ${safeName(chapter.title, 40)}${mode === 'bilingual' ? '（双语）' : ''}.md`
    } else if (kind === 'book') {
      result = textMarkdown(book, trans, { mode })
      file = `全书已译部分${mode === 'bilingual' ? '（双语）' : ''}.md`
    } else throw new AppError('E_BAD_REQUEST', '不认识的导出类型')
    const dir = await store.exportDir(safeName(book.title))
    const path = join(dir, file)
    await writeFile(path, result.markdown, 'utf8')
    return { path, markdown: result.markdown, count: result.count ?? result.paragraphs ?? 0 }
  })

  /** 阅读统计心跳：客户端每分钟报一次 */
  route('POST', '/books/:id/stats', async (req, { id }) => {
    const { seconds, paragraphs } = await readJsonBody(req)
    return store.addStats(id, { date: localDateString(), seconds: Number(seconds) || 0, paragraphs: Number(paragraphs) || 0 })
  })
  route('GET', '/books/:id/stats', async (_req, { id }) => summarizeStats((await store.state(id))?.stats))

  route('GET', '/settings', async () => store.settings())
  route('POST', '/settings', async (req) => store.saveSettings(await readJsonBody(req)))
  route('GET', '/models', async () => translator.modelCatalog())

  const compiled = routes.map(r => {
    const keys = []
    const regex = new RegExp('^' + r.pattern.replace(/:([a-z]+)/g, (_m, key) => { keys.push(key); return '([^/]+)' }) + '$')
    return { ...r, regex, keys }
  })

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost')
      const path = url.pathname.slice(API_PREFIX.length) || '/'
      const match = compiled.find(r => r.method === req.method && r.regex.test(path))
      if (!match) {
        throw new AppError('E_NOT_FOUND', '没有这个接口', 404)
      }
      const values = path.match(match.regex).slice(1).map(decodeURIComponent)
      const params = Object.fromEntries(match.keys.map((k, i) => [k, values[i]]))
      const value = await match.fn(req, params, url, res)
      if (!res.writableEnded) ok(res, value)
    } catch (error) {
      fail(res, error, logger)
    }
  }
}

export function registerRoutes(ctx, deps) {
  return ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: createHandler(deps) })
}
