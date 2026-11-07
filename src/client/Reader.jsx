import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, API_BASE } from './api.js'
import { askAgent } from './host.js'

const DISPLAY_LABEL = { zh: '译文', bilingual: '双语', original: '原文' }
const DISPLAY_ORDER = ['zh', 'bilingual', 'original']
const ASK_LABEL = { explain: '解释', intent: '这段在说什么', custom: '追问' }
/** 阅读时长估计：译文按 400 字/分钟；没译的段按原文字数折算（英文 → 中文约 0.3 倍） */
const ZH_PER_MINUTE = 400

function statusText(status, unfinished) {
  if (!status) return ''
  const n = (status.queued ?? 0) + (status.running ?? 0)
  if (n > 0) return `后台翻译中：还有 ${n} 段`
  // 重试成功后旧错误仍留在队列记录里：本章已经译完就不再提
  if (unfinished && status.errors && status.errors.length > 0) return `翻译出错：${status.errors[0].message}`
  return ''
}

function readingChars(p) {
  if (p.kind === 'img') return 0
  return p.zh ? p.zh.length : Math.round(p.text.length * 0.3)
}

function minutesOf(paragraphs) {
  const chars = paragraphs.reduce((n, p) => n + readingChars(p), 0)
  return Math.max(1, Math.round(chars / ZH_PER_MINUTE))
}

