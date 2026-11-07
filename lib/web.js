/**
 * web.js —— 网页文章 → BookDoc。
 *
 * 「像浏览器页面翻译一样」的另一半：给一个链接（或存下来的 .html），抠出正文，按段落交给同一套翻译流程。
 * 正文识别不用 DOM 库：把 tokenize 的结果搭成一棵轻量树，按 readability 的思路给每个 <p> 的父/祖父加分，
 * 取分最高的容器，去掉导航/评论/分享这类噪音后再交给 htmlToBlocks。
 */
import { tokenize, htmlToBlocks } from './html-text.js'

const RAW = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'object', 'canvas'])
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const DROP = new Set(['nav', 'aside', 'footer', 'form', 'button', 'select', 'textarea', 'dialog', 'menu'])
const NOISE = /(^|[\s_-])(comment|comments|share|sharing|social|related|recommend|sidebar|side-bar|footer|nav|navbar|menu|promo|subscribe|newsletter|cookie|popup|modal|advert|ads?|banner|breadcrumb|pagination|toolbar|byline-share|disqus)([\s_-]|$)/i
const CANDIDATE = new Set(['article', 'main', 'section', 'div', 'td', 'body', 'blockquote', 'li'])
const MAX_FETCH = 10 * 1024 * 1024

const collapse = s => String(s ?? '').replace(/\s+/g, ' ').trim()

/** 搭树：{name, attrs, children, parent}；文本节点 {text}。 */
function buildTree(html) {
  const root = { name: '#root', attrs: {}, children: [], parent: null }
  let cur = root
  let raw = null
  let rawDepth = 0
  for (const t of tokenize(String(html))) {
    if (raw) {
      if (t.type === 'open' && t.name === raw && !t.selfClosing) rawDepth++
      else if (t.type === 'close' && t.name === raw && --rawDepth === 0) raw = null
      continue
    }
    if (t.type === 'text') { cur.children.push({ text: t.text, parent: cur }); continue }
    if (t.type === 'open') {
      if (RAW.has(t.name)) { if (!t.selfClosing) { raw = t.name; rawDepth = 1 } continue }
      const node = { name: t.name, attrs: t.attrs, children: [], parent: cur }
      cur.children.push(node)
      if (!t.selfClosing && !VOID.has(t.name)) cur = node
      continue
    }
    // close：回到最近的同名祖先；没有就忽略
    let n = cur
    while (n && n.name !== t.name) n = n.parent
    if (n && n.parent) cur = n.parent
  }
  return root
}

function textOf(node) {
  if (node.text !== undefined) return node.text
  let s = ''
  for (const c of node.children) s += textOf(c)
  return s
}

