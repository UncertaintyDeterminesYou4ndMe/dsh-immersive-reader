import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api, API_BASE } from './api.js'
import { askAgent } from './host.js'

const DISPLAY_LABEL = { zh: '译文', bilingual: '双语', original: '原文' }
const DISPLAY_ORDER = ['zh', 'bilingual', 'original']
const ASK_LABEL = { explain: '解释', intent: '这段在说什么', custom: '追问' }
/** 阅读时长估计：译文按 400 字/分钟；没译的段按原文字数折算（英文 → 中文约 0.3 倍） */
const ZH_PER_MINUTE = 400
// 过渡时长，和样式里的 ir-drawer-in / ir-drawer-out / ir-fade 一致
const MOTION_MS = 160
const reduceMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

// 同章内跳到某段：远了先瞬移到目标前不到半屏，再用 240ms 滑完。浏览器自带的 smooth 按距离算时长，跳一整章要一秒多、整章从眼前刷过去
const glides = new WeakMap()
function glideTo(root, el) {
  cancelAnimationFrame(glides.get(root))
  const max = root.scrollHeight - root.clientHeight
  const target = Math.max(0, Math.min(max, root.scrollTop + el.getBoundingClientRect().top - root.getBoundingClientRect().top))
  if (reduceMotion()) { root.scrollTop = target; return }
  const lead = root.clientHeight * 0.4
  let from = root.scrollTop
  if (Math.abs(target - from) > lead) { from = target - Math.sign(target - from) * lead; root.scrollTop = from }
  const t0 = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 240)
    root.scrollTop = from + (target - from) * (1 - (1 - k) ** 3)
    if (k < 1) glides.set(root, requestAnimationFrame(step))
  }
  glides.set(root, requestAnimationFrame(step))
}