export function Reader({ bookId, settings, onBack, onSettings, onDisplayChange }) {
  const [book, setBook] = useState(null)
  const [chapter, setChapter] = useState(null)
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState('')
  const [status, setStatus] = useState(null)
  const [session, setSession] = useState(null)
  const [recalling, setRecalling] = useState(false)
  const [marks, setMarks] = useState({})
  const [asks, setAsks] = useState([])
  const [stats, setStats] = useState(null)
  const seenParas = useRef(new Set())
  const scrollRef = useRef(null)
  const pendingScroll = useRef(null)
  const stateTimer = useRef(null)
  const lastSaved = useRef('')
  const progressRef = useRef(null)
  const currentPara = useRef(null)
  const [reading, setReading] = useState(null) // 正在朗读的段落 id
  const speech = useRef({ token: 0 })
  const display = settings.display ?? 'zh'

  const loadBook = useCallback(async () => {
    const info = await api.book(bookId)
    setBook(info)
    setStatus(info.status)
    setMarks(info.marks ?? {})
    setAsks(info.asks ?? [])
    setStats(info.stats ?? null)
    return info
  }, [bookId])

  const loadChapter = useCallback(async (cid, paraId) => {
    const data = await api.chapter(bookId, cid)
    setChapter(data)
    setStatus(data.status)
    if (paraId !== undefined) pendingScroll.current = paraId
    return data
  }, [bookId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const info = await loadBook()
        if (cancelled) return
        const cid = info.state?.chapterId && info.chapters.some(c => c.id === info.state.chapterId)
          ? info.state.chapterId
          : (info.startChapterId ?? info.chapters[0]?.id)
        if (!cid) { setError('这本书没有可读的章节'); return }
        await loadChapter(cid, info.state?.chapterId === cid ? info.state.paraId ?? null : null)
        api.saveState(bookId, { chapterId: cid, paraId: info.state?.paraId }).then(r => setStatus(r.status)).catch(() => {})
        api.session(bookId).then(setSession).catch(() => {})
      } catch (e) { if (!cancelled) setError(e.message) }
    })()
    return () => { cancelled = true }
  }, [bookId, loadBook, loadChapter])

  // 章节切换后滚到记忆位置
  useEffect(() => {
    if (!chapter) return
    const target = pendingScroll.current
    pendingScroll.current = null
    const root = scrollRef.current
    if (!root) return
    if (target) {
      const el = root.querySelector(`[data-para="${target}"]`)
      if (el) { el.scrollIntoView({ block: 'start' }); return }
    }
    root.scrollTop = 0
    progressRef.current?.(0)
  }, [chapter?.id])

  // 翻译没完成时轮询本章
  const unfinished = useMemo(() => chapter ? chapter.paragraphs.some(p => p.kind !== 'img' && !p.zh) : false, [chapter])
  const busy = status ? (status.queued ?? 0) + (status.running ?? 0) > 0 : false
  useEffect(() => {
    if (!chapter || !(busy || unfinished)) return
    const timer = setInterval(async () => {
      try {
        const data = await api.chapter(bookId, chapter.id)
        setChapter(prev => (prev && prev.id === data.id ? data : prev))
        setStatus(data.status)
        if (!data.paragraphs.some(p => p.kind !== 'img' && !p.zh) && (data.status.queued + data.status.running) === 0) {
          loadBook().catch(() => {})
        }
      } catch { /* 下次再试 */ }
    }, 4000)
    return () => clearInterval(timer)
  }, [bookId, chapter?.id, busy, unfinished, loadBook])

  // 阅读位置：视口最上面的段落
  const onScroll = useCallback(() => {
    const root = scrollRef.current
    if (!root || !chapter) return
    const top = root.getBoundingClientRect().top + 8
    const nodes = root.querySelectorAll('[data-para]')
    let current = null
    let index = 0
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].getBoundingClientRect().bottom >= top) { current = nodes[i].dataset.para; index = i; break }
    }
    if (!current) return
    currentPara.current = current
    const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 4
    progressRef.current?.(atEnd ? nodes.length : index)
    seenParas.current.add(current)
    const key = `${chapter.id}:${current}`
    if (key === lastSaved.current) return
    clearTimeout(stateTimer.current)
    stateTimer.current = setTimeout(() => {
      lastSaved.current = key
      api.saveState(bookId, { chapterId: chapter.id, paraId: current }).then(r => setStatus(r.status)).catch(() => {})
    }, 1200)
  }, [bookId, chapter])

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' && chapter?.next) goChapter(chapter.next)
      else if (e.key === 'ArrowLeft' && chapter?.prev) goChapter(chapter.prev)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const paragraphs = seenParas.current.size
      seenParas.current = new Set()
      api.stats(bookId, { seconds: 60, paragraphs }).then(setStats).catch(() => {})
    }, 60000)
    return () => clearInterval(timer)
  }, [bookId])

  // 朗读：用浏览器/系统的语音合成读译文（原文模式读原文），逐段推进并跟随滚动
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
  const stopReading = useCallback(() => {
    speech.current.token += 1
    try { window.speechSynthesis?.cancel() } catch { /* 忽略 */ }
    setReading(null)
  }, [])
  useEffect(() => stopReading, [chapter?.id, stopReading])
  const pickVoice = async (lang) => {
    const synth = window.speechSynthesis
    let voices = synth.getVoices()
    if (voices.length === 0) {
      await new Promise(resolve => { const t = setTimeout(resolve, 800); synth.addEventListener('voiceschanged', () => { clearTimeout(t); resolve() }, { once: true }) })
      voices = synth.getVoices()
    }
    const want = lang.toLowerCase()
    const match = v => v.lang && v.lang.toLowerCase().replace('_', '-')
    return voices.find(v => match(v) === want) || voices.find(v => match(v)?.startsWith(want.split('-')[0])) || null
  }
  const startReading = async (fromParaId) => {
    if (!chapter) return
    if (!canSpeak) { setError('这个宿主没有语音合成，没法朗读'); return }
    stopReading()
    const token = speech.current.token
    const synth = window.speechSynthesis
    const useSrc = display === 'original'
    const list = chapter.paragraphs.filter(p => p.kind !== 'img' && (useSrc ? p.text : p.zh))
    if (list.length === 0) { setError('这一章还没有可读的译文'); return }
    let i = Math.max(0, list.findIndex(p => p.id === (fromParaId ?? currentPara.current)))
    const lang = useSrc ? (book?.language || 'en') : 'zh-CN'
    const voice = await pickVoice(lang)
    if (!voice) { setError(`系统里没有${useSrc ? '原文语言' : '中文'}语音，没法朗读`); return }
    if (speech.current.token !== token) return
    const rate = Math.min(2, Math.max(0.5, Number(settings.speechRate) || 1))
    const speakNext = () => {
      if (speech.current.token !== token) return
      if (i >= list.length) { setReading(null); return }
      const p = list[i++]
      const text = (useSrc ? p.text : p.zh).replace(/\|/g, '，').replace(/-{3,}/g, ' ')
      const u = new window.SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice.lang
      u.rate = rate
      u.onend = () => speakNext()
      u.onerror = (e) => { if (speech.current.token !== token) return; if (e.error !== 'interrupted' && e.error !== 'canceled') { setError(`朗读失败：${e.error}`); setReading(null) } }
      setReading(p.id)
      const el = scrollRef.current?.querySelector(`[data-para="${p.id}"]`)
      const root = scrollRef.current
      if (el && root) {
        const r = el.getBoundingClientRect(); const rr = root.getBoundingClientRect()
        if (r.top < rr.top || r.bottom > rr.bottom) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      synth.speak(u)
    }
    speakNext()
  }

  const setMark = async (paraId, patch) => {
    try { setMarks(await api.setMark(bookId, paraId, patch)) } catch (e) { setError(e.message) }
  }
  const asksBy = useMemo(() => {
    const m = {}
    for (const a of asks) { (m[a.paraId] ??= []).push(a) }
    return m
  }, [asks])
  const doAsk = async (paraId, input) => {
    const item = await api.ask(bookId, { paraId, ...input })
    setAsks(prev => [...prev, item])
    return item
  }
  const removeAsk = async (askId) => {
    try { setAsks(await api.removeAsk(bookId, askId)) } catch (e) { setError(e.message) }
  }

  const extendSession = async () => {
    try { setSession(await api.session(bookId, true)); const data = await api.chapter(bookId, chapter.id); setChapter(data); setStatus(data.status) } catch (e) { setError(e.message) }
  }
  const [recallingBook, setRecallingBook] = useState(false)
  const doRecallBook = async () => {
    setRecallingBook(true)
    try { const bookRecall = await api.recallBook(bookId); setBook(b => b ? { ...b, bookRecall } : b) } catch (e) { setError(e.message) } finally { setRecallingBook(false) }
  }
  const doRecall = async () => {
    setRecalling(true)
    try { const recall = await api.recall(bookId); setSession(s => s ? { ...s, recall } : s) } catch (e) { setError(e.message) } finally { setRecalling(false) }
  }

  const goChapter = async (cid, paraId = null) => {
    if (!cid) return
    setDrawer('')
    try {
      if (chapter && chapter.id === cid && paraId) {
        const el = scrollRef.current?.querySelector(`[data-para="${paraId}"]`)
        if (el) { el.scrollIntoView({ block: 'start' }); return }
      }
      await loadChapter(cid, paraId)
      lastSaved.current = `${cid}:${paraId ?? ''}`
      const r = await api.saveState(bookId, { chapterId: cid, paraId })
      setStatus(r.status)
    } catch (e) { setError(e.message) }
  }

  const translateChapter = async () => {
    if (!chapter) return
    try { const r = await api.translate(bookId, { chapterId: chapter.id }); setStatus(r.status) } catch (e) { setError(e.message) }
  }

  const cycleDisplay = () => {
    const next = DISPLAY_ORDER[(DISPLAY_ORDER.indexOf(display) + 1) % DISPLAY_ORDER.length]
    onDisplayChange(next)
  }

  const chapterMeta = book && chapter ? book.chapters.find(c => c.id === chapter.id) : null
  const chapterMinutes = chapter ? minutesOf(chapter.paragraphs) : 0

  return (
    <div className="ir-root-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      <div className="ir-bar">
        <button className="ir-plain" onClick={onBack}>‹ 书架</button>
        <div className="ir-title">{book ? book.title : '…'}{chapter ? <small>{chapter.title}</small> : null}</div>
        <div className="ir-right">
          {session ? <span className="ir-status" title="今日份：按设置的阅读时长切出的这一段">第 {session.day} 天 · 全书 {Math.round(100 * session.position / Math.max(1, session.total))}%</span> : null}
          <span className={`ir-status${busy ? ' ir-busy' : ''}`} title={statusText(status, unfinished)}>{statusText(status, unfinished)}</span>
          {canSpeak ? <button className={`ir-plain${reading ? ' ir-reading-on' : ''}`} onClick={() => reading ? stopReading() : startReading()} title={reading ? '停止朗读' : '从当前位置朗读译文（原文模式读原文）'}>{reading ? '停止' : '朗读'}</button> : null}
          <button className="ir-plain" onClick={cycleDisplay} title="切换显示：译文 / 双语 / 原文">{DISPLAY_LABEL[display]}</button>
          <button className="ir-plain" onClick={() => setDrawer(drawer === 'toc' ? '' : 'toc')}>目录</button>
          <button className="ir-plain" onClick={onSettings}>设置</button>
        </div>
      </div>
      {chapter ? <ProgressLine key={chapter.id} total={chapter.paragraphs.length} register={fn => { progressRef.current = fn }} /> : null}
      {error ? <div className="ir-error">{error} <button className="ir-link" onClick={() => setError('')}>关闭</button></div> : null}
      <div className="ir-scroll" ref={scrollRef} onScroll={onScroll}>
        {chapter ? (
          <div className="ir-page" style={{ fontSize: `${settings.fontSize || 18}px`, lineHeight: settings.lineHeight || 1.9 }}>
            <h1 className="ir-chapter-title">{chapter.title}</h1>
            <div className="ir-chapter-sub">
              <span>{chapter.index + 1} / {book?.chapters.length ?? '?'}</span>
              <span>约 {chapterMinutes} 分钟</span>
              <span>{chapterMeta ? `${chapterMeta.translated}/${chapterMeta.translatable ?? chapterMeta.paragraphs} 段已译` : ''}</span>
              {unfinished && !busy ? <button className="ir-link" onClick={translateChapter}>译这一章</button> : null}
              {busy ? <button className="ir-link" onClick={() => api.cancel(bookId).then(() => api.status(bookId)).then(setStatus).catch(() => {})}>停止</button> : null}
            </div>
            {chapter.index === 0 && book?.intro ? <div className="ir-intro"><b>导读</b><p>{book.intro}</p></div> : null}
            {chapter.intro ? <div className="ir-intro"><b>本章导读</b><p>{chapter.intro}</p></div> : null}
            {chapter.paragraphs.map(p => (
              <React.Fragment key={p.id}>
                <Paragraph
                  p={p} display={display} bookId={bookId} book={book} chapter={chapter}
                  mark={marks[p.id]} asks={asksBy[p.id]} reading={reading === p.id} onRead={canSpeak ? () => startReading(p.id) : null}
                  onMark={patch => setMark(p.id, patch)}
                  onAsk={input => doAsk(p.id, input)}
                  onRemoveAsk={removeAsk}
                  onUpdated={(zh, note) => setChapter(prev => prev ? { ...prev, paragraphs: prev.paragraphs.map(q => q.id === p.id ? { ...q, zh, note } : q) } : prev)}
                />
                {session && session.to === p.id ? <SessionCard session={session} stats={stats} recalling={recalling} onRecall={doRecall} onExtend={extendSession} /> : null}
              </React.Fragment>
            ))}
            {!chapter.next && book ? <FinishCard book={book} stats={stats} busy={recallingBook} onRecall={doRecallBook} onExport={() => setDrawer('toc:book')} /> : null}
            <div className="ir-chapter-nav">
              <button disabled={!chapter.prev} onClick={() => goChapter(chapter.prev)}>‹ {book?.chapters.find(c => c.id === chapter.prev)?.title ?? '上一章'}</button>
              <button disabled={!chapter.next} onClick={() => goChapter(chapter.next)}>{book?.chapters.find(c => c.id === chapter.next)?.title ?? '下一章'} ›</button>
            </div>
          </div>
        ) : <div className="ir-empty">{error ? '' : '打开中…'}</div>}
      </div>
      {drawer.startsWith('toc') && book ? (
        <TocDrawer
          key={drawer}
          initialTab={drawer === 'toc:book' ? 'book' : 'toc'}
          book={book} current={chapter?.id} marks={marks} asks={asks}
          onClose={() => setDrawer('')} onGo={goChapter} onBookChanged={loadBook}
          onRetranslateChapter={async () => { if (!chapter) return; try { const r = await api.translate(bookId, { chapterId: chapter.id, force: true }); setStatus(r.status); setDrawer('') } catch (e) { setError(e.message) } }}
        />
      ) : null}
    </div>
  )
}