const BLOCKY = new Set(['div', 'section', 'article', 'main', 'aside', 'nav', 'header', 'footer', 'table', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'blockquote', 'pre', 'form', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
/** 容器「自有」文字：不穿过块级子元素（它们各自参评） */
function ownText(node) {
  let s = ''
  for (const c of node.children) {
    if (c.text !== undefined) s += c.text
    else if (!BLOCKY.has(c.name)) s += ownText(c)
  }
  return s
}

function* walk(node) {
  yield node
  if (node.children) for (const c of node.children) yield* walk(c)
}

function find(root, pred) {
  for (const n of walk(root)) if (n.name && pred(n)) return n
  return null
}

function attr(node, name) {
  const v = node.attrs?.[name]
  return typeof v === 'string' ? v : ''
}

function isNoise(node) {
  if (DROP.has(node.name)) return true
  const hint = `${attr(node, 'class')} ${attr(node, 'id')} ${attr(node, 'role')}`
  if (node.name === 'header' && node.parent && (node.parent.name === 'body' || node.parent.name === '#root')) return true
  return NOISE.test(hint) && !/article-body|post-content|entry-content|story-body/i.test(hint)
}

/** 评分：每个够长的 <p>（或 pre/blockquote/li）给父节点加全长、祖父加一半；标点多的段略加分。 */
function pickMain(root) {
  const body = find(root, n => n.name === 'body') ?? root
  const direct = find(body, n => n.name === 'article') ?? find(body, n => n.name === 'main' || attr(n, 'role') === 'main')
  const scores = new Map()
  for (const n of walk(body)) {
    if (!n.name || !(n.name === 'p' || n.name === 'pre' || n.name === 'blockquote' || n.name === 'li')) continue
    const len = collapse(textOf(n)).length
    if (len < 25) continue
    const score = len + (collapse(textOf(n)).match(/[,，.。;；!！?？]/g) ?? []).length * 5
    const p = n.parent
    if (p && CANDIDATE.has(p.name) && !isNoise(p)) scores.set(p, (scores.get(p) ?? 0) + score)
    const g = p?.parent
    if (g && CANDIDATE.has(g.name) && !isNoise(g)) scores.set(g, (scores.get(g) ?? 0) + score / 2)
  }
  if (scores.size === 0) {
    // 老式页面（文字直接放在 <td>/<font> 里、用 <br><br> 分段）：按容器自有文字量评分
    for (const n of walk(body)) {
      if (!n.name || !CANDIDATE.has(n.name) || isNoise(n)) continue
      const len = collapse(ownText(n)).length
      if (len >= 200) scores.set(n, len)
    }
  }
  let best = null
  let bestScore = 0
  for (const [n, s] of scores) if (s > bestScore) { best = n; bestScore = s }
  if (direct) {
    // <article>/<main> 明确标出正文时优先，除非评分最高者在它之外且分数压倒性
    const directScore = scores.get(direct) ?? 0
    let inside = false
    for (let n = best; n; n = n.parent) if (n === direct) inside = true
    if (inside || directScore * 3 >= bestScore) return direct
  }
  return best ?? body
}

function serialize(node, out) {
  if (node.text !== undefined) { out.push(escapeText(node.text)); return }
  if (node.name !== '#root') {
    if (isNoise(node)) return
    out.push(`<${node.name}${Object.entries(node.attrs).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('')}>`)
  }
  for (const c of node.children) serialize(c, out)
  if (node.name !== '#root' && !VOID.has(node.name)) out.push(`</${node.name}>`)
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function metaContent(root, pred) {
  const m = find(root, n => n.name === 'meta' && pred(n))
  return m ? collapse(attr(m, 'content')) : ''
}

/**
 * @param {string} html
 * @param {{ url?: string, filename?: string }} [options]
 * @returns {object} BookDoc（source: 'web'，无图片）
 */
export function extractArticle(html, options = {}) {
  const root = buildTree(html)
  const htmlNode = find(root, n => n.name === 'html')
  const language = htmlNode ? collapse(attr(htmlNode, 'lang')).toLowerCase() : ''
  const titleTag = find(root, n => n.name === 'title')
  const ogTitle = metaContent(root, n => attr(n, 'property') === 'og:title' || attr(n, 'name') === 'twitter:title')
  const siteName = metaContent(root, n => attr(n, 'property') === 'og:site_name')
  let title = ogTitle || (titleTag ? collapse(textOf(titleTag)) : '')
  if (title && siteName && title.endsWith(siteName)) title = title.slice(0, -siteName.length).replace(/[\s|–—:-]+$/, '').trim() || title
  const author = metaContent(root, n => /^(author|article:author|twitter:creator|dc\.creator)$/i.test(attr(n, 'name') || attr(n, 'property')))

  const main = pickMain(root)
  const out = []
  serialize(main, out)
  let blocks = htmlToBlocks(out.join('')).filter(b => b.kind !== 'img')
  // 标题：正文开头已有同名标题就不重复；否则补一个 h1
  const h1 = find(root, n => n.name === 'h1')
  const heading = title || (h1 ? collapse(textOf(h1)) : '')
  if (heading) {
    const first = blocks.find(b => b.kind === 'h1' || b.kind === 'h2')
    if (!first || collapse(first.text).toLowerCase() !== heading.toLowerCase()) blocks.unshift({ kind: 'h1', text: heading })
    else if (blocks[0] !== first) { blocks = blocks.filter(b => b !== first); blocks.unshift({ ...first, kind: 'h1' }) }
  }
  if (!title) title = heading || hostOf(options.url) || (options.filename || '').replace(/\.[^.]*$/, '') || '网页'

  // 分章：长文按 h2 切，否则一章
  const h2s = blocks.filter(b => b.kind === 'h2').length
  const raw = []
  if (h2s >= 2 && blocks.length > 40) {
    let cur = null
    for (const b of blocks) {
      if (b.kind === 'h2' || !cur) { cur = { title: b.kind === 'h2' ? b.text : title, blocks: [] }; raw.push(cur) }
      cur.blocks.push(b)
    }
  } else if (blocks.length) raw.push({ title, blocks })
  const chapters = raw.filter(c => c.blocks.some(b => b.kind !== 'h1' && b.kind !== 'h2')).map((c, i) => {
    const id = `c${i + 1}`
    return {
      id,
      title: c.title || `第 ${i + 1} 节`,
      paragraphs: c.blocks.map((b, j) => ({ id: `${id}p${j + 1}`, kind: b.kind, text: b.text, ...(b.rows ? { rows: b.rows, header: Boolean(b.header) } : {}) })),
    }
  })
  return { title, author, language, source: 'web', url: options.url || '', chapters, assets: {} }
}

function hostOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}

/** 网址 → 文件名（book.json 里的 filename / source.html）。 */
export function filenameForUrl(url) {
  let host = ''
  let path = ''
  try { const u = new URL(url); host = u.hostname; path = u.pathname } catch { /* 用默认 */ }
  const slug = (path.split('/').filter(Boolean).pop() || 'index').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9一-鿿_-]+/g, '-').slice(0, 60) || 'index'
  return `${host ? host.replace(/^www\./, '') + '-' : ''}${slug}.html`
}

