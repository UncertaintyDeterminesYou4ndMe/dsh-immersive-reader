import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractArticle, filenameForUrl, decodeHtml, fetchPage } from '../lib/web.js'

const PAGE = `<!doctype html><html lang="en"><head><title>How to Think | Example Blog</title>
<meta property="og:site_name" content="Example Blog"><meta name="author" content="Jane Doe">
<script>var x = "<p>not content</p>";</script><style>.a{}</style></head>
<body>
<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<div class="sidebar"><p>Subscribe to our newsletter for weekly updates and never miss an article again!</p></div>
<main>
  <h1>How to Think</h1>
  <p>The first thing to understand about thinking is that it is a skill, and like any skill it improves with deliberate practice over years.</p>
  <p>Most people never practice. They mistake having opinions for having thought, and the two are not the same thing at all.</p>
  <blockquote>Writing is thinking made visible, which is why it is so hard.</blockquote>
  <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
  <p>Second, thinking is slow. The feeling of understanding arrives long before understanding itself, and that gap is where most errors live.</p>
  <div class="share">Share on Twitter · Share on Facebook · Share on LinkedIn · Copy link</div>
</main>
<footer><p>Copyright 2024 Example Blog. All rights reserved. Terms of service. Privacy policy. Contact us.</p></footer>
<div id="comments"><p>Great article, thanks for writing this, I learned a lot and will share it with my team tomorrow.</p></div>
</body></html>`

test('extractArticle 抠出正文、标题、作者，丢掉导航/侧栏/评论/分享', () => {
  const doc = extractArticle(PAGE, { url: 'https://example.com/posts/how-to-think' })
  assert.equal(doc.title, 'How to Think')
  assert.equal(doc.author, 'Jane Doe')
  assert.equal(doc.language, 'en')
  assert.equal(doc.source, 'web')
  assert.equal(doc.chapters.length, 1)
  const texts = doc.chapters[0].paragraphs.map(p => p.text)
  assert.equal(doc.chapters[0].paragraphs[0].kind, 'h1')
  assert.equal(texts[0], 'How to Think')
  assert.ok(texts.some(t => t.startsWith('The first thing')))
  assert.ok(texts.some(t => t.startsWith('Second, thinking is slow')))
  assert.ok(!texts.some(t => /newsletter|Share on|Copyright|Great article|not content|Home/.test(t)))
  const table = doc.chapters[0].paragraphs.find(p => p.kind === 'table')
  assert.ok(table && table.rows.length === 2 && table.header)
  const bq = doc.chapters[0].paragraphs.find(p => p.kind === 'blockquote')
  assert.ok(bq)
})

test('没有 <article>/<main> 时按段落密度选容器；长文按 h2 分章', () => {
  const paras = n => Array.from({ length: n }, (_, i) => `<p>Paragraph number ${i} has enough words in it to count as real body text for scoring purposes.</p>`).join('')
  const html = `<html><body><div id="nav"><p>menu menu menu menu menu menu menu menu menu menu</p></div><div class="post"><h2>Part One</h2>${paras(25)}<h2>Part Two</h2>${paras(25)}</div><div class="related"><p>related related related related related related related related related</p></div></body></html>`
  const doc = extractArticle(html, { filename: 'saved.html' })
  assert.equal(doc.title, 'saved')
  assert.equal(doc.chapters.length, 2)
  assert.equal(doc.chapters[0].title, 'Part One')
  assert.equal(doc.chapters[1].title, 'Part Two')
  assert.equal(doc.chapters[0].paragraphs.filter(p => p.kind === 'p').length, 25)
  assert.ok(!JSON.stringify(doc).includes('menu menu'))
})

test('filenameForUrl / decodeHtml', () => {
  assert.equal(filenameForUrl('https://www.paulgraham.com/think.html'), 'paulgraham.com-think.html')
  assert.equal(filenameForUrl('https://a.b/'), 'a.b-index.html')
  const gbk = new TextEncoder().encode('<html><head><meta charset="utf-8"></head><body>中文</body></html>')
  assert.ok(decodeHtml(gbk, 'text/html').includes('中文'))
})

test('fetchPage 拒绝非 http、非网页与过大响应', async () => {
  await assert.rejects(fetchPage('file:///etc/passwd'), /http/)
  const fake = (body, headers = { 'content-type': 'text/html; charset=utf-8' }, status = 200) => async () => ({ ok: status < 400, status, url: 'https://x.test/a', headers: new Headers(headers), arrayBuffer: async () => Buffer.from(body) })
  await assert.rejects(fetchPage('https://x.test/a', { fetchImpl: fake('%PDF', { 'content-type': 'application/pdf' }) }), /不是网页/)
  await assert.rejects(fetchPage('https://x.test/a', { fetchImpl: fake('', {}, 404) }), /HTTP 404/)
  const page = await fetchPage('https://x.test/a', { fetchImpl: fake('<html><body><p>hi</p></body></html>') })
  assert.ok(page.html.includes('<p>hi</p>'))
  assert.equal(page.url, 'https://x.test/a')
})

test('老式页面：文字在 <td><font> 里用 <br><br> 分段，也能抠出多段正文', () => {
  const body = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} of an old-style essay that puts all of its text inside a single font tag and separates paragraphs with two line breaks.`).join('<br><br>')
  const html = `<html><head><title>Old Essay</title></head><body><table><tr><td><img src="x.gif"><font size="2" face="verdana">${body}</font></td></tr></table><table><tr><td><font size="2"><a href="/">Home</a></font></td></tr></table></body></html>`
  const doc = extractArticle(html, { url: 'https://old.example/essay.html' })
  const ps = doc.chapters[0].paragraphs.filter(p => p.kind === 'p')
  assert.equal(ps.length, 12)
  assert.equal(doc.chapters[0].paragraphs[0].text, 'Old Essay')
})