/** 顶栏下的 2px 进度线：本章读到哪了。靠 register 回调从滚动事件直接更新，不让整章重渲染。 */
function ProgressLine({ total, register }) {
  const [index, setIndex] = useState(0)
  useEffect(() => { register(setIndex); return () => register(null) }, [register])
  const pct = total > 0 ? Math.min(100, Math.round(100 * index / total)) : 0
  return <div className="ir-progress-line" title={`本章 ${pct}%`}><i style={{ width: `${pct}%` }} /></div>
}

/** 最后一章末尾：读完全书之后做什么 */
function FinishCard({ book, stats, busy, onRecall, onExport }) {
  const r = book.bookRecall
  const done = book.chapters.every(c => c.translated >= (c.translatable ?? c.paragraphs))
  return (
    <div className="ir-session ir-finish">
      <div className="ir-session-head"><b>全书到此</b><span>{book.chapters.length} 章{stats && stats.minutes > 0 ? ` · 共读了 ${stats.minutes} 分钟，${stats.days} 天` : ''}{done ? '' : ' · 还有章节没译完'}</span></div>
      {r ? (
        <div className="ir-recall">
          <p><b>全书论证</b>{r.summary}</p>
          {r.threads?.length ? <div><b>贯穿的线索</b><ul>{r.threads.map((t, i) => <li key={i}>{t}</li>)}</ul></div> : null}
          {r.questions?.length ? <div><b>跨章回想</b><ol>{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div> : null}
          {r.next ? <p><b>接着读</b>{r.next}</p> : null}
        </div>
      ) : <p className="ir-hint">合上书，先自己把全书的论证顺一遍；再让模型按各章导读和你每一份的回想整理一版对照。</p>}
      <div className="ir-session-actions">
        <button className="ir-primary" onClick={onRecall} disabled={busy}>{busy ? '整理中…' : r ? '重新整理全书回想' : '回想全书'}</button>
        <button onClick={onExport}>导出划线与笔记</button>
      </div>
    </div>
  )
}

function SessionCard({ session, stats, recalling, onRecall, onExtend }) {
  const r = session.recall
  return (
    <div className="ir-session">
      <div className="ir-session-head"><b>今日份到此</b><span>第 {session.day} 天 · {session.paragraphs} 段{session.extended ? ` · 已加读 ${session.extended} 份` : ''}{stats ? ` · 今天 ${stats.today.minutes} 分钟 · 累计 ${stats.minutes} 分钟 · 连续 ${stats.streak} 天` : ''}</span></div>
      {r ? (
        <div className="ir-recall">
          <p><b>论证脉络</b>{r.summary}</p>
          {r.questions?.length ? <div><b>回想一下</b><ol>{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div> : null}
          {r.terms?.length ? <div><b>这一份的关键概念</b><ul>{r.terms.map((t, i) => <li key={i}><i>{t.zh || t.term}</i>{t.zh ? `（${t.term}）` : ''}{t.note ? `：${t.note}` : ''}</li>)}</ul></div> : null}
        </div>
      ) : <p className="ir-hint">读完先合上书回想一遍，再对照模型整理的论证脉络和问题。</p>}
      <div className="ir-session-actions">
        <button className="ir-primary" onClick={onRecall} disabled={recalling}>{recalling ? '整理中…' : r ? '重新整理回想' : '回想本次论证'}</button>
        <button onClick={onExtend}>再读一份</button>
      </div>
    </div>
  )
}

function mdRows(text) {
  const rows = []
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('|')) continue
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line)) continue
    rows.push(line.replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim()))
  }
  return rows
}

