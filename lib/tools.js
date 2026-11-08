/**
 * tools.js —— 给 agent 用的工具：让你在聊天里也能操作书架、看某段原文与译文、按要求重译。
 *
 * `@deepseek-ai/dsh-tools` 的 defineTool 来自宿主安装目录，不是本插件的依赖：
 * 先裸 import，失败再从 dsh 可执行文件的位置解析。都拿不到就不注册工具（阅读界面不受影响）。
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { linearize } from './translate.js'

async function loadDefineTool(logger) {
  try {
    const mod = await import('@deepseek-ai/dsh-tools')
    if (typeof mod.defineTool === 'function') return mod.defineTool
  } catch { /* 走下一条路 */ }
  try {
    const entry = process.argv[1]
    if (entry) {
      const require = createRequire(entry)
      const resolved = require.resolve('@deepseek-ai/dsh-tools')
      const mod = await import(pathToFileURL(resolved).href)
      if (typeof mod.defineTool === 'function') return mod.defineTool
    }
  } catch (error) {
    logger.warn(`[immersive-reader] 找不到 @deepseek-ai/dsh-tools，不注册 agent 工具：${error?.message ?? error}`)
  }
  return null
}

const text = value => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]

export function buildTools(defineTool, { store, translator, parseByFilename }) {
  return [
    defineTool({
      name: 'reader_books',
      description: '列出「阅读室」书架里的书：id、书名、作者、章数、已译段落数、阅读位置。',
      parameters: {},
      output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
      async execute() {
        const rows = await store.listBooks()
        if (rows.length === 0) return '书架是空的。可以用 reader_import 导入本地 EPUB/TXT/Markdown。'
        return rows.map(r => `${r.id}  《${r.title}》${r.author ? ` ${r.author}` : ''}  ${r.chapters} 章 / ${r.translated}/${r.paragraphs} 段已译${r.state?.chapterId ? `  读到 ${r.state.chapterId}${r.state.paraId ? ' ' + r.state.paraId : ''}` : ''}`).join('\n')
      },
    }),
    defineTool({
      name: 'reader_import',
      description: '把本机的一个 EPUB / TXT / Markdown 文件导入「阅读室」书架（绝对路径）。',
      parameters: { path: { type: 'string', required: true, description: '文件的绝对路径' } },
      output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
      async execute(args) {
        const { readFile } = await import('node:fs/promises')
        const { basename } = await import('node:path')
        const bytes = await readFile(args.path)
        const doc = await parseByFilename(bytes, basename(args.path))
        const book = await store.addBook(bytes, { filename: basename(args.path), doc })
        return `已导入《${book.title}》（id ${book.id}），${book.chapters.length} 章、${book.paragraphs} 段。在左侧栏「阅读室」里打开即可阅读；打开章节时会自动预译。`
      },
    }),
    defineTool({
      name: 'reader_passage',
      description: '读取某本书某一章的原文与现有译文（含译注），可限定段落范围。用于讨论原文、核对译法。',
      parameters: {
        bookId: { type: 'string', required: true },
        chapterId: { type: 'string', required: true, description: '如 c6' },
        from: { type: 'number', description: '起始段序号（1 起），默认 1' },
        count: { type: 'number', description: '段数，默认 20，最多 60' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
      async execute(args) {
        const book = await store.book(args.bookId)
        const chapter = book.chapters.find(c => c.id === args.chapterId)
        if (!chapter) return `没有章节 ${args.chapterId}。本书章节：${book.chapters.map(c => `${c.id} ${c.title}`).join('；')}`
        const trans = await store.translations(book.id)
        const from = Math.max(1, Number(args.from) || 1)
        const count = Math.min(60, Math.max(1, Number(args.count) || 20))
        const slice = chapter.paragraphs.slice(from - 1, from - 1 + count)
        const lines = [`《${book.title}》 ${chapter.title}（共 ${chapter.paragraphs.length} 段，显示第 ${from}–${from - 1 + slice.length} 段）`]
        for (const p of slice) {
          const t = trans.paragraphs[p.id]
          lines.push('', `[${p.id}] ${p.text}`, t ? `　译：${t.zh}${t.note ? `\n　注：${t.note}` : ''}` : '　译：（未译）')
        }
        return lines.join('\n')
      },
    }),
    defineTool({
      name: 'reader_retranslate',
      description: '按读者的要求重译指定段落（覆盖旧译文），返回新译文。适合读者说「这段译得生硬」「这里用更口语的说法」时。',
      parameters: {
        bookId: { type: 'string', required: true },
        paraIds: { type: 'array', items: { type: 'string' }, required: true, description: '段落 id，如 ["c6p12","c6p13"]，最多 30 个' },
        instruction: { type: 'string', description: '重译要求' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
      async execute(args) {
        const items = await translator.retranslate(args.bookId, args.paraIds.slice(0, 30), args.instruction ?? '')
        return Object.entries(items).map(([id, t]) => `[${id}] ${t.zh}${t.note ? `\n　注：${t.note}` : ''}`).join('\n\n') || '没有产生新译文'
      },
    }),
    defineTool({
      name: 'reader_glossary',
      description: '查看或固定某本书的术语译法。给 term 与 zh 则新增/覆盖；只给 bookId 则列出。',
      parameters: {
        bookId: { type: 'string', required: true },
        term: { type: 'string', description: '原文术语' },
        zh: { type: 'string', description: '固定译法' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
      async execute(args) {
        if (args.term && args.zh) {
          const glossary = (await store.mergeTranslations(args.bookId, { glossary: [{ term: args.term, zh: args.zh }] })).glossary
          return `已固定：${args.term} → ${args.zh}（术语表共 ${glossary.length} 条；之后新译的段落会沿用，已译段落需要重译才会更新）`
        }
        const trans = await store.translations(args.bookId)
        return trans.glossary.length ? trans.glossary.map(g => `${g.term} → ${g.zh}`).join('\n') : '术语表为空'
      },
    }),
    defineTool({
      name: 'reader_translate',
      description: '让「阅读室」后台预译某本书的某一章（或整本）。阅读界面打开章节时会自动预译，这个工具用于提前准备。',
      parameters: {
        bookId: { type: 'string', required: true },
        chapterId: { type: 'string', description: '要译的章；省略且 all 不为真时，按阅读位置与预译设置排队' },
        all: { type: 'boolean', description: '整本都译' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => text(v) },
      async execute(args) {
        let queued
        if (args.all) queued = await translator.translateAll(args.bookId)
        else if (args.chapterId) queued = await translator.translateChapter(args.bookId, args.chapterId)
        else queued = await translator.ensureLookahead(args.bookId, await store.state(args.bookId))
        const status = translator.status(args.bookId)
        return `已排入 ${queued} 段；当前队列 ${status.queued} 段，进行中 ${status.running} 段。`
      },
    }),
  ]
}

export async function registerTools(ctx, deps, logger) {
  const defineTool = await loadDefineTool(logger)
  if (!defineTool) return
  if (!linearize) return
  const tools = buildTools(defineTool, deps)
  for (const tool of tools) ctx.tools.register(tool)
  logger.info?.(`[immersive-reader] 注册了 ${tools.length} 个 agent 工具`)
}
