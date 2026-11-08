/**
 * 浏览器半入口。宿主只认 apply / inject。
 *
 * 两个座位：左侧栏图标（sidebar.panellist）与点开后的主区域（main，按 key 匹配）。
 * apply 里不能 await、不能抛：一抛整条 slot 静默退役。
 */
import React, { useEffect, useState } from 'react'
import { api } from './api.js'
import { ensureStyle } from './style.js'
import { Shelf } from './Shelf.jsx'
import { Reader } from './Reader.jsx'
import { Settings } from './Settings.jsx'
import { setAskAgent, resolveAskAgent } from './host.js'

const PANEL_ID = 'immersive-reader'
const LAST_KEY = 'dsh-immersive-reader:last'

function readLast() {
  try { return JSON.parse(window.localStorage.getItem(LAST_KEY) || 'null') } catch { return null }
}
function writeLast(value) {
  try { window.localStorage.setItem(LAST_KEY, JSON.stringify(value)) } catch { /* 隐私模式 */ }
}

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="ir-root"><div className="ir-error">阅读室界面出错：{String(this.state.error?.message ?? this.state.error)} <button className="ir-link" onClick={() => this.setState({ error: null })}>重试</button></div></div>
      )
    }
    return this.props.children
  }
}

export function PanelPage() {
  const last = readLast()
  const [screen, setScreen] = useState(last?.bookId ? 'reader' : 'shelf')
  const [bookId, setBookId] = useState(last?.bookId ?? null)
  const [settings, setSettings] = useState(null)
  const [returnTo, setReturnTo] = useState('shelf')

  useEffect(() => {
    api.settings().then(setSettings).catch(() => setSettings({ display: 'zh', fontSize: 18, lineHeight: 1.9, lookahead: { unit: 'chapters', count: 1 } }))
  }, [])

  const open = (id) => { setBookId(id); writeLast({ bookId: id }); setScreen('reader') }
  const back = () => { setBookId(null); writeLast(null); setScreen('shelf') }
  const toSettings = (from) => { setReturnTo(from); setScreen('settings') }
  const setDisplay = (display) => {
    setSettings(s => ({ ...s, display }))
    api.saveSettings({ display }).catch(() => {})
  }

  let body
  if (!settings) body = <div className="ir-empty">载入设置…</div>
  else if (screen === 'settings') body = <Settings settings={settings} onChange={setSettings} onBack={() => setScreen(returnTo)} />
  else if (screen === 'reader' && bookId) body = <Reader bookId={bookId} settings={settings} onBack={back} onSettings={() => toSettings('reader')} onDisplayChange={setDisplay} />
  else body = <Shelf settings={settings} onOpen={open} onSettings={() => toSettings('shelf')} />

  return <div className="ir-root" data-display={settings?.display ?? 'zh'} data-font={settings?.fontFamily === 'sans' ? 'sans' : 'serif'}><Boundary>{body}</Boundary></div>
}

export function PanelIcon(props) {
  const size = Number.isFinite(props?.size) ? props.size : 20
  // 一本摊开的书，中间一道脊：和左侧栏其他细线图标同一笔画粗细。
  return (
    <svg width={size} height={size} viewBox="2 3 20 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 6.5c-1.8-1.4-4.1-1.9-7-1.7-.5 0-1 .5-1 1v11.4c0 .5.5 1 1 1 2.9-.2 5.2.3 7 1.7" />
      <path d="M12 6.5c1.8-1.4 4.1-1.9 7-1.7.5 0 1 .5 1 1v11.4c0 .5-.5 1-1 1-2.9-.2-5.2.3-7 1.7" />
      <path d="M12 6.5v13.4" />
      <path d="M7 9.2h2.4M7 12h2.4M14.6 9.2H17M14.6 12H17" />
    </svg>
  )
}

export const inject = ['slots']

export function apply(ctx) {
  try { if (typeof document !== 'undefined') ensureStyle(document) } catch (error) { console.warn('[immersive-reader] 样式注入失败', error) }
  const slots = ctx && ctx.slots
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    console.warn('[immersive-reader] 宿主没有 slots 服务，不提供界面')
    return
  }
  try { setAskAgent(resolveAskAgent(ctx)) } catch { /* 没有 uiWorkspace 就降级为复制到剪贴板 */ }
  ctx.effect(() => {
    const disposers = []
    disposers.push(slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, PanelPage)))
    disposers.push(slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 60, label: () => '阅读室' }, PanelIcon)))
    return () => { for (const d of disposers.splice(0)) { try { d() } catch { /* 忽略 */ } } }
  }, 'immersive-reader: 面板入口')
}