function TableView({ text, muted, header }) {
  const rows = mdRows(text)
  if (rows.length === 0) return <div className={muted ? 'ir-src' : ''}>{text}</div>
  return (
    <div className={`ir-table-wrap${muted ? ' ir-table-muted' : ''}`}>
      <table className="ir-table">
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => i === 0 && header ? <th key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function Footnote({ bookId, note }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const toggle = async () => {
    if (!open && !data && note.paraId) {
      try {
        const para = await api.paragraph(bookId, note.paraId)
        setData(para)
        if (!para.zh && para.kind !== 'img') {
          // 注释章通常还没译到：点开时单独译这一条
          api.retranslate(bookId, [note.paraId]).then(r => { const it = r.items?.[note.paraId]; if (it) setData(d => ({ ...(d ?? para), zh: it.zh })) }).catch(() => {})
        }
      } catch (e) { setData({ text: e.message }) }
    }
    setOpen(v => !v)
  }
  return (
    <>
      <button className="ir-fn" onClick={e => { e.stopPropagation(); toggle() }} title="脚注">[{note.marker}]</button>
      {open ? (
        <div className="ir-note ir-fn-body" onClick={e => e.stopPropagation()}>
          <b>注 {note.marker}</b>
          {note.paraId ? (data ? <span>{data.zh || data.text}{data.zh ? <span className="ir-fn-src">{data.text}</span> : <span className="ir-pending">译文生成中…</span>}</span> : '载入中…') : '这个脚注在书里找不到对应的注释'}
        </div>
      ) : null}
    </>
  )
}

/** 把译文按已划线的片段切开渲染；片段按首次出现位置匹配。 */
function Highlighted({ text, ranges, onRemove }) {
  if (!ranges || ranges.length === 0) return text
  const cuts = []
  for (const r of ranges) {
    const at = text.indexOf(r)
    if (at >= 0) cuts.push({ start: at, end: at + r.length, r })
  }
  cuts.sort((a, b) => a.start - b.start)
  const out = []
  let pos = 0
  for (const c of cuts) {
    if (c.start < pos) continue
    if (c.start > pos) out.push(text.slice(pos, c.start))
    out.push(<span key={c.start} className="ir-hl-range" title="点击取消这段划线" onClick={e => { e.stopPropagation(); onRemove(c.r) }}>{text.slice(c.start, c.end)}</span>)
    pos = c.end
  }
  if (pos < text.length) out.push(text.slice(pos))
  return out
}

/** 段落下方的追问记录 */
function AskList({ asks, asking, onRemove }) {
  if ((!asks || asks.length === 0) && !asking) return null
  return (
    <>
      {(asks ?? []).map(a => (
        <div key={a.id} className="ir-note ir-ask" onClick={e => e.stopPropagation()}>
          <b>{ASK_LABEL[a.kind] ?? '追问'}</b>
          {a.selection ? <i className="ir-ask-q">「{a.selection}」</i> : null}
          {a.kind === 'custom' && a.question ? <i className="ir-ask-q">{a.question}</i> : null}
          <span className="ir-ask-answer">{a.answer}</span>
          <button className="ir-link ir-ask-del" onClick={() => onRemove(a.id)}>删</button>
        </div>
      ))}
      {asking ? <div className="ir-note ir-ask" onClick={e => e.stopPropagation()}><b>{asking.label}</b>{asking.detail ? <i className="ir-ask-q">{asking.detail}</i> : null}<span className="ir-pending">思考中…</span></div> : null}
    </>
  )
}

function Paragraph({ p, display, bookId, book, chapter, mark, asks, reading, onRead, onMark, onUpdated, onAsk, onRemoveAsk }) {
  const hostRef = useRef(null)
  const [selection, setSelection] = useState(null) // {text, where: 'zh' | 'src', x, y}
  const [showSrc, setShowSrc] = useState(false)
  const [editNote, setEditNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(mark?.note ?? '')
  const [showNote, setShowNote] = useState(false)
  const [retrans, setRetrans] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [askSel, setAskSel] = useState('')
  const [askDraft, setAskDraft] = useState('')
  const [asking, setAsking] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const kindClass = `ir-para ir-${p.kind || 'p'}${selection ? ' ir-has-sel' : ''}${reading ? ' ir-reading' : ''}`
  const isHeading = p.kind === 'h1' || p.kind === 'h2' || p.kind === 'h3'
  const isTable = p.kind === 'table'

  // 选中译文或原文里的一段文字：弹出「划线 / 解释 / 追问」
  const onMouseUp = () => {
    const sel = window.getSelection()
    const text = sel ? sel.toString().trim() : ''
    if (!text || !sel || sel.rangeCount === 0 || text.length > 600) { setSelection(null); return }
    const where = p.zh && p.zh.includes(text) ? 'zh' : p.text.includes(text) ? 'src' : null
    if (!where) { setSelection(null); return }
    const host = hostRef.current?.getBoundingClientRect()
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!host) return
    setSelection({ text, where, x: Math.max(0, rect.left - host.left), y: rect.bottom - host.top + 4 })
  }
  const clearSelection = () => { setSelection(null); try { window.getSelection()?.removeAllRanges() } catch { /* 忽略 */ } }
  // 手机上长按选词没有 mouseup：touchend 之后等选区稳定再算
  const onTouchEnd = () => { setTimeout(onMouseUp, 350) }

  const runAsk = async ({ selection: sel = '', question = '', kind }) => {
    setErr('')
    setAsking({ label: ASK_LABEL[kind], detail: kind === 'explain' ? `「${sel}」` : kind === 'custom' ? question : '' })
    try { await onAsk({ selection: sel, question, kind }) } catch (e) { setErr(e.message) } finally { setAsking(null) }
  }
  const submitAsk = () => {
    const q = askDraft.trim()
    if (!q) return
    runAsk({ selection: askSel, question: q, kind: 'custom' })
    setAskOpen(false); setAskDraft(''); setAskSel('')
  }

  const doRetranslate = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api.retranslate(bookId, [p.id], instruction)
      const item = r.items?.[p.id]
      if (item) onUpdated(item.zh, item.note ?? null)
      setRetrans(false); setInstruction('')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (p.kind === 'img') {
    if (!p.file) return null
    return (
      <figure className="ir-figure" data-para={p.id}>
        <img src={`${API_BASE}/books/${bookId}/assets/${p.file}`} alt={p.text || ''} loading="lazy" />
        {p.text && !/^(image|img|figure|picture|photo|\d+)$/i.test(p.text.trim()) && !/\.(png|jpe?g|gif|webp|svg)$/i.test(p.text.trim()) ? <figcaption>{p.text}</figcaption> : null}
      </figure>
    )
  }
  const askInChat = async () => {
    const prompt = `我在读《${book?.title ?? ''}》${chapter?.title ? `的「${chapter.title}」` : ''}，有一段想请你帮我理解。\n\n原文：\n${p.text}\n\n${p.zh ? `现有译文：\n${p.zh}\n\n` : ''}请说明：作者这段想表达什么、它在上下文论证里的作用、涉及的历史或背景知识；如果译文有不准确或生硬的地方也指出来。`
    if (!askAgent(prompt)) {
      try { await navigator.clipboard.writeText(prompt); window.alert('这个宿主没法直接新建会话，问题已复制到剪贴板，去聊天框粘贴即可。') } catch { window.alert('这个宿主没法直接新建会话。') }
    }
  }

  const popover = selection ? (
    <span className="ir-sel-pop" style={{ left: selection.x, top: selection.y }} onMouseUp={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {selection.where === 'zh' && selection.text.length >= 2 ? <button onClick={() => { onMark({ addRange: selection.text }); clearSelection() }}>划线</button> : null}
      <button onClick={() => { const t = selection.text; clearSelection(); runAsk({ selection: t, kind: 'explain' }) }}>解释</button>
      <button onClick={() => { setAskSel(selection.text); setAskDraft(''); setAskOpen(true); clearSelection() }}>追问</button>
    </span>
  ) : null
  const askRow = askOpen ? (
    <div className="ir-retrans" onClick={e => e.stopPropagation()}>
      <input placeholder={askSel ? `关于「${askSel.slice(0, 24)}」想问什么…` : '对这一段想问什么…'} value={askDraft} onChange={e => setAskDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitAsk(); if (e.key === 'Escape') setAskOpen(false) }} autoFocus />
      <button onClick={submitAsk} disabled={!askDraft.trim()}>问</button>
      <button className="ir-plain" onClick={() => { setAskOpen(false); setAskSel('') }}>取消</button>
    </div>
  ) : null
  const askList = <AskList asks={asks} asking={asking} onRemove={onRemoveAsk} />

  if (display === 'original') {
    return (
      <div className={kindClass} data-para={p.id} ref={hostRef} onMouseUp={onMouseUp} onTouchEnd={onTouchEnd}>
        {popover}
        {isTable ? <TableView text={p.text} header={p.header} /> : <div className="ir-src">{p.text}{(p.notes ?? []).filter(n => n.paraId).map((n, i) => <Footnote key={i} bookId={bookId} note={n} />)}</div>}
        {askRow}
        {askList}
        {err ? <div className="ir-note"><b>错误</b>{err}</div> : null}
      </div>
    )
  }
  const srcVisible = display === 'bilingual' || showSrc || !p.zh
  return (
    <div className={kindClass} data-para={p.id} ref={hostRef} onMouseUp={onMouseUp} onTouchEnd={onTouchEnd}>
      {popover}
      {p.zh ? (
        <div className={`ir-zh${mark?.highlight ? ' ir-hl' : ''}`} onClick={() => { if (display === 'zh' && !selection) setShowSrc(v => !v) }}>
          {isTable ? <TableView text={p.zh} header={p.header} /> : <Highlighted text={p.zh} ranges={mark?.ranges} onRemove={r => onMark({ removeRange: r })} />}
          {p.note ? <span className="ir-note-mark" onClick={e => { e.stopPropagation(); setShowNote(v => !v) }}>注</span> : null}
          {(p.notes ?? []).filter(n => n.paraId).map((n, i) => <Footnote key={i} bookId={bookId} note={n} />)}
        </div>
      ) : null}
      {mark?.note && !editNote ? <div className="ir-note ir-usernote" onClick={() => setEditNote(true)}><b>笔记</b>{mark.note}</div> : null}
      {editNote ? (
        <div className="ir-retrans">
          <input placeholder="写一条笔记…" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onMark({ note: noteDraft }); setEditNote(false) } }} autoFocus />
          <button onClick={() => { onMark({ note: noteDraft }); setEditNote(false) }}>保存</button>
          <button className="ir-plain" onClick={() => setEditNote(false)}>取消</button>
        </div>
      ) : null}
      {srcVisible ? (isTable ? <div className="ir-src"><TableView text={p.text} muted header={p.header} />{!p.zh ? <span className="ir-pending">待译</span> : null}</div> : <div className="ir-src">{p.text}{!p.zh && !isHeading ? <span className="ir-pending">待译</span> : null}</div>) : null}
      {showNote && p.note ? <div className="ir-note"><b>译注</b>{p.note}</div> : null}
      {showSrc && display === 'zh' && p.zh ? (
        <div className="ir-para-tools">
          <button className="ir-link" onClick={() => runAsk({ kind: 'intent' })} disabled={Boolean(asking)}>这段在说什么</button>
          <button className="ir-link" onClick={() => { setAskSel(''); setAskOpen(v => !v) }}>追问</button>
          {onRead ? <button className="ir-link" onClick={e => { e.stopPropagation(); onRead() }}>从这段朗读</button> : null}
          <button className="ir-link" onClick={() => setRetrans(v => !v)}>重译</button>
          <button className="ir-link" onClick={() => onMark({ highlight: !mark?.highlight })}>{mark?.highlight ? '取消划线' : '划线'}</button>
          <button className="ir-link" onClick={() => { setNoteDraft(mark?.note ?? ''); setEditNote(true) }}>{mark?.note ? '改笔记' : '笔记'}</button>
          {p.note && !showNote ? <button className="ir-link" onClick={() => setShowNote(true)}>看译注</button> : null}
          <button className="ir-link" onClick={askInChat} title="把这段带着问题丢进 dsh 的新会话">开会话问</button>
        </div>
      ) : null}
      {askRow}
      {retrans ? (
        <div className="ir-retrans">
          <input placeholder="对这一段的要求，如：更口语、保留原文句式…" value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doRetranslate() }} disabled={busy} />
          <button onClick={doRetranslate} disabled={busy}>{busy ? '翻译中…' : '重译'}</button>
        </div>
      ) : null}
      {askList}
      {err ? <div className="ir-note"><b>错误</b>{err}</div> : null}
    </div>
  )
}

