import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { htmlToBlocks } from '../lib/html-text.js'
import { parseEpub } from '../lib/epub.js'

const PORTER = process.env.IR_TEST_EPUB ?? fileURLToPath(new URL('./fixtures/porter.epub', import.meta.url))
const skip = existsSync(PORTER) ? false : 'porter.epub 不存在'

test('htmlToBlocks: 脚注引用移出文本进 refs，块带 anchor', () => {
  const blocks = htmlToBlocks('<p>Pade &amp; Associates<a href="n.html#f2"><sup>2</sup></a> and more <a href="http://x.com">site</a>.</p><p id="f2"><a id="f2b"></a>2. The note.</p>')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].text, 'Pade & Associates and more site.')
  assert.deepEqual(blocks[0].refs, [{ marker: '2', href: 'n.html#f2' }])
  assert.equal(blocks[0].anchor, undefined)
  assert.equal(blocks[1].anchor, 'f2')
  assert.equal(blocks[1].refs, undefined)
})

test('htmlToBlocks: noteref / 短数字链接识别，普通链接保留', () => {
  const [a] = htmlToBlocks('<p>x<a epub:type="noteref" href="#n1">[1]</a> y<a href="c.html#k">*</a> z <a href="c.html#k">Chapter 3</a></p>')
  assert.equal(a.text, 'x y z Chapter 3')
  assert.deepEqual(a.refs, [{ marker: '[1]', href: '#n1' }, { marker: '*', href: 'c.html#k' }])
})

test('parseEpub porter: Preface 脚注 notes 指向注释段', { skip }, async () => {
  const doc = await parseEpub(readFileSync(PORTER), { filename: 'porter.epub' })
  const all = new Map()
  for (const c of doc.chapters) for (const p of c.paragraphs) all.set(p.id, p)
  const pre = doc.chapters.find((c) => /Preface/.test(c.title))
  assert.ok(pre, 'Preface 章存在')
  const withNotes = pre.paragraphs.filter((p) => p.notes && p.notes.length)
  assert.ok(withNotes.length > 0)
  const n = withNotes[0].notes[0]
  assert.ok(n.paraId && all.has(n.paraId))
  const target = all.get(n.paraId)
  assert.ok(target.text.length > 0)
  assert.ok(target.text.includes(n.marker) || /^\d/.test(target.text))
  for (const p of all.values()) if (p.kind === 'p') assert.ok(!/[a-z]\d$/.test(p.text), p.text.slice(-40))
})

test('parseEpub porter: 两次解析结果一致', { skip }, async () => {
  const bytes = readFileSync(PORTER)
  assert.deepStrictEqual(await parseEpub(bytes), await parseEpub(bytes))
})
