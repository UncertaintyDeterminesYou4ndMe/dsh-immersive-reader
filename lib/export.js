/**
 * export.js —— 导出 Markdown：划线/笔记/追问，或某章、全书的译文（可双语）。
 * 纯函数，不碰文件系统；routes 负责落盘到 <libraryDir>/exports/。
 */

function esc(s) {
  return String(s ?? '').replace(/\r?\n/g, ' ').trim()
}

function paraMarkdown(p, text) {
  if (!text) return ''
  if (p.kind === 'h1') return `## ${esc(text)}`
  if (p.kind === 'h2') return `### ${esc(text)}`
  if (p.kind === 'h3') return `#### ${esc(text)}`
  if (p.kind === 'table') return String(text).trim()
  if (p.kind === 'blockquote') return `> ${esc(text)}`
  if (p.kind === 'li') return `- ${esc(text)}`
  return esc(text)
}

function stamp(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function header(book, subtitle) {
  const lines = [`# 《${book.title}》${subtitle ? ' · ' + subtitle : ''}`, '']
  const meta = [book.author, book.url ? `来源 ${book.url}` : '', `导出于 ${stamp()}`, '由 dsh-reading-room（阅读室）生成'].filter(Boolean)
  lines.push(meta.join(' · '), '')
  return lines
}

/**
 * 划线、笔记、追问，按书的顺序汇总。
 * @param {object} book  BookDoc
 * @param {object} trans translations
 * @param {object} marks { [paraId]: {highlight, note, ranges} }
 * @param {Array} asks   [{paraId, selection, question, kind, answer}]
 */
export function notesMarkdown(book, trans, marks = {}, asks = []) {
  const asksBy = new Map()
  for (const a of asks) { if (!asksBy.has(a.paraId)) asksBy.set(a.paraId, []); asksBy.get(a.paraId).push(a) }
  const lines = header(book, '划线与笔记')
  let count = 0
  const askBlock = (a) => {
    const head = a.selection ? `「${esc(a.selection)}」` : (a.kind === 'intent' ? '这段在说什么' : '')
    const q = a.kind === 'custom' && a.question ? esc(a.question) : ''
    return ['', `**追问**${head}${q ? `：${q}` : ''}`, '', String(a.answer ?? '').trim()]
  }
  book.chapters.forEach((chapter, ci) => {
    const rows = []
    // 导读上的追问排在本章最前：全书导读显示在第一章顶部
    for (const [key, label] of [...(ci === 0 ? [['intro:book', '全书导读']] : []), [`intro:${chapter.id}`, '本章导读']]) {
      const qa = asksBy.get(key) ?? []
      if (qa.length === 0) continue
      const block = [`> **${label}**`]
      for (const a of qa) block.push(...askBlock(a))
      block.push('', `<sub>${chapter.title} · ${label}</sub>`)
      rows.push(block.join('\n'))
      count++
    }
    for (const p of chapter.paragraphs) {
      const raw = marks[p.id]
      const m = raw && (raw.highlight || raw.ranges?.length || raw.note) ? raw : null // 只有书签的段落不进笔记
      const qa = asksBy.get(p.id) ?? []
      if (!m && qa.length === 0) continue
      const zh = trans.paragraphs[p.id]?.zh ?? ''
      const block = []
      if (m?.ranges?.length) for (const r of m.ranges) block.push(`> ${esc(r)}`)
      else if (m?.highlight || (m?.note && !m?.ranges?.length) || (!m && qa.length)) block.push(`> ${esc(zh || p.text)}`)
      if (p.kind !== 'img') block.push(`> `, `> *${esc(p.text)}*`)
      if (m?.note) block.push('', `**笔记**：${esc(m.note)}`)
      for (const a of qa) block.push(...askBlock(a))
      block.push('', `<sub>${chapter.title} · ${p.id}</sub>`)
      rows.push(block.join('\n'))
      count++
    }
    if (rows.length) lines.push(`## ${esc(chapter.title)}`, '', rows.join('\n\n---\n\n'), '')
  })
  if (count === 0) lines.push('（还没有划线、笔记或追问）')
  return { markdown: lines.join('\n').trimEnd() + '\n', count }
}

/**
 * 一章或全书已译部分。mode: 'zh' | 'bilingual'
 * @param {object} book
 * @param {object} trans
 * @param {{ chapterId?: string, mode?: string }} options  不给 chapterId 就导出所有有译文的章
 */
export function textMarkdown(book, trans, { chapterId, mode = 'zh' } = {}) {
  const chapters = chapterId ? book.chapters.filter(c => c.id === chapterId) : book.chapters.filter(c => c.paragraphs.some(p => trans.paragraphs[p.id]))
  const lines = header(book, chapterId ? chapters[0]?.title : mode === 'bilingual' ? '双语' : '译文')
  if (!chapterId && trans.intro) lines.push('> **导读** ' + esc(trans.intro), '')
  let paragraphs = 0
  for (const chapter of chapters) {
    if (!chapterId) lines.push(`## ${esc(chapter.title)}`, '')
    const intro = trans.chapters[chapter.id]?.intro
    if (intro) lines.push('> **本章导读** ' + esc(intro), '')
    for (const p of chapter.paragraphs) {
      if (p.kind === 'img') continue
      const t = trans.paragraphs[p.id]
      const zh = t?.zh ?? ''
      if (!zh && mode === 'zh') continue
      if (zh) { lines.push(paraMarkdown(p, zh)); paragraphs++ }
      // 双语：原文紧跟在译文下一行（同一段落内软换行），表格另起一段
      if (mode === 'bilingual' || !zh) {
        if (p.kind === 'table' || !zh) { if (zh) lines.push(''); lines.push(p.kind === 'table' ? String(p.text).trim() : `*${esc(p.text)}*`) }
        else lines.push(`*${esc(p.text)}*`)
      }
      if (t?.note) lines.push('', `> 译注：${esc(t.note)}`)
      lines.push('')
    }
  }
  return { markdown: lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', paragraphs }
}

/** 文件名用：去掉路径分隔与控制字符，限长。 */
export function safeName(s, max = 60) {
  const cleaned = String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned || 'book'
  // 超长就在词边界截断（书名常带很长的副标题）
  const cut = cleaned.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return (at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s:·—-]+$/, '').trim() || 'book'
}