function BookTab({ book, chapterId, onRetranslateChapter }) {
  const [draft, setDraft] = useState({ style: '', instruction: '' })
  const [saved, setSaved] = useState('')
  const [exported, setExported] = useState(null)
  const [exporting, setExporting] = useState('')
  useEffect(() => { api.bookSettings(book.id).then(setDraft).catch(() => {}) }, [book.id])
  const save = async () => {
    try { setDraft(await api.saveBookSettings(book.id, draft)); setSaved('已保存，之后新译的段落按这个风格；已译的章节可点「重译本章」。') } catch (e) { setSaved(e.message) }
  }
  const doExport = async (kind, mode) => {
    setExporting(kind + mode); setExported(null)
    try { setExported(await api.exportBook(book.id, { kind, mode: mode ?? 'zh', ...(kind === 'chapter' ? { cid: chapterId } : {}) })) } catch (e) { setExported({ error: e.message }) } finally { setExporting('') }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(exported.markdown); setExported(x => ({ ...x, copied: true })) } catch { /* 忽略 */ }
  }
  return (
    <div className="ir-booktab">
      {book.url ? <p className="ir-hint">来源：<a href={book.url} target="_blank" rel="noreferrer">{book.url}</a></p> : null}
      <label>本书译文风格<span className="ir-hint">（留空用全局设置）</span></label>
      <textarea placeholder="例如：学术书，术语按国内通行译法，不加文学修饰 / 小说，保留口语和反讽" value={draft.style ?? ''} onChange={e => setDraft(d => ({ ...d, style: e.target.value }))} />
      <label>本书附加要求</label>
      <textarea placeholder="例如：人名保留英文；引用的书名用中文通行译名" value={draft.instruction ?? ''} onChange={e => setDraft(d => ({ ...d, instruction: e.target.value }))} />
      <div className="ir-session-actions">
        <button className="ir-primary" onClick={save}>保存</button>
        <button onClick={onRetranslateChapter}>按此重译当前章</button>
      </div>
      {saved ? <p className="ir-hint">{saved}</p> : null}
      <label style={{ marginTop: 18 }}>导出 Markdown</label>
      <div className="ir-session-actions" style={{ flexWrap: 'wrap', marginTop: 2 }}>
        <button onClick={() => doExport('notes')} disabled={Boolean(exporting)}>划线、笔记与追问</button>
        <button onClick={() => doExport('chapter', 'zh')} disabled={Boolean(exporting) || !chapterId}>本章译文</button>
        <button onClick={() => doExport('chapter', 'bilingual')} disabled={Boolean(exporting) || !chapterId}>本章双语</button>
        <button onClick={() => doExport('book', 'zh')} disabled={Boolean(exporting)}>全书已译部分</button>
      </div>
      {exporting ? <p className="ir-hint">导出中…</p> : null}
      {exported?.error ? <p className="ir-hint">{exported.error}</p> : null}
      {exported && !exported.error ? <p className="ir-hint">已写入 <code>{exported.path}</code>{exported.count ? `（${exported.count} 条）` : ''} <button className="ir-link" onClick={copy}>{exported.copied ? '已复制' : '复制内容'}</button></p> : null}
    </div>
  )
}