/** 解码 HTML 字节：HTTP 头 charset → <meta charset> → UTF-8（替换符太多再退 GB18030）。 */
export function decodeHtml(bytes, contentType = '') {
  const headCharset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  const sniff = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1]
  for (const label of [headCharset, metaCharset]) {
    if (!label || /^utf-?8$/i.test(label)) continue
    try { return new TextDecoder(label).decode(bytes) } catch { /* 不认识的编码，往下走 */ }
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad === 0 || bad < utf8.length / 500) return utf8
  try { return new TextDecoder('gb18030').decode(bytes) } catch { return utf8 }
}

/**
 * 抓网页：只认 http/https，跟随重定向，20 秒超时，最多 10 MB。
 * @returns {Promise<{ bytes: Buffer, html: string, url: string, contentType: string }>}
 */
export async function fetchPage(url, { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  let target
  try { target = new URL(url) } catch { throw Object.assign(new Error('链接不合法'), { code: 'E_BAD_REQUEST' }) }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw Object.assign(new Error('只支持 http / https 链接'), { code: 'E_BAD_REQUEST' })
  let res
  try {
    res = await fetchImpl(target.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-language': 'en,zh;q=0.8',
      },
    })
  } catch (error) {
    throw Object.assign(new Error(`抓取失败：${error?.name === 'TimeoutError' ? '超时' : error?.message ?? error}`), { code: 'E_FETCH', status: 502 })
  }
  if (!res.ok) throw Object.assign(new Error(`抓取失败：HTTP ${res.status}`), { code: 'E_FETCH', status: 502 })
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType && !/html|xml|text\/plain/i.test(contentType)) throw Object.assign(new Error(`这个链接不是网页（${contentType.split(';')[0]}）`), { code: 'E_UNSUPPORTED' })
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_FETCH) throw Object.assign(new Error('网页太大'), { code: 'E_TOO_BIG', status: 413 })
  return { bytes: buf, html: decodeHtml(buf, contentType), url: res.url || target.href, contentType }
}
