/**
 * store.js —— 书库落盘。
 *
 * 目录布局（默认 $DSH_HOME/reading-room）：
 *   settings.json                 全局设置（预译范围、模型、字号、显示模式…）
 *   books/<bookId>/book.json      解析后的原文（BookDoc + 导入元信息）
 *   books/<bookId>/trans.json     译文：{ paragraphs: { [paraId]: {zh, note, model, at} }, chapters: { [chapId]: {intro} }, intro, glossary }
 *   books/<bookId>/state.json     阅读状态：{ chapterId, paraId, updatedAt }
 *   books/<bookId>/asks.json      行内追问：[{ id, paraId, selection, question, kind, answer, at }]
 *   books/<bookId>/source.<ext>   原始文件（便于重新解析）
 *
 * 全部 JSON 都是「整文件原子写」：先写 .tmp 再 rename。书不大（几 MB），不值得上数据库。
 * 译文按段落 id 存，和原文解耦：重新解析原文只要 id 稳定，译文就不丢。
 */
import { mkdir, readFile, writeFile, rename, readdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve as resolvePathFs } from 'node:path'

export const DEFAULT_SETTINGS = Object.freeze({
  /** 预译范围：当前位置之后要保证译好的量。unit: 'chapters' | 'paragraphs' */
  lookahead: { unit: 'chapters', count: 1 },
  /** 每份阅读时长（分钟），用来切「今日份」 */
  sessionMinutes: 30,
  /** 空串 = 跟随宿主默认模型 */
  provider: '',
  model: '',
  /** 译文风格说明，会原样进入提示词 */
  style: '忠实、自然的现代书面中文；学术书保持术语严谨，文学书保留文风。',
  /** 用户附加要求（可空） */
  instruction: '',
  /** 是否生成译注与导读 */
  notes: true,
  intros: true,
  /** 显示：'zh' | 'bilingual' | 'original' */
  display: 'zh',
  fontSize: 18,
  lineHeight: 1.9,
  /** 正文字体：'serif' | 'sans' */
  fontFamily: 'serif',
  /** 朗读语速 */
  speechRate: 1,
  /** 并发的模型调用数 */
  concurrency: 2,
})

const MAX_LOCAL_IMAGE = 20 * 1024 * 1024
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i

/** zip 路径 -> 单层安全文件名（只含 [A-Za-z0-9._-]，不会穿越目录）。 */
export function assetFileName(zipPath) {
  let name = encodeURIComponent(String(zipPath)).replace(/%/g, '_').replace(/[^A-Za-z0-9._-]/g, '_')
  if (name.length > 120) {
    const hash = createHash('sha256').update(String(zipPath)).digest('hex').slice(0, 8)
    name = `${hash}_${name.slice(-100)}`
  }
  if (/^\.+$/.test(name)) name = `_${name}`
  return name
}

function bookId(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(value), 'utf8')
  await rename(tmp, path)
}

/** 统计摘要：累计分钟、读过的天数、连续天数（到今天或昨天为止）、今天的分钟与段数 */
export function summarizeStats(stats, today = localDateString()) {
  const days = stats?.days ?? {}
  const dates = Object.keys(days).sort()
  let minutes = 0
  for (const d of dates) minutes += days[d].seconds / 60
  let streak = 0
  const cursor = new Date(today + 'T00:00:00')
  if (!days[today]) cursor.setDate(cursor.getDate() - 1)
  for (;;) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    if (!days[key]) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  const t = days[today] ?? { seconds: 0, paragraphs: 0 }
  return { minutes: Math.round(minutes), days: dates.length, streak, today: { minutes: Math.round(t.seconds / 60), paragraphs: t.paragraphs } }
}