/** 书名、章名按阅读模式取：原文模式看原文，其余看目录译文（还没译出时退回原文）。 */
function tt(o, display) {
  return (display !== 'original' && o?.titleZh) || o?.title || ''
}

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
  const [drawer, setDrawerState] = useState('')
  // 开关目录的过渡：记下正文页原来的左边位置（并排时正文会让位），关的时候抽屉先留 160ms 滑出去
  const drawerRef = useRef('')
  const flipFrom = useRef(null)
  const drawerEnter = useRef(false)
  const leaveTimer = useRef(null)
  const [drawerLeaving, setDrawerLeaving] = useState('')
  const setDrawer = useCallback((v) => {
    const prev = drawerRef.current
    if (v === prev) return
    flipFrom.current = scrollRef.current?.querySelector('.ir-page')?.getBoundingClientRect().left ?? null
    drawerEnter.current = !prev
    clearTimeout(leaveTimer.current)
    if (!v && prev && !reduceMotion()) {
      setDrawerLeaving(prev)
      leaveTimer.current = setTimeout(() => setDrawerLeaving(''), MOTION_MS)
    } else setDrawerLeaving('')
    drawerRef.current = v
    setDrawerState(v)
  }, [])
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
  const tocRunning = useRef(false)
  const bookmarkRef = useRef(null) // 顶栏书签按钮：告诉它当前在哪一段，好显示实心/空心
  const [resume, setResume] = useState(null) // 打开书时的阅读位置，进度线上标「上次读到」
  const anchorRef = useRef(null) // 顶上那段和已经滚过它的比例：目录并排时正文变窄、重新换行，靠它停在原处
  const [liveReach, setLiveReach] = useState({}) // 这次打开后各章读到的比例，盖在 book.chapters[].read 上，目录里画进度

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
        if (info.state?.chapterId && info.state.paraId) setResume({ chapterId: info.state.chapterId, paraId: info.state.paraId })
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
    bookmarkRef.current?.(chapter.paragraphs[0]?.id ?? null)
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

  // 目录译完（status.toc 由真变假）就重取书，目录和标题换成中文
  const tocBusy = Boolean(status?.toc)
  useEffect(() => {
    if (tocRunning.current && !tocBusy) loadBook().catch(() => {})
    tocRunning.current = tocBusy
  }, [tocBusy, loadBook])

  // 阅读位置：视口最上面的段落
  // 视口最上面的段落：滚动时和加书签时都现量，不依赖滚动事件有没有来过
  const topParagraph = useCallback(() => {
    const root = scrollRef.current
    if (!root) return { current: null, index: 0, nodes: [] }
    const top = root.getBoundingClientRect().top + 8
    const nodes = root.querySelectorAll('[data-para]')
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].getBoundingClientRect().bottom >= top) return { current: nodes[i].dataset.para, index: i, nodes }
    }
    return { current: null, index: 0, nodes }
  }, [])

  const onScroll = useCallback(() => {
    const root = scrollRef.current
    if (!root || !chapter) return
    const { current, index, nodes } = topParagraph()
    if (!current) return
    currentPara.current = current
    { const r = nodes[index].getBoundingClientRect(); anchorRef.current = { id: current, frac: r.height ? (root.getBoundingClientRect().top + 8 - r.top) / r.height : 0 } }
    bookmarkRef.current?.(current)
    const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 4
    progressRef.current?.(atEnd ? nodes.length : index)
    seenParas.current.add(current)
    const progress = atEnd ? 1 : nodes.length ? index / nodes.length : 0
    const key = `${chapter.id}:${current}:${atEnd}`
    if (key === lastSaved.current) return
    clearTimeout(stateTimer.current)
    stateTimer.current = setTimeout(() => {
      lastSaved.current = key
      const cid = chapter.id
      setLiveReach(prev => (progress > (prev[cid] ?? 0) ? { ...prev, [cid]: progress } : prev))
      api.saveState(bookId, { chapterId: cid, paraId: current, progress }).then(r => setStatus(r.status)).catch(() => {})
    }, 1200)
  }, [bookId, chapter, topParagraph])

  useLayoutEffect(() => {
    const a = anchorRef.current
    const root = scrollRef.current
    if (!a || !root) return
    const el = root.querySelector(`[data-para="${a.id}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    root.scrollTop += r.top + a.frac * r.height - (root.getBoundingClientRect().top + 8)
  }, [drawer])

  // 正文让位：版面已经是新位置，先用 transform 拉回原处，再过渡到 0（只动位移，不逐帧重排文字）
  useLayoutEffect(() => {
    const from = flipFrom.current
    flipFrom.current = null
    const page = scrollRef.current?.querySelector('.ir-page')
    if (from == null || !page || reduceMotion()) return
    const dx = from - page.getBoundingClientRect().left
    if (Math.abs(dx) < 1) return
    page.style.transition = 'none'
    page.style.transform = `translateX(${dx}px)`
    page.getBoundingClientRect()
    page.style.transition = `transform ${MOTION_MS}ms cubic-bezier(.2, 0, 0, 1)`
    page.style.transform = ''
    const t = setTimeout(() => { page.style.transition = '' }, MOTION_MS + 40)
    return () => clearTimeout(t)
  }, [drawer])

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' && chapter?.next) goChapter(chapter.next)
      else if (e.key === 'ArrowLeft' && chapter?.prev) goChapter(chapter.prev)
      else if (e.key === 'b') toggleBookmark()
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
  // 书签：加在视口最上面那段；再按一次取消
  const toggleBookmark = () => {
    if (!chapter) return
    const pid = topParagraph().current ?? chapter.paragraphs[0]?.id
    if (!pid) return
    bookmarkRef.current?.(pid)
    setMark(pid, { bookmark: !marks[pid]?.bookmark })
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

  // 目录和正文并排时（宽度够，见样式里的 @container）跳章不关目录；盖在正文上时才关，不然看不到跳到的地方
  const rootRef = useRef(null)
  const goChapter = async (cid, paraId = null) => {
    if (!cid) return
    if ((rootRef.current?.getBoundingClientRect().width ?? 0) < 960) setDrawer('')
    try {
      if (chapter && chapter.id === cid && paraId) {
        const el = scrollRef.current?.querySelector(`[data-para="${paraId}"]`)
        if (el && scrollRef.current) { glideTo(scrollRef.current, el); return }
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
  // 进度线上的标记：一段一个，合并这段上的书签、划线、笔记、追问和上次读到
  const markers = useMemo(() => {
    if (!chapter) return []
    const out = []
    chapter.paragraphs.forEach((p, index) => {
      const m = marks[p.id]
      const kinds = []
      if (m?.bookmark) kinds.push('书签')
      if (resume?.chapterId === chapter.id && resume.paraId === p.id) kinds.push('上次读到')
      if (m?.highlight || m?.ranges?.length) kinds.push('划线')
      if (m?.note) kinds.push('笔记')
      if (asksBy[p.id]?.length) kinds.push('追问')
      if (!kinds.length) return
      const text = m?.ranges?.[0] ?? m?.note ?? asksBy[p.id]?.[0]?.selection ?? (display === 'original' ? p.text : p.zh || p.text) ?? ''
      out.push({ paraId: p.id, index, kinds, text: text.length > 60 ? text.slice(0, 60) + '…' : text })
    })
    return out
  }, [chapter, marks, asksBy, resume, display])
  const chapterMinutes = chapter ? minutesOf(chapter.paragraphs) : 0

  return (
    <div ref={rootRef} className={`ir-root-inner${drawer ? ' ir-has-drawer' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      <div className="ir-bar" data-window-drag="">
        <button className="ir-plain" onClick={onBack}>‹ 书架</button>
        <div className="ir-title" title={book ? book.title : ''}>{book ? tt(book, display) : '…'}{chapter ? <small>{tt(chapter, display)}</small> : null}</div>
        <div className="ir-right">
          {session ? <span className="ir-status" title="今日份：按设置的阅读时长切出的这一段">第 {session.day} 天 · 全书 {Math.round(100 * session.position / Math.max(1, session.total))}%</span> : null}
          <span className={`ir-status${busy ? ' ir-busy' : ''}`} title={statusText(status, unfinished)}>{statusText(status, unfinished)}</span>
          {canSpeak ? <button className={`ir-plain${reading ? ' ir-reading-on' : ''}`} onClick={() => reading ? stopReading() : startReading()} title={reading ? '停止朗读' : '从当前位置朗读译文（原文模式读原文）'}>{reading ? '停止' : '朗读'}</button> : null}
          <button className="ir-plain" onClick={cycleDisplay} title="切换显示：译文 / 双语 / 原文">{DISPLAY_LABEL[display]}</button>
          <BookmarkButton marks={marks} onToggle={toggleBookmark} register={fn => { bookmarkRef.current = fn }} />
          <button className="ir-plain" onClick={() => setDrawer(drawer === 'toc' ? '' : 'toc')}>目录</button>
          <button className="ir-plain" onClick={onSettings}>设置</button>
        </div>
      </div>
      {chapter ? <ProgressLine key={chapter.id} total={chapter.paragraphs.length} markers={markers} onJump={pid => goChapter(chapter.id, pid)} register={fn => { progressRef.current = fn }} /> : null}
      {error ? <div className="ir-error">{error} <button className="ir-link" onClick={() => setError('')}>关闭</button></div> : null}
      <div className="ir-scroll" ref={scrollRef} onScroll={onScroll}>
        {chapter ? (
          <div key={chapter.id} className="ir-page" style={{ fontSize: `${settings.fontSize || 18}px`, lineHeight: settings.lineHeight || 1.9 }}>
            <h1 className="ir-chapter-title">{tt(chapter, display)}</h1>
            {tt(chapter, display) !== chapter.title ? <div className="ir-chapter-orig">{chapter.title}</div> : null}
            <div className="ir-chapter-sub">
              <span>{chapter.index + 1} / {book?.chapters.length ?? '?'}</span>
              <span>约 {chapterMinutes} 分钟</span>
              <span>{chapterMeta ? `${chapterMeta.translated}/${chapterMeta.translatable ?? chapterMeta.paragraphs} 段已译` : ''}</span>
              {unfinished && !busy ? <button className="ir-link" onClick={translateChapter}>译这一章</button> : null}
              {busy ? <button className="ir-link" onClick={() => api.cancel(bookId).then(() => api.status(bookId)).then(setStatus).catch(() => {})}>停止</button> : null}
            </div>
            {chapter.index === 0 && book?.intro ? <IntroBlock label="导读" paraId="intro:book" text={book.intro} asks={asksBy['intro:book']} onAsk={input => doAsk('intro:book', input)} onRemoveAsk={removeAsk} /> : null}
            {chapter.intro ? <IntroBlock label="本章导读" paraId={`intro:${chapter.id}`} text={chapter.intro} asks={asksBy[`intro:${chapter.id}`]} onAsk={input => doAsk(`intro:${chapter.id}`, input)} onRemoveAsk={removeAsk} /> : null}
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
              <button disabled={!chapter.prev} onClick={() => goChapter(chapter.prev)}>‹ {tt(book?.chapters.find(c => c.id === chapter.prev), display) || '上一章'}</button>
              <button disabled={!chapter.next} onClick={() => goChapter(chapter.next)}>{tt(book?.chapters.find(c => c.id === chapter.next), display) || '下一章'} ›</button>
            </div>
          </div>
        ) : <div className="ir-empty">{error ? '' : '打开中…'}</div>}
      </div>
      {(drawer || drawerLeaving).startsWith('toc') && book ? (
        <TocDrawer
          key={drawer || drawerLeaving}
          motion={!drawer ? 'out' : drawerEnter.current ? 'in' : ''}
          initialTab={(drawer || drawerLeaving) === 'toc:book' ? 'book' : 'toc'}
          book={book} display={display} current={chapter?.id} marks={marks} asks={asks} liveReach={liveReach}
          onClose={() => setDrawer('')} onGo={goChapter} onBookChanged={loadBook}
          onRetranslateChapter={async () => { if (!chapter) return; try { const r = await api.translate(bookId, { chapterId: chapter.id, force: true }); setStatus(r.status); setDrawer('') } catch (e) { setError(e.message) } }}
        />
      ) : null}
    </div>
  )
}

/** 顶栏下的 2px 进度线：本章读到哪了。靠 register 回调从滚动事件直接更新，不让整章重渲染。 */
/** 顶栏书签按钮：当前段有书签时实心。当前段由滚动回调直接推过来，不让整章重渲染。 */
function BookmarkButton({ marks, onToggle, register }) {
  const [pid, setPid] = useState(null)
  useEffect(() => { register(setPid); return () => register(null) }, [register])
  const on = Boolean(pid && marks?.[pid]?.bookmark)
  return (
    <button className={`ir-plain ir-icon${on ? ' ir-on' : ''}`} onClick={onToggle} aria-pressed={on} aria-label={on ? '取消书签' : '加书签'} title={`${on ? '取消这里的书签' : '在当前位置加书签'}（快捷键 B）`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M7 3.5h10v17l-5-4.2-5 4.2z" />
      </svg>
    </button>
  )
}

function ProgressLine({ total, register, markers = [], onJump }) {
  const [index, setIndex] = useState(0)
  useEffect(() => { register(setIndex); return () => register(null) }, [register])
  const pct = total > 0 ? Math.min(100, Math.round(100 * index / total)) : 0
  return (
    <div className="ir-progress-line">
      <i style={{ width: `${pct}%` }} title={`本章 ${pct}%`} />
      {markers.map(mk => {
        const at = total > 0 ? (100 * mk.index) / total : 0
        const kind = mk.kinds.includes('书签') ? 'bookmark' : mk.kinds.includes('上次读到') ? 'resume' : 'note'
        const side = at < 20 ? 'ir-tip-l' : at > 80 ? 'ir-tip-r' : ''
        return (
          <button key={mk.paraId} className={`ir-mk ir-mk-${kind}`} style={{ left: `${at}%` }} onClick={() => onJump?.(mk.paraId)} aria-label={mk.kinds.join('、')}>
            <span className={`ir-mk-tip ${side}`}><b>{mk.kinds.join(' · ')}</b>{mk.text}</span>
          </button>
        )
      })}
    </div>
  )
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
/** 把追问按「选中的文字能否在 text 里找到」分成锚点组与段尾组 */
function splitAsks(text, asks) {
  const groups = new Map()
  const rest = []
  for (const a of asks ?? []) {
    if (text && a.selection && text.includes(a.selection)) {
      if (!groups.has(a.selection)) groups.set(a.selection, [])
      groups.get(a.selection).push(a)
    } else rest.push(a)
  }
  return { groups, rest }
}

/** 正文里的标注：划线片段与追问锚点（虚下划线，悬停或点击浮出答案） */
function Annotated({ text, ranges, onRemove, groups, ctl }) {
  const cuts = []
  for (const [sel, list] of groups ?? []) {
    const at = text.indexOf(sel)
    if (at >= 0) cuts.push({ start: at, end: at + sel.length, ids: list.map(a => a.id) })
  }
  for (const r of ranges ?? []) {
    const at = text.indexOf(r)
    if (at >= 0) cuts.push({ start: at, end: at + r.length, r })
  }
  if (cuts.length === 0) return text
  cuts.sort((a, b) => a.start - b.start || (a.ids ? -1 : 1))
  const out = []
  let pos = 0
  for (const c of cuts) {
    if (c.start < pos) continue
    if (c.start > pos) out.push(text.slice(pos, c.start))
    const piece = text.slice(c.start, c.end)
    if (c.ids) {
      const on = ctl.card && ctl.card.ids.join() === c.ids.join()
      out.push(<span key={c.start} className={`ir-ask-anchor${on ? ' ir-on' : ''}`} {...ctl.anchorProps(c.ids)}>{piece}</span>)
    } else {
      out.push(<span key={c.start} className="ir-hl-range" title="点击取消这段划线" onClick={e => { e.stopPropagation(); onRemove(c.r) }}>{piece}</span>)
    }
    pos = c.end
  }
  if (pos < text.length) out.push(text.slice(pos))
  return out
}

/** 追问答案卡：悬停锚点时浮出，点击锚点钉住；点外面或 Esc 关闭 */
function useAskCard(hostRef) {
  const [card, setCard] = useState(null) // {ids, x, y, w, pinned}
  const hideTimer = useRef(null)
  const cardRef = useRef(null)
  const show = (ids, el, pinned) => {
    clearTimeout(hideTimer.current)
    const host = hostRef.current?.getBoundingClientRect()
    if (!host || !el) return
    const r = el.getBoundingClientRect()
    const w = Math.min(480, host.width)
    // 卡片紧贴锚点下沿：中间不留缝，鼠标从锚点往下移进卡片时不会先触发隐藏
    setCard({ ids, pinned, w, x: Math.max(0, Math.min(r.left - host.left, host.width - w)), y: r.bottom - host.top })
  }
  const keep = () => clearTimeout(hideTimer.current)
  const hideSoon = () => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setCard(c => (c && !c.pinned ? null : c)), 300) }
  const anchorProps = (ids) => ({
    'data-ask': ids.join(' '),
    onMouseEnter: e => { if (!card?.pinned) show(ids, e.currentTarget, false) },
    onMouseLeave: hideSoon,
    onMouseUp: e => e.stopPropagation(),
    onClick: e => {
      e.stopPropagation()
      if (card?.pinned && card.ids.join() === ids.join()) setCard(null)
      else show(ids, e.currentTarget, true)
    },
  })
  const openFor = (id) => {
    const el = hostRef.current?.querySelector(`[data-ask~="${id}"]`)
    if (el) show(el.dataset.ask.split(' '), el, true)
  }
  useEffect(() => {
    if (!card?.pinned) return
    const onDown = e => {
      if (cardRef.current?.contains(e.target)) return
      if (hostRef.current?.contains(e.target) && e.target.closest?.('[data-ask]')) return
      setCard(null)
    }
    const onKey = e => { if (e.key === 'Escape') setCard(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [card?.pinned])
  // 从「追问」页签跳过来时打开对应的卡。阅读页会轮询重渲染，监听与计时器只在挂载 / 卸载时处理
  const openRef = useRef(openFor)
  openRef.current = openFor
  useEffect(() => {
    const onOpen = e => openRef.current(e.detail)
    window.addEventListener('ir-open-ask', onOpen)
    return () => { window.removeEventListener('ir-open-ask', onOpen); clearTimeout(hideTimer.current) }
  }, [])
  return { card, cardRef, anchorProps, openFor, keep, hideSoon }
}

function AskCard({ ctl, asks, onRemove }) {
  const { card } = ctl
  if (!card) return null
  const list = (asks ?? []).filter(a => card.ids.includes(a.id))
  if (list.length === 0) return null
  return (
    <div className="ir-ask-card" ref={ctl.cardRef} style={{ left: card.x, top: card.y, width: card.w }} onMouseEnter={ctl.keep} onMouseLeave={ctl.hideSoon} onClick={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
      {list.map(a => (
        <div key={a.id} className="ir-ask ir-ask-item">
          <b>{ASK_LABEL[a.kind] ?? '追问'}</b>
          {a.selection ? <i className="ir-ask-q">「{a.selection}」</i> : null}
          {a.kind === 'custom' && a.question ? <i className="ir-ask-q">{a.question}</i> : null}
          <span className="ir-ask-answer">{a.answer}</span>
          <button className="ir-link ir-ask-del" onClick={() => onRemove(a.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}

/** 段尾的「问」：没有锚点的追问（整段提问、选中的字不在当前显示的文字里） */
function AskMark({ asks, ctl }) {
  if (!asks || asks.length === 0) return null
  const ids = asks.map(a => a.id)
  const on = ctl.card && ctl.card.ids.join() === ids.join()
  return <span className={`ir-ask-mark${on ? ' ir-on' : ''}`} title="追问" {...ctl.anchorProps(ids)}>问{asks.length > 1 ? asks.length : ''}</span>
}

/** 正在问的那一条：答案回来后收进锚点 */
function AskPending({ asking }) {
  if (!asking) return null
  return <div className="ir-note ir-ask" onClick={e => e.stopPropagation()}><b>{asking.label}</b>{asking.detail ? <i className="ir-ask-q">{asking.detail}</i> : null}<span className="ir-pending">思考中…</span></div>
}

/** 选区里的纯文字：去掉「问」「注」、脚注编号这些装饰，免得和段落原文对不上 */
function selectedText(host) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return ''
  const range = sel.getRangeAt(0)
  if (host && !range.intersectsNode(host)) return ''
  const frag = range.cloneContents()
  frag.querySelectorAll('.ir-ask-mark, .ir-note-mark, .ir-fn, .ir-sel-pop, .ir-ctx, button').forEach(n => n.remove())
  return (frag.textContent || '').trim()
}

function clearSelection() { try { window.getSelection()?.removeAllRanges() } catch { /* 忽略 */ } }

/**
 * 段落上的文字菜单。电脑上是右键菜单：右键按下时阻止浏览器改选区（mac 会自动选中光标下的词），
 * 弹出时读当时的选区；有选区给「划线 / 解释 / 追问 / 复制」，没有就给整段的操作。
 * 手机上没有右键：长按选词后照旧在选区下方弹浮层。locate(text) 返回 'zh' | 'src' | null。
 */
function useTextMenu(hostRef, locate) {
  const [selection, setSelection] = useState(null) // 手机浮层 {text, where, x, y}
  const [menu, setMenu] = useState(null) // 右键菜单 {x, y, text, where}
  const menuRef = useRef(null)
  const lastTouch = useRef(0)
  const onMouseDown = e => { if (e.button === 2 || (e.button === 0 && e.ctrlKey)) e.preventDefault() }
  const onContextMenu = e => {
    if (Date.now() - lastTouch.current < 1500) return
    const host = hostRef.current?.getBoundingClientRect()
    if (!host) return
    e.preventDefault()
    const text = selectedText(hostRef.current)
    setSelection(null)
    setMenu({ x: Math.max(0, Math.min(e.clientX - host.left, host.width - 168)), y: e.clientY - host.top + 2, text, where: text ? locate(text) : null })
  }
  const closeMenu = useCallback(() => setMenu(null), [])
  useEffect(() => {
    if (!menu) return
    // 点菜单外面只关菜单，这一下不再落到下面的元素上（和系统菜单一样）
    const onDown = ev => {
      if (ev.composedPath().includes(menuRef.current)) return
      setMenu(null)
      if (ev.button !== 0) return
      const swallow = e => { e.stopPropagation(); e.preventDefault() }
      document.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallow, true), 600)
    }
    const onKey = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); setMenu(null) } }
    const onClose = () => setMenu(null)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('scroll', onClose, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', onClose, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [menu])
  // 靠近窗口底部时往上翻
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !menu) return
    const r = el.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8) el.style.top = `${Math.max(0, menu.y - r.height - 4)}px`
  }, [menu])
  const popFromTouch = () => {
    const sel = window.getSelection()
    const text = selectedText(hostRef.current)
    if (!text || text.length > 600) { setSelection(null); return }
    const where = locate(text)
    const host = hostRef.current?.getBoundingClientRect()
    if (!where || !host) { setSelection(null); return }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    setSelection({ text, where, x: Math.max(0, rect.left - host.left), y: rect.bottom - host.top + 4 })
  }
  const clear = () => { setSelection(null); setMenu(null); clearSelection() }
  const handlers = {
    onMouseDown,
    onContextMenu,
    onTouchStart: () => { lastTouch.current = Date.now() },
    onTouchEnd: () => { lastTouch.current = Date.now(); setTimeout(popFromTouch, 350) },
  }
  return { selection, menu, menuRef, closeMenu, handlers, clear }
}

/** 右键菜单本体。items 里 '-' 是分隔线，null 跳过。 */
function TextMenu({ menu, menuRef, items, onClose }) {
  if (!menu) return null
  const list = items.filter(Boolean).filter((it, i, a) => it !== '-' || (i > 0 && i < a.length - 1 && a[i - 1] !== '-'))
  return (
    <div className="ir-ctx" ref={menuRef} role="menu" style={{ left: menu.x, top: menu.y }} onMouseUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}>
      {menu.text ? <div className="ir-ctx-head">「{menu.text.length > 16 ? `${menu.text.slice(0, 16)}…` : menu.text}」</div> : null}
      {list.map((it, i) => it === '-' ? <hr key={i} /> : <button key={i} role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => { onClose(); it.run() }}>{it.label}</button>)}
    </div>
  )
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text) } catch { try { document.execCommand('copy') } catch { /* 忽略 */ } }
}

/** 追问的状态与输入行：run 直接问，openFor 打开输入行（可带选中的文字） */
function useAsk(onAsk, placeholder, onDone) {
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState('')
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(null)
  const [err, setErr] = useState('')
  const run = async ({ selection = '', question = '', kind }) => {
    setErr('')
    setAsking({ label: ASK_LABEL[kind], detail: kind === 'explain' ? `「${selection}」` : kind === 'custom' ? question : '' })
    try { const item = await onAsk({ selection, question, kind }); if (item?.id && onDone) setTimeout(() => onDone(item), 80) } catch (e) { setErr(e.message) } finally { setAsking(null) }
  }
  const submit = () => {
    const q = draft.trim()
    if (!q) return
    run({ selection: sel, question: q, kind: 'custom' })
    setOpen(false); setDraft(''); setSel('')
  }
  const openFor = (text = '') => { setSel(text); setDraft(''); setOpen(true) }
  const toggle = () => { setSel(''); setOpen(v => !v) }
  const row = open ? (
    <div className="ir-retrans" onClick={e => e.stopPropagation()}>
      <input placeholder={sel ? `关于「${sel.slice(0, 24)}」想问什么…` : placeholder} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }} autoFocus />
      <button onClick={submit} disabled={!draft.trim()}>问</button>
      <button className="ir-plain" onClick={() => { setOpen(false); setSel('') }}>取消</button>
    </div>
  ) : null
  return { asking, err, setErr, run, openFor, toggle, row }
}

