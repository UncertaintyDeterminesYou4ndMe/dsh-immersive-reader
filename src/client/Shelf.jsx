import React, { useEffect, useRef, useState } from 'react'
import { api, API_BASE } from './api.js'

/** 全书阅读时长估计（分钟）：原文字数折成译文字数（英文约 0.3 倍，中文原文 1 倍），按 400 字/分钟。 */
function bookMinutes(book) {
  const zhLike = /^zh/i.test(book.language || '') || /[\u4e00-\u9fff]/.test(book.title || '')
  return Math.max(1, Math.round((book.chars || 0) * (zhLike ? 1 : 0.3) / 400))
}
function planText(book, sessionMinutes) {
  const minutes = bookMinutes(book)
  const left = Math.round(minutes * (1 - (book.paragraphs ? book.translated / book.paragraphs : 0)))
  const hours = minutes >= 90 ? `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} 小时` : `${minutes} 分钟`
  const per = Math.max(5, Number(sessionMinutes) || 30)
  const days = Math.max(1, Math.ceil(minutes / per))
  return `全书约 ${hours}，每天 ${per} 分钟约 ${days} 天${left > 0 && left < minutes ? `，按已译进度还剩约 ${Math.ceil(left / per)} 天` : ''}`
}

export function Shelf({ settings, onOpen, onSettings }) {
  const [books, setBooks] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [path, setPath] = useState('')
  const fileRef = useRef(null)

  const reload = async () => {
    try { setBooks(await api.books()); setError('') } catch (e) { setError(e.message) }
  }
  useEffect(() => { reload() }, [])

  const importFile = async (file) => {
    if (!file) return
    setBusy(`正在导入 ${file.name}…`)
    try {
      const book = await api.importFile(file)
      await reload()
      setBusy('')
      onOpen(book.id)
    } catch (e) { setError(e.message); setBusy('') }
  }
  const importPath = async () => {
    const p = path.trim()
    if (!p) return
    const isUrl = /^https?:\/\//i.test(p)
    setBusy(isUrl ? `正在抓取 ${p}…` : `正在导入 ${p}…`)
    try {
      const book = isUrl ? await api.importUrl(p) : await api.importPath(p)
      setPath('')
      await reload()
      setBusy('')
      onOpen(book.id)
    } catch (e) { setError(e.message); setBusy('') }
  }
  const remove = async (book) => {
    if (!window.confirm(`删除《${book.title}》及其全部译文？划线、笔记与追问会先导出一份 Markdown 留在书库 exports 目录。`)) return
    try { const r = await api.removeBook(book.id); await reload(); if (r?.kept) setBusy(`已删除；笔记备份在 ${r.kept}`) } catch (e) { setError(e.message) }
  }

  return (
    <>
    <div className="ir-dragband" data-window-drag="" />
    <div className="ir-scroll">
      <div className="ir-shelf">
        <h1>阅读室</h1>
        <p className="ir-lead">导入原版书或网页文章，按章节由模型精译，用母语读，点一下看原文；读不懂的地方选中就能追问。</p>
        <div className="ir-import">
          <button className="ir-primary" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>导入 EPUB / TXT / Markdown</button>
          <input ref={fileRef} type="file" accept=".epub,.txt,.md,.markdown" style={{ display: 'none' }} onChange={e => { importFile(e.target.files?.[0]); e.target.value = '' }} />
          <input type="text" placeholder="或填本机文件的绝对路径、网页链接" value={path} onChange={e => setPath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') importPath() }} />
          <button onClick={importPath} disabled={Boolean(busy) || !path.trim()}>{/^https?:\/\//i.test(path.trim()) ? '抓取网页' : '导入路径'}</button>
          <button className="ir-plain" onClick={onSettings}>设置</button>
        </div>
        {busy ? <p className="ir-hint">{busy}</p> : null}
        {error ? <p className="ir-error" style={{ padding: '8px 0' }}>{error}</p> : null}
        {books === null ? <p className="ir-empty">读取书架…</p> : null}
        {books && books.length === 0 ? <p className="ir-empty">书架还是空的。导入一本书试试，也可以在聊天里让 agent 调 reader_import。</p> : null}
        {books && books.map(book => (
          <div className="ir-book" key={book.id} onClick={() => onOpen(book.id)}>
            <div className="ir-cover">{book.coverFile ? <img src={`${API_BASE}/books/${book.id}/assets/${book.coverFile}`} alt="" /> : (book.title || '书').slice(0, 1)}</div>
            <div className="ir-book-main">
              <div className="ir-book-title">{book.title}</div>
              <div className="ir-book-meta">
                {book.author ? `${book.author} · ` : ''}{book.source === 'web' ? '网页 · ' : ''}{book.chapters} 章 · {book.paragraphs} 段 · 已译 {book.translated}
                {book.currentChapter ? ` · 读到「${book.currentChapter.slice(0, 24)}」` : ''}
                {book.stats && book.stats.minutes > 0 ? ` · 读了 ${book.stats.minutes} 分钟 / ${book.stats.days} 天${book.stats.streak > 1 ? `，连续 ${book.stats.streak} 天` : ''}` : ''}
              </div>
              <div className="ir-book-meta">{planText(book, settings?.sessionMinutes)}</div>
              <div className="ir-progress"><i style={{ width: `${book.paragraphs ? Math.round(100 * book.translated / book.paragraphs) : 0}%` }} /></div>
            </div>
            <div className="ir-book-actions" onClick={e => e.stopPropagation()}>
              <button className="ir-plain" onClick={() => remove(book)}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  )
}
