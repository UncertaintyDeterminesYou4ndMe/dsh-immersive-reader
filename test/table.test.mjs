import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { htmlToBlocks, markdownToRows, rowsToMarkdown } from '../lib/html-text.js'
import { parseText } from '../lib/text.js'
import { LibraryStore } from '../lib/store.js'

test('HTML 表格成为一个 table 块：rows 保留结构，text 是 Markdown', () => {
  const html = `<p>Before</p><table class="x"><caption>Members</caption>
    <tr><th>Country</th><th>Partner</th></tr>
    <tr><td class="a"><p>Denmark</p></td><td>Copenhagen School<sup><a href="#n">2</a></sup></td></tr>
    <tr><td>Japan</td><td>MITI, Hitotsubashi</td></tr>
  </table><p>After</p>`
  const blocks = htmlToBlocks(html)
  assert.deepEqual(blocks.map(b => b.kind), ['p', 'p', 'table', 'p'])
  assert.equal(blocks[1].text, 'Members')
  const table = blocks[2]
  assert.deepEqual(table.rows, [['Country', 'Partner'], ['Denmark', 'Copenhagen School2'], ['Japan', 'MITI, Hitotsubashi']])
  assert.ok(table.text.startsWith('| Country | Partner |\n| --- | --- |\n| Denmark |'))
  assert.deepEqual(markdownToRows(table.text), table.rows)
  assert.equal(rowsToMarkdown([['a|b', 'c']]).split('\n')[0], '| a\\|b | c |')
})

test('Markdown 表格行成为 table 块', () => {
  const doc = parseText('# T\n\nintro\n\n| 名称 | 值 |\n| --- | --- |\n| x | 1 |\n| y | 2 |\n\nafter\n', { filename: 'a.md' })
  const paras = doc.chapters[0].paragraphs
  const table = paras.find(p => p.kind === 'table')
  assert.ok(table)
  assert.deepEqual(table.rows, [['名称', '值'], ['x', '1'], ['y', '2']])
  assert.equal(paras[paras.length - 1].text, 'after')
})

test('重新导入同一本书后，译文按原文对回新 id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-remap-'))
  try {
    const store = new LibraryStore(dir)
    await store.init()
    const bytes = new Uint8Array([1, 2, 3])
    const v1 = { title: 'B', author: '', language: 'en', source: 'txt', chapters: [{ id: 'c1', title: 'One', paragraphs: [
      { id: 'c1p1', kind: 'p', text: 'Alpha' }, { id: 'c1p2', kind: 'p', text: 'cell a' }, { id: 'c1p3', kind: 'p', text: 'Beta' },
    ] }] }
    const book = await store.addBook(bytes, { filename: 'b.txt', doc: v1 })
    await store.mergeTranslations(book.id, { paragraphs: { c1p1: { zh: '甲' }, c1p2: { zh: '格' }, c1p3: { zh: '乙' } } })
    const v2 = { ...v1, chapters: [{ id: 'c1', title: 'One', paragraphs: [
      { id: 'c1p1', kind: 'p', text: 'Alpha' }, { id: 'c1p2', kind: 'table', text: '| cell a |\n| --- |', rows: [['cell a']] }, { id: 'c1p3', kind: 'p', text: 'Beta' },
    ] }] }
    await store.addBook(bytes, { filename: 'b.txt', doc: v2 })
    const trans = await store.translations(book.id)
    assert.equal(trans.paragraphs.c1p1.zh, '甲')
    assert.equal(trans.paragraphs.c1p3.zh, '乙')
    assert.equal(trans.paragraphs.c1p2, undefined, '表格是新块，旧译文不该错位套上去')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