function SearchTab({ book, onGo }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!q.trim()) return
    setBusy(true)
    try { setHits(await api.search(book.id, q.trim())) } catch { setHits([]) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="ir-gloss">
        <input placeholder="搜原文或译文" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') run() }} style={{ flex: 1 }} autoFocus />
        <button onClick={run} disabled={busy}>{busy ? '…' : '搜索'}</button>
      </div>
      {hits && hits.length === 0 ? <div className="ir-block">没有找到。</div> : null}
      {hits && hits.length ? <div className="ir-block" style={{ padding: '4px 16px' }}>{hits.length} 处{hits.length >= 100 ? '（只显示前 100）' : ''}</div> : null}
      {(hits ?? []).map((h, i) => (
        <button key={i} className="ir-toc-item ir-hit" onClick={() => onGo(h.chapterId, h.paraId)}>
          <span className="ir-hit-body"><span className="ir-hit-ch">{h.chapterTitle}</span>{h.snippet}</span>
        </button>
      ))}
    </div>
  )
}

function MarksTab({ book, marks, onGo }) {
  const entries = Object.entries(marks ?? {}).sort((a, b) => (b[1].at ?? '').localeCompare(a[1].at ?? ''))
  if (entries.length === 0) return <div className="ir-block">还没有划线或笔记。选中译文里的一段文字就能划线；译文模式下点开一段，还有「划线」「笔记」。</div>
  const chapterOf = pid => book.chapters.find(c => pid.startsWith(c.id + 'p'))
  return (
    <div>
      {entries.map(([pid, m]) => {
        const ch = chapterOf(pid)
        return (
          <button key={pid} className="ir-toc-item ir-hit" onClick={() => onGo(ch?.id, pid)}>
            <span className="ir-hit-body"><span className="ir-hit-ch">{ch?.title ?? pid}{m.highlight ? ' · 整段划线' : ''}</span>{m.ranges?.length ? m.ranges.map((r, i) => <span key={i} className="ir-hit-range">{r}</span>) : null}{m.note ? m.note : (!m.ranges?.length ? '（划线）' : '')}</span>
          </button>
        )
      })}
    </div>
  )
}

