import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { htmlToBlocks } from '../lib/html-text.js'
import { parseEpub } from '../lib/epub.js'
import { parseText } from '../lib/text.js'
import { LibraryStore, assetFileName } from '../lib/store.js'
import { createHandler, API_PREFIX } from '../lib/routes.js'

const PORTER = process.env.IR_TEST_EPUB ?? fileURLToPath(new URL('./fixtures/porter.epub', import.meta.url))

test('htmlToBlocks: img 成独立块，table 内图片忽略，svg image 产出 img', () => {
  const blocks = htmlToBlocks('<p>a</p><img src="../images/x.png" alt="Fig 1"/><figure><img src="y.jpg"/><figcaption>cap</figcaption></figure><table><tr><td>Q<img src="z.png"/></td></tr></table>')
  assert.deepEqual(blocks.map(b => b.kind), ['p', 'img', 'img', 'p', 'table'])
  assert.equal(blocks[1].src, '../images/x.png')
  assert.equal(blocks[1].text, 'Fig 1')
  assert.equal(blocks[2].src, 'y.jpg')
  assert.equal(blocks[2].text, '')
  const svg = htmlToBlocks('<svg><image xlink:href="c&amp;d.jpg"/><text>skip me</text></svg><p>after</p>')
  assert.deepEqual(svg, [{ kind: 'img', src: 'c&d.jpg', text: '' }, { kind: 'p', text: 'after' }])
})

test('parseText: Markdown 独占一行的图片成 img 块', () => {
  const doc = parseText('# T\n\ntext\n\n![A cat](img/cat.png)\n\nsee ![inline](x.png) here\n', { filename: 'a.md' })
  const ps = doc.chapters[0].paragraphs
  const img = ps.find(p => p.kind === 'img')
  assert.equal(img.text, 'A cat')
  assert.equal(img.src, 'img/cat.png')
  assert.deepEqual(doc.assets, {})
  assert.equal(ps.filter(p => p.kind === 'img').length, 1)
})

const book = existsSync(PORTER) ? await parseEpub(readFileSync(PORTER)) : null

test('parseEpub: porter.epub 图片与封面', { skip: !book && 'porter.epub missing' }, () => {
  assert.ok(Object.keys(book.assets).length > 0)
  const imgs = book.chapters.flatMap(c => c.paragraphs).filter(p => p.kind === 'img')
  assert.ok(imgs.length > 0)
  for (const p of imgs) assert.ok(book.assets[p.src], p.src)
  assert.ok(book.cover && book.assets[book.cover])
  console.log(`# porter assets=${Object.keys(book.assets).length} imgParagraphs=${imgs.length} cover=${book.cover}`)
})

test('store.addBook 落盘 assets，listBooks 有 coverFile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ir-img-'))
  try {
    const store = new LibraryStore(root)
    await store.init()
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const doc = {
      title: 'T', author: '', language: '', source: 'epub',
      chapters: [{ id: 'c1', title: 'c', paragraphs: [{ id: 'c1p1', kind: 'p', text: 'hi' }, { id: 'c1p2', kind: 'img', text: 'alt', src: 'a b/x.png' }] }],
      assets: { 'a b/x.png': png },
      cover: 'a b/x.png',
    }
    const saved = await store.addBook(new Uint8Array([1, 2, 3]), { filename: 't.epub', doc })
    const file = assetFileName('a b/x.png')
    assert.match(file, /^[A-Za-z0-9._-]+$/)
    assert.deepEqual(await readdir(join(store.bookDir(saved.id), 'assets')), [file])
    const json = JSON.parse(await readFile(join(store.bookDir(saved.id), 'book.json'), 'utf8'))
    assert.equal(json.assets, undefined)
    assert.equal(json.chapters[0].paragraphs[1].file, file)
    assert.equal(json.coverFile, file)
    assert.equal((await store.listBooks())[0].coverFile, file)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('store.addBook: Markdown 本地图片相对 sourceDir 读取，读不到保留段落', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ir-img-'))
  try {
    await writeFile(join(root, 'pic.png'), new Uint8Array([1, 2, 3]))
    const store = new LibraryStore(join(root, 'lib'))
    await store.init()
    const doc = parseText('# T\n\n![ok](pic.png)\n\n![gone](nope.png)\n', { filename: 'a.md' })
    const saved = await store.addBook(new Uint8Array([9, 9]), { filename: 'a.md', doc, sourceDir: root })
    const [ok, gone] = saved.chapters[0].paragraphs.filter(p => p.kind === 'img')
    assert.ok(ok.file)
    assert.equal(gone.file, undefined)
  } finally { await rm(root, { recursive: true, force: true }) }
})

function fakeRes() {
  const res = { status: 0, headers: {}, body: null, writableEnded: false }
  res.writeHead = (s, h) => { res.status = s; res.headers = h }
  res.end = (b) => { res.body = b; res.writableEnded = true }
  return res
}

test('routes: GET /books/:id/assets/:file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ir-img-'))
  try {
    const store = new LibraryStore(root)
    await store.init()
    const png = new Uint8Array([137, 80, 78, 71, 9])
    const saved = await store.addBook(new Uint8Array([4, 5, 6]), {
      filename: 't.epub',
      doc: { title: 'T', chapters: [{ id: 'c1', title: 'c', paragraphs: [{ id: 'c1p1', kind: 'img', text: '', src: 'i/x.png' }] }], assets: { 'i/x.png': png } },
    })
    const handler = createHandler({ store, translator: {}, logger: { warn() {} } })
    const call = async (name) => {
      const res = fakeRes()
      await handler({ method: 'GET', url: `${API_PREFIX}/books/${saved.id}/assets/${name}`, headers: {} }, res)
      return res
    }
    const good = await call(assetFileName('i/x.png'))
    assert.equal(good.status, 200)
    assert.equal(good.headers['content-type'], 'image/png')
    assert.equal(good.headers['cache-control'], 'private, max-age=86400')
    assert.deepEqual(new Uint8Array(good.body), png)
    for (const bad of ['..', '%2e%2e', '..%2Fbook.json', 'a%20b.png']) {
      const r = await call(bad)
      assert.ok(r.status === 400 || r.status === 404, `${bad} -> ${r.status}`)
    }
    assert.equal((await call('missing.png')).status, 404)
  } finally { await rm(root, { recursive: true, force: true }) }
})