export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export class LibraryStore {
  /** @param {string} root 书库目录 */
  constructor(root) {
    this.root = root
    this.booksDir = join(root, 'books')
    /** 写串行化：同一本书的 trans.json 可能被多个翻译任务同时改 */
    this.locks = new Map()
  }

  async init() {
    await mkdir(this.booksDir, { recursive: true })
  }

  /** 同一把 key 的异步操作排队执行，避免读-改-写交错丢数据。 */
  async locked(key, fn) {
    const prev = this.locks.get(key) ?? Promise.resolve()
    let release
    const next = new Promise(resolve => { release = resolve })
    this.locks.set(key, prev.then(() => next))
    try {
      await prev
      return await fn()
    } finally {
      release()
      if (this.locks.get(key) === next) this.locks.delete(key)
    }
  }

  // ── 设置 ──────────────────────────────────────────────
  async settings() {
    const saved = await readJson(join(this.root, 'settings.json'), {})
    return { ...DEFAULT_SETTINGS, ...saved, lookahead: { ...DEFAULT_SETTINGS.lookahead, ...(saved.lookahead ?? {}) } }
  }

  async saveSettings(patch) {
    return this.locked('settings', async () => {
      const current = await this.settings()
      const next = { ...current, ...patch }
      if (patch.lookahead) next.lookahead = { ...current.lookahead, ...patch.lookahead }
      await writeJsonAtomic(join(this.root, 'settings.json'), next)
      return next
    })
  }

  // ── 书 ────────────────────────────────────────────────
  bookDir(id) {
    if (!/^[0-9a-f]{16}$/.test(id)) throw Object.assign(new Error('bad book id'), { code: 'E_BAD_REQUEST' })
    return join(this.booksDir, id)
  }

  /**
   * 导入：写原始文件 + 解析结果。重复导入同一文件返回同一 id（内容哈希）。
   * @param {Uint8Array} bytes
   * @param {{ filename: string, doc: object, sourceDir?: string }} input
   *   doc.assets（{zipPath: Uint8Array}）落盘到 assets/，book.json 里不存二进制；
   *   Markdown 的本地图片相对 sourceDir 读取，读不到就保留段落但没有 file。
   */
  async addBook(bytes, { filename, doc, sourceDir, id: forcedId }) {
    const id = forcedId ?? bookId(bytes)
    const dir = this.bookDir(id)
    await mkdir(dir, { recursive: true })
    const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase()
    await writeFile(join(dir, `source.${ext}`), bytes)
    const paragraphs = doc.chapters.reduce((n, c) => n + c.paragraphs.length, 0)
    const { assets = {}, cover, ...rest } = doc
    const assetsDir = join(dir, 'assets')
    await rm(assetsDir, { recursive: true, force: true })
    const written = new Set()
    const putAsset = async (zipPath, data) => {
      const file = assetFileName(zipPath)
      if (!written.has(file)) {
        if (!written.size) await mkdir(assetsDir, { recursive: true })
        await writeFile(join(assetsDir, file), data)
        written.add(file)
      }
      return file
    }
    for (const [zipPath, data] of Object.entries(assets)) await putAsset(zipPath, data)
    const chapters = []
    for (const chapter of rest.chapters) {
      const paras = []
      for (const p of chapter.paragraphs) {
        if (p.kind !== 'img' || typeof p.src !== 'string') { paras.push(p); continue }
        if (Object.hasOwn(assets, p.src)) { paras.push({ ...p, file: assetFileName(p.src) }); continue }
        let file
        if (sourceDir && !/^[a-z][a-z0-9+.-]*:/i.test(p.src) && !p.src.startsWith('/') && IMAGE_EXT.test(p.src.split(/[?#]/)[0])) {
          try {
            const local = resolvePathFs(sourceDir, decodeURI(p.src.split(/[?#]/)[0]))
            if ((await stat(local)).size <= MAX_LOCAL_IMAGE) file = await putAsset(p.src, await readFile(local))
          } catch { /* 读不到：保留段落，不带 file */ }
        }
        paras.push(file ? { ...p, file } : p)
      }
      chapters.push({ ...chapter, paragraphs: paras })
    }
    const book = {
      id,
      filename,
      importedAt: new Date().toISOString(),
      paragraphs,
      ...rest,
      chapters,
      ...(cover && Object.hasOwn(assets, cover) ? { coverFile: assetFileName(cover) } : {}),
    }
    const previous = await readJson(join(dir, 'book.json'), null)
    await writeJsonAtomic(join(dir, 'book.json'), book)
    if (previous) await this.remapTranslations(id, previous, book)
    return book
  }

  /**
   * 同一本书重新解析后段落 id 可能变（比如解析器学会了表格），译文按「原文文本」对回新 id：
   * 文本相同就沿用，对不上的译文丢掉，等后台重译。
   */
  async remapTranslations(id, previous, next) {
    return this.locked(`trans:${id}`, async () => {
      const trans = await this.translations(id)
      if (Object.keys(trans.paragraphs).length === 0) return
      const byText = new Map()
      for (const chapter of previous.chapters) {
        for (const p of chapter.paragraphs) {
          const t = trans.paragraphs[p.id]
          if (t && !byText.has(p.text)) byText.set(p.text, t)
        }
      }
      const paragraphs = {}
      for (const chapter of next.chapters) {
        for (const p of chapter.paragraphs) {
          const t = byText.get(p.text)
          if (t) paragraphs[p.id] = t
        }
      }
      await writeJsonAtomic(join(this.bookDir(id), 'trans.json'), { ...trans, paragraphs })
      // 阅读位置与阅读份也按原文对回新 id
      const state = await this.state(id)
      if (state) {
        const oldText = new Map()
        for (const chapter of previous.chapters) for (const p of chapter.paragraphs) oldText.set(p.id, p.text)
        const newId = new Map()
        const chapterOf = new Map()
        for (const chapter of next.chapters) for (const p of chapter.paragraphs) { if (!newId.has(p.text)) newId.set(p.text, p.id); chapterOf.set(p.id, chapter.id) }
        const remapPara = pid => { const t = pid && oldText.get(pid); return t !== undefined && newId.has(t) ? newId.get(t) : null }
        const paraId = remapPara(state.paraId)
        const oldTitle = previous.chapters.find(c => c.id === state.chapterId)?.title
        const chapterId = paraId ? chapterOf.get(paraId) : (next.chapters.find(c => c.title === oldTitle)?.id ?? null)
        const sessions = (state.sessions ?? []).map(sn => { const from = remapPara(sn.from); const to = remapPara(sn.to); return from && to ? { ...sn, from, to } : null }).filter(Boolean)
        await writeJsonAtomic(join(this.bookDir(id), 'state.json'), { ...state, chapterId: chapterId ?? state.chapterId, paraId: paraId ?? null, sessions })
      }
    })
  }

  async listBooks() {
    let ids = []
    try {
      ids = (await readdir(this.booksDir)).filter(name => /^[0-9a-f]{16}$/.test(name))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const rows = []
    for (const id of ids) {
      const book = await readJson(join(this.bookDir(id), 'book.json'), null)
      if (!book) continue
      const trans = await this.translations(id)
      const state = await this.state(id)
      rows.push({
        id,
        title: book.title,
        titleZh: trans.title ?? null,
        author: book.author,
        language: book.language,
        source: book.source,
        filename: book.filename,
        url: book.url ?? '',
        coverFile: book.coverFile,
        importedAt: book.importedAt,
        chapters: book.chapters.length,
        paragraphs: book.paragraphs,
        chars: book.chapters.reduce((n, c) => n + c.paragraphs.reduce((m, p) => m + (p.kind === 'img' ? 0 : p.text.length), 0), 0),
        translated: Object.keys(trans.paragraphs).length,
        state,
        currentChapter: state?.chapterId ? (trans.chapters?.[state.chapterId]?.title ?? book.chapters.find(c => c.id === state.chapterId)?.title ?? null) : null,
        stats: summarizeStats(state?.stats),
      })
    }
    rows.sort((a, b) => (b.state?.updatedAt ?? b.importedAt).localeCompare(a.state?.updatedAt ?? a.importedAt))
    return rows
  }

  /** 按来源链接找已有的书（网页每次抓到的字节可能不同，不能靠内容哈希去重） */
  async findByUrl(url) {
    if (!url) return null
    for (const row of await this.listBooks()) {
      const book = await readJson(join(this.bookDir(row.id), 'book.json'), null)
      if (book?.url && book.url === url) return book
    }
    return null
  }

  async book(id) {
    const book = await readJson(join(this.bookDir(id), 'book.json'), null)
    if (!book) throw Object.assign(new Error('book not found'), { code: 'E_NOT_FOUND' })
    return book
  }

  /** 读取书内图片；文件名必须是 [A-Za-z0-9._-]+，否则/不存在返回 null。 */
  async asset(id, file) {
    if (!/^[A-Za-z0-9._-]+$/.test(file) || /^\.+$/.test(file)) return null
    try {
      return await readFile(join(this.bookDir(id), 'assets', file))
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'EISDIR')) return null
      throw error
    }
  }

  async removeBook(id) {
    await rm(this.bookDir(id), { recursive: true, force: true })
  }

  // ── 译文 ──────────────────────────────────────────────
  async translations(id) {
    const t = await readJson(join(this.bookDir(id), 'trans.json'), null)
    return t ?? { paragraphs: {}, chapters: {}, intro: null, glossary: [] }
  }

  /**
   * 合并写入译文。patch 的各字段都是「增量」：paragraphs/chapters 按 id 合并，glossary 按 term 去重合并。
   */
  async mergeTranslations(id, patch) {
    return this.locked(`trans:${id}`, async () => {
      const current = await this.translations(id)
      const next = {
        paragraphs: { ...current.paragraphs, ...(patch.paragraphs ?? {}) },
        chapters: { ...current.chapters },
        intro: patch.intro === undefined ? current.intro : patch.intro,
        glossary: [...current.glossary],
        ...(current.title ? { title: current.title } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(current.bookRecall ? { bookRecall: current.bookRecall } : {}),
        ...(patch.bookRecall !== undefined ? { bookRecall: patch.bookRecall } : {}),
      }
      for (const [cid, value] of Object.entries(patch.chapters ?? {})) {
        next.chapters[cid] = { ...(current.chapters[cid] ?? {}), ...value }
      }
      for (const entry of patch.glossary ?? []) {
        if (!entry || typeof entry.term !== 'string' || typeof entry.zh !== 'string') continue
        const term = entry.term.trim()
        const zh = entry.zh.trim()
        if (!term || !zh) continue
        const index = next.glossary.findIndex(g => g.term.toLowerCase() === term.toLowerCase())
        if (index >= 0) next.glossary[index] = { ...next.glossary[index], ...entry, term, zh }
        else next.glossary.push({ term, zh, ...(entry.note ? { note: entry.note } : {}), ...(entry.by ? { by: entry.by } : {}) })
      }
      if (patch.removeParagraphs) {
        for (const pid of patch.removeParagraphs) delete next.paragraphs[pid]
      }
      if (patch.removeGlossary) {
        const gone = new Set(patch.removeGlossary)
        next.glossary = next.glossary.filter(g => !gone.has(g.term))
      }
      await writeJsonAtomic(join(this.bookDir(id), 'trans.json'), next)
      return next
    })
  }

  // ── 阅读状态 ──────────────────────────────────────────
  async state(id) {
    return readJson(join(this.bookDir(id), 'state.json'), null)
  }

  /** progress（0–1）是这一章读到的比例，只往大里记：state.reach[cid] = 这一章读到过的最远处 */
  async saveState(id, { progress, ...state }) {
    return this.locked(`state:${id}`, async () => {
      const current = (await this.state(id)) ?? {}
      const next = { ...current, ...state, updatedAt: new Date().toISOString() }
      const p = Number(progress)
      if (state.chapterId && Number.isFinite(p)) {
        const value = Math.round(Math.max(0, Math.min(1, p)) * 1000) / 1000
        if (value > (current.reach?.[state.chapterId] ?? 0)) next.reach = { ...(current.reach ?? {}), [state.chapterId]: value }
      }
      await writeJsonAtomic(join(this.bookDir(id), 'state.json'), next)
      return next
    })
  }

  // ── 按书设置（译风、附加要求）──────────────────────────
  async bookSettings(id) {
    return readJson(join(this.bookDir(id), 'settings.json'), { style: '', instruction: '' })
  }

  async saveBookSettings(id, patch) {
    return this.locked(`bsettings:${id}`, async () => {
      const next = { ...(await this.bookSettings(id)), ...patch }
      await writeJsonAtomic(join(this.bookDir(id), 'settings.json'), next)
      return next
    })
  }

  // ── 阅读份：state.json 里的 sessions 数组 ───────────────
  async saveSessions(id, sessions) {
    return this.locked(`state:${id}`, async () => {
      const state = (await this.state(id)) ?? {}
      const next = { ...state, sessions, updatedAt: state.updatedAt ?? new Date().toISOString() }
      await writeJsonAtomic(join(this.bookDir(id), 'state.json'), next)
      return next
    })
  }

  // ── 划线与笔记（段落粒度）────────────────────────────
  async marks(id) {
    return readJson(join(this.bookDir(id), 'marks.json'), {})
  }

  async setMark(id, paraId, patch) {
    return this.locked(`marks:${id}`, async () => {
      const marks = await this.marks(id)
      const current = marks[paraId] ?? {}
      const { addRange, removeRange, ...rest } = patch
      const next = { ...current, ...rest, at: new Date().toISOString() }
      let ranges = Array.isArray(current.ranges) ? [...current.ranges] : []
      if (typeof addRange === 'string' && addRange.trim() && !ranges.includes(addRange.trim())) ranges.push(addRange.trim())
      if (typeof removeRange === 'string') ranges = ranges.filter(r => r !== removeRange)
      if (ranges.length) next.ranges = ranges; else delete next.ranges
      if (!next.bookmark) delete next.bookmark
      if (!next.highlight && !next.ranges && !next.bookmark && !(typeof next.note === 'string' && next.note.trim())) delete marks[paraId]
      else marks[paraId] = next
      await writeJsonAtomic(join(this.bookDir(id), 'marks.json'), marks)
      return marks
    })
  }

  // ── 阅读统计：state.stats.days[date] = { seconds, paragraphs } ──
  async addStats(id, { date, seconds = 0, paragraphs = 0 }) {
    return this.locked(`state:${id}`, async () => {
      const state = (await this.state(id)) ?? {}
      const days = { ...(state.stats?.days ?? {}) }
      const day = days[date] ?? { seconds: 0, paragraphs: 0 }
      days[date] = { seconds: day.seconds + Math.max(0, Math.min(600, Math.round(seconds))), paragraphs: day.paragraphs + Math.max(0, Math.round(paragraphs)) }
      const next = { ...state, stats: { days }, updatedAt: state.updatedAt ?? new Date().toISOString() }
      await writeJsonAtomic(join(this.bookDir(id), 'state.json'), next)
      return summarizeStats(next.stats)
    })
  }

  // ── 追问：asks.json 是数组，新的在后 ───────────────────
  async asks(id) {
    const list = await readJson(join(this.bookDir(id), 'asks.json'), [])
    return Array.isArray(list) ? list : []
  }

  async addAsk(id, entry) {
    return this.locked(`asks:${id}`, async () => {
      const list = await this.asks(id)
      const item = { id: createHash('sha256').update(`${Date.now()}:${Math.random()}:${entry.paraId}`).digest('hex').slice(0, 10), at: new Date().toISOString(), ...entry }
      list.push(item)
      while (list.length > 5000) list.shift()
      await writeJsonAtomic(join(this.bookDir(id), 'asks.json'), list)
      return item
    })
  }

  async removeAsk(id, askId) {
    return this.locked(`asks:${id}`, async () => {
      const list = (await this.asks(id)).filter(a => a.id !== askId)
      await writeJsonAtomic(join(this.bookDir(id), 'asks.json'), list)
      return list
    })
  }

  /** 导出目录：<root>/exports/<书名>/ */
  async exportDir(title) {
    const dir = join(this.root, 'exports', title)
    await mkdir(dir, { recursive: true })
    return dir
  }

  async sourcePath(id) {
    const dir = this.bookDir(id)
    const names = await readdir(dir)
    const name = names.find(n => n.startsWith('source.'))
    if (!name) return null
    const path = join(dir, name)
    const info = await stat(path)
    return { path, size: info.size }
  }
}