function AsksTab({ book, asks, onGo }) {
  const list = [...(asks ?? [])].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  if (list.length === 0) return <div className="ir-block">还没有追问。选中一个词或一句话点「解释」，或点开一段用「这段在说什么」「追问」，答案都会记在这里。</div>
  const chapterOf = a => book.chapters.find(c => c.id === a.chapterId || a.paraId.startsWith(c.id + 'p'))
  return (
    <div>
      {list.map(a => {
        const ch = chapterOf(a)
        const head = a.selection ? `「${a.selection}」` : a.kind === 'custom' ? a.question : ASK_LABEL[a.kind]
        return (
          <button key={a.id} className="ir-toc-item ir-hit" onClick={() => onGo(ch?.id, a.paraId)}>
            <span className="ir-hit-body"><span className="ir-hit-ch">{ch?.title ?? a.paraId}</span><span className="ir-hit-range" style={{ textDecoration: 'none' }}>{head}</span>{String(a.answer ?? '').slice(0, 90)}{a.answer && a.answer.length > 90 ? '…' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

function TocDrawer({ book, current, marks, asks, initialTab, onClose, onGo, onBookChanged, onRetranslateChapter }) {
  const [tab, setTab] = useState(initialTab || 'toc')
  const [term, setTerm] = useState('')
  const [zh, setZh] = useState('')
  const [glossary, setGlossary] = useState(book.glossary ?? [])
  const listRef = useRef(null)
  useEffect(() => {
    const el = listRef.current?.querySelector('.ir-current')
    if (el) el.scrollIntoView({ block: 'center' })
  }, [])
  const addTerm = async () => {
    if (!term.trim() || !zh.trim()) return
    try { setGlossary(await api.glossary(book.id, { term: term.trim(), zh: zh.trim() })); setTerm(''); setZh(''); onBookChanged() } catch { /* 忽略 */ }
  }
  const removeTerm = async (t) => {
    try { setGlossary(await api.glossary(book.id, { remove: t })); onBookChanged() } catch { /* 忽略 */ }
  }
  return (
    <div className="ir-drawer">
      <div className="ir-bar">
        <div className="ir-title">{book.title}</div>
        <div className="ir-right"><button className="ir-plain" onClick={onClose}>关闭</button></div>
      </div>
      <div className="ir-tabs">
        <button className={tab === 'toc' ? 'ir-on' : ''} onClick={() => setTab('toc')}>目录</button>
        <button className={tab === 'intro' ? 'ir-on' : ''} onClick={() => setTab('intro')}>导读</button>
        <button className={tab === 'glossary' ? 'ir-on' : ''} onClick={() => setTab('glossary')}>术语 {glossary.length || ''}</button>
        <button className={tab === 'search' ? 'ir-on' : ''} onClick={() => setTab('search')}>搜索</button>
        <button className={tab === 'marks' ? 'ir-on' : ''} onClick={() => setTab('marks')}>划线 {Object.keys(marks ?? {}).length || ''}</button>
        <button className={tab === 'asks' ? 'ir-on' : ''} onClick={() => setTab('asks')}>追问 {(asks ?? []).length || ''}</button>
        <button className={tab === 'book' ? 'ir-on' : ''} onClick={() => setTab('book')}>本书</button>
      </div>
      <div className="ir-drawer-body" ref={listRef}>
        {tab === 'toc' ? book.chapters.map(c => (
          <button key={c.id} className={`ir-toc-item${c.id === current ? ' ir-current' : ''}`} onClick={() => onGo(c.id)}>
            <span className="ir-toc-title">{c.title}</span>
            <span className="ir-toc-count">{c.translated}/{c.translatable ?? c.paragraphs}</span>
          </button>
        )) : null}
        {tab === 'book' ? <BookTab book={book} chapterId={current} onRetranslateChapter={onRetranslateChapter} /> : null}
        {tab === 'search' ? <SearchTab book={book} onGo={onGo} /> : null}
        {tab === 'marks' ? <MarksTab book={book} marks={marks} onGo={onGo} /> : null}
        {tab === 'asks' ? <AsksTab book={book} asks={asks} onGo={onGo} /> : null}
        {tab === 'intro' ? (
          <div>
            <div className="ir-block">{book.intro || '导读还没生成。打开任一章节时会自动生成（需要在设置里开着「导读」）。'}</div>
            {book.bookRecall ? <div className="ir-block"><b style={{ color: 'var(--ir-fg)' }}>全书回想</b>{'\n'}{book.bookRecall.summary}{book.bookRecall.threads?.length ? '\n\n线索：\n' + book.bookRecall.threads.map(t => '· ' + t).join('\n') : ''}</div> : null}
          </div>
        ) : null}
        {tab === 'glossary' ? (
          <div>
            <div className="ir-gloss">
              <input placeholder="原文术语" value={term} onChange={e => setTerm(e.target.value)} style={{ flex: 1 }} />
              <input placeholder="固定译法" value={zh} onChange={e => setZh(e.target.value)} style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') addTerm() }} />
              <button onClick={addTerm}>固定</button>
            </div>
            {glossary.length === 0 ? <div className="ir-block">还没有术语。模型翻译时会自动提议，你也可以在这里固定译法。</div> : null}
            {glossary.map(g => (
              <div className="ir-gloss" key={g.term}>
                <span className="ir-term">{g.term}</span>
                <span className="ir-zh-term">{g.zh}</span>
                <button className="ir-plain" onClick={() => removeTerm(g.term)}>删</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