/** 全书导读 / 本章导读：选中文字同样可以「解释 / 追问」，答案挂在导读下面 */
function IntroBlock({ label, paraId, text, asks, onAsk, onRemoveAsk }) {
  const hostRef = useRef(null)
  const { selection, menu, menuRef, closeMenu, handlers, clear } = useTextMenu(hostRef, t => (text.includes(t) ? 'zh' : null))
  const ctl = useAskCard(hostRef)
  const ask = useAsk(onAsk, `对这段${label}想问什么…`, item => ctl.openFor(item.id))
  const { groups, rest } = splitAsks(text, asks)
  const sel = menu?.text
  const menuItems = sel ? [
    sel.length <= 600 ? { label: '解释', run: () => { clear(); ask.run({ selection: sel, kind: 'explain' }) } } : null,
    sel.length <= 600 ? { label: '追问…', run: () => { ask.openFor(sel); clear() } } : null,
    '-',
    { label: '复制', run: () => copyText(sel) },
  ] : [
    { label: `追问这段${label}…`, run: () => ask.openFor('') },
    { label: `复制${label}`, run: () => copyText(text) },
  ]
  return (
    <div className="ir-intro" data-para={paraId} ref={hostRef} {...handlers}>
      {selection ? (
        <span className="ir-sel-pop" style={{ left: selection.x, top: selection.y }} onMouseUp={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <button onClick={() => { const t = selection.text; clear(); ask.run({ selection: t, kind: 'explain' }) }}>解释</button>
          <button onClick={() => { ask.openFor(selection.text); clear() }}>追问</button>
        </span>
      ) : null}
      <TextMenu menu={menu} menuRef={menuRef} items={menuItems} onClose={closeMenu} />
      <b>{label}</b><p><Annotated text={text} groups={groups} ctl={ctl} /><AskMark asks={rest} ctl={ctl} /></p>
      <AskCard ctl={ctl} asks={asks} onRemove={onRemoveAsk} />
      {ask.row}
      <AskPending asking={ask.asking} />
      {ask.err ? <div className="ir-note"><b>错误</b>{ask.err}</div> : null}
    </div>
  )
}

function Paragraph({ p, display, bookId, book, chapter, mark, asks, reading, onRead, onMark, onUpdated, onAsk, onRemoveAsk }) {
  const hostRef = useRef(null)
  const { selection, menu, menuRef, closeMenu, handlers, clear: clearSelection } = useTextMenu(hostRef, text => (p.zh && p.zh.includes(text) ? 'zh' : p.text.includes(text) ? 'src' : null))
  const ctl = useAskCard(hostRef)
  const ask = useAsk(onAsk, '对这一段想问什么…', item => ctl.openFor(item.id))
  const { asking, err, setErr, run: runAsk } = ask
  // 锚点挂在主文字上：原文模式或还没译时是原文，否则是译文；表格只用段尾「问」
  const mainText = display === 'original' || !p.zh ? p.text : p.zh
  const { groups: askGroups, rest: askRest } = p.kind === 'table' ? { groups: new Map(), rest: asks ?? [] } : splitAsks(mainText, asks)
  const [showSrc, setShowSrc] = useState(false)
  const [editNote, setEditNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(mark?.note ?? '')
  const [showNote, setShowNote] = useState(false)
  const [retrans, setRetrans] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const kindClass = `ir-para ir-${p.kind || 'p'}${selection || menu ? ' ir-has-sel' : ''}${reading ? ' ir-reading' : ''}${mark?.bookmark ? ' ir-bookmarked' : ''}`
  const isHeading = p.kind === 'h1' || p.kind === 'h2' || p.kind === 'h3'
  const isTable = p.kind === 'table'

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
      <figure className={`ir-figure${mark?.bookmark ? ' ir-bookmarked' : ''}`} data-para={p.id}>
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
      <button onClick={() => { ask.openFor(selection.text); clearSelection() }}>追问</button>
    </span>
  ) : null
  const sel = menu?.text
  const zhShown = Boolean(p.zh) && display !== 'original'
  const menuItems = sel ? [
    menu.where === 'zh' && sel.length >= 2 ? { label: '划线', run: () => { onMark({ addRange: sel }); clearSelection() } } : null,
    sel.length <= 600 ? { label: '解释', run: () => { clearSelection(); runAsk({ selection: sel, kind: 'explain' }) } } : null,
    sel.length <= 600 ? { label: '追问…', run: () => { ask.openFor(sel); clearSelection() } } : null,
    '-',
    { label: '复制', run: () => copyText(sel) },
  ] : [
    { label: '这段在说什么', run: () => { if (!asking) runAsk({ kind: 'intent' }) } },
    { label: '追问这段…', run: () => ask.openFor('') },
    onRead ? { label: '从这段朗读', run: () => onRead() } : null,
    '-',
    zhShown ? { label: mark?.highlight ? '取消整段划线' : '整段划线', run: () => onMark({ highlight: !mark?.highlight }) } : null,
    { label: mark?.note ? '改笔记' : '写笔记', run: () => { setNoteDraft(mark?.note ?? ''); setEditNote(true) } },
    { label: mark?.bookmark ? '取消书签' : '加书签', run: () => onMark({ bookmark: !mark?.bookmark }) },
    '-',
    display === 'zh' && p.zh ? { label: showSrc ? '收起原文' : '看原文', run: () => setShowSrc(v => !v) } : null,
    p.note ? { label: showNote ? '收起译注' : '看译注', run: () => setShowNote(v => !v) } : null,
    p.zh ? { label: '重译这段…', run: () => setRetrans(true) } : null,
    { label: '开会话问', run: askInChat },
    '-',
    { label: '复制这段', run: () => copyText(zhShown ? p.zh : p.text) },
  ]
  const textMenu = <TextMenu menu={menu} menuRef={menuRef} items={menuItems} onClose={closeMenu} />
  const askRow = ask.row
  const askList = <><AskCard ctl={ctl} asks={asks} onRemove={onRemoveAsk} /><AskPending asking={asking} /></>

  if (display === 'original') {
    return (
      <div className={kindClass} data-para={p.id} ref={hostRef} {...handlers}>
        {popover}
        {textMenu}
        {isTable ? <><TableView text={p.text} header={p.header} /><AskMark asks={askRest} ctl={ctl} /></> : <div className="ir-src"><Annotated text={p.text} groups={askGroups} ctl={ctl} /><AskMark asks={askRest} ctl={ctl} />{(p.notes ?? []).filter(n => n.paraId).map((n, i) => <Footnote key={i} bookId={bookId} note={n} />)}</div>}
        {askRow}
        {askList}
        {err ? <div className="ir-note"><b>错误</b>{err}</div> : null}
      </div>
    )
  }
  const srcVisible = display === 'bilingual' || showSrc || !p.zh
  return (
    <div className={kindClass} data-para={p.id} ref={hostRef} {...handlers}>
      {popover}
      {textMenu}
      {p.zh ? (
        <div className={`ir-zh${mark?.highlight ? ' ir-hl' : ''}`} onClick={() => { if (display === 'zh' && !selection && !window.getSelection()?.toString()) setShowSrc(v => !v) }}>
          {isTable ? <TableView text={p.zh} header={p.header} /> : <Annotated text={p.zh} ranges={mark?.ranges} onRemove={r => onMark({ removeRange: r })} groups={askGroups} ctl={ctl} />}
          {p.note ? <span className="ir-note-mark" onClick={e => { e.stopPropagation(); setShowNote(v => !v) }}>注</span> : null}
          <AskMark asks={askRest} ctl={ctl} />
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
      {srcVisible ? (isTable ? <div className="ir-src"><TableView text={p.text} muted header={p.header} />{!p.zh ? <><AskMark asks={askRest} ctl={ctl} /><span className="ir-pending">待译</span></> : null}</div> : <div className="ir-src">{p.zh ? p.text : <><Annotated text={p.text} groups={askGroups} ctl={ctl} /><AskMark asks={askRest} ctl={ctl} /></>}{!p.zh && !isHeading ? <span className="ir-pending">待译</span> : null}</div>) : null}
      {showNote && p.note ? <div className="ir-note"><b>译注</b>{p.note}</div> : null}
      {showSrc && display === 'zh' && p.zh ? (
        <div className="ir-para-tools">
          <button className="ir-link" onClick={() => runAsk({ kind: 'intent' })} disabled={Boolean(asking)}>这段在说什么</button>
          <button className="ir-link" onClick={ask.toggle}>追问</button>
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

function MarksTab({ book, display, marks, onGo }) {
  const entries = Object.entries(marks ?? {}).sort((a, b) => (b[1].at ?? '').localeCompare(a[1].at ?? ''))
  if (entries.length === 0) return <div className="ir-block">还没有划线、笔记或书签。选中译文里的一段文字就能划线；译文模式下点开一段，还有「划线」「笔记」。</div>
  const chapterOf = pid => book.chapters.find(c => pid.startsWith(c.id + 'p'))
  return (
    <div>
      {entries.map(([pid, m]) => {
        const ch = chapterOf(pid)
        return (
          <button key={pid} className="ir-toc-item ir-hit" onClick={() => onGo(ch?.id, pid)}>
            <span className="ir-hit-body"><span className="ir-hit-ch">{ch ? tt(ch, display) : pid}{m.bookmark ? ' · 书签' : ''}{m.highlight ? ' · 整段划线' : ''}</span>{m.ranges?.length ? m.ranges.map((r, i) => <span key={i} className="ir-hit-range">{r}</span>) : null}{m.note ? m.note : (!m.ranges?.length && (m.highlight || !m.bookmark) ? '（划线）' : '')}</span>
          </button>
        )
      })}
    </div>
  )
}

function AsksTab({ book, display, asks, onGo }) {
  const list = [...(asks ?? [])].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  if (list.length === 0) return <div className="ir-block">还没有追问。选中一个词或一句话点「解释」，或点开一段用「这段在说什么」「追问」，答案都会记在这里。</div>
  const chapterOf = a => book.chapters.find(c => c.id === a.chapterId || a.paraId.startsWith(c.id + 'p'))
  return (
    <div>
      {list.map(a => {
        const ch = chapterOf(a)
        const head = a.selection ? `「${a.selection}」` : a.kind === 'custom' ? a.question : ASK_LABEL[a.kind]
        return (
          <button key={a.id} className="ir-toc-item ir-hit" onClick={() => { onGo(ch?.id, a.paraId); setTimeout(() => window.dispatchEvent(new CustomEvent('ir-open-ask', { detail: a.id })), 500) }}>
            <span className="ir-hit-body"><span className="ir-hit-ch">{ch ? tt(ch, display) : a.paraId}</span><span className="ir-hit-range" style={{ textDecoration: 'none' }}>{head}</span>{String(a.answer ?? '').slice(0, 90)}{a.answer && a.answer.length > 90 ? '…' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

function TocDrawer({ book, display, current, marks, asks, liveReach, initialTab, motion, onClose, onGo, onBookChanged, onRetranslateChapter }) {
  const [tab, setTab] = useState(initialTab || 'toc')
  const [term, setTerm] = useState('')
  const [zh, setZh] = useState('')
  const [glossary, setGlossary] = useState(book.glossary ?? [])
  const listRef = useRef(null)
  useEffect(() => {
    // 只滚列表自己。scrollIntoView 会连外层一起滚，抽屉滑入时还在屏幕外，dsh 的整列会被横向带偏
    const list = listRef.current
    const el = list?.querySelector('.ir-current')
    if (el) list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - el.offsetHeight) / 2
  }, [])
  const addTerm = async () => {
    if (!term.trim() || !zh.trim()) return
    try { setGlossary(await api.glossary(book.id, { term: term.trim(), zh: zh.trim() })); setTerm(''); setZh(''); onBookChanged() } catch { /* 忽略 */ }
  }
  const removeTerm = async (t) => {
    try { setGlossary(await api.glossary(book.id, { remove: t })); onBookChanged() } catch { /* 忽略 */ }
  }
  return (
    <div className={`ir-drawer${motion ? ` ir-drawer-${motion}` : ''}`} data-window-drag-recall="">
      <div className="ir-bar">
        <div className="ir-title" title={book.title}>{tt(book, display)}</div>
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
        {tab === 'toc' ? book.chapters.map(c => {
          const read = Math.max(c.read ?? 0, liveReach?.[c.id] ?? 0)
          const pct = Math.round(read * 100)
          return (
            <button key={c.id} className={`ir-toc-item${c.id === current ? ' ir-current' : ''}`} onClick={() => onGo(c.id)} title={`${c.title}\n读到 ${pct}% · 已译 ${c.translated}/${c.translatable ?? c.paragraphs} 段`}>
              <span className="ir-toc-title">{tt(c, display)}</span>
              <span className="ir-toc-count">{c.translated}/{c.translatable ?? c.paragraphs}</span>
              {pct > 0 ? <i className="ir-toc-read" style={{ width: `${pct}%` }} aria-hidden="true" /> : null}
            </button>
          )
        }) : null}
        {tab === 'book' ? <BookTab book={book} chapterId={current} onRetranslateChapter={onRetranslateChapter} /> : null}
        {tab === 'search' ? <SearchTab book={book} onGo={onGo} /> : null}
        {tab === 'marks' ? <MarksTab book={book} display={display} marks={marks} onGo={onGo} /> : null}
        {tab === 'asks' ? <AsksTab book={book} display={display} asks={asks} onGo={onGo} /> : null}
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
