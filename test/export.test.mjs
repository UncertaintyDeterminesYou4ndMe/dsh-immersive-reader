import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notesMarkdown, textMarkdown, safeName } from '../lib/export.js'

const BOOK = {
  title: 'Test: Book/One', author: 'Someone', url: '',
  chapters: [
    { id: 'c1', title: 'One', paragraphs: [{ id: 'c1p1', kind: 'h1', text: 'One' }, { id: 'c1p2', kind: 'p', text: 'Alpha text.' }, { id: 'c1p3', kind: 'p', text: 'Beta text.' }, { id: 'c1p4', kind: 'table', text: '| a | b |\n| --- | --- |\n| 1 | 2 |', rows: [['a', 'b'], ['1', '2']], header: true }] },
    { id: 'c2', title: 'Two', paragraphs: [{ id: 'c2p1', kind: 'p', text: 'Gamma text.' }] },
  ],
}
const TRANS = { intro: '全书导读。', glossary: [], chapters: { c1: { intro: '本章导读。' } }, paragraphs: { c1p1: { zh: '一' }, c1p2: { zh: '阿尔法。', note: '译注甲' }, c1p3: { zh: '贝塔。' }, c1p4: { zh: '| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |' } } }

test('notesMarkdown 按章汇总划线、笔记、追问', () => {
  const marks = { c1p2: { ranges: ['阿尔法'], note: '我的笔记' }, c1p3: { highlight: true } }
  const asks = [{ id: 'a1', paraId: 'c2p1', selection: 'Gamma', kind: 'explain', answer: '伽马的解释。' }, { id: 'a2', paraId: 'c1p3', kind: 'intent', answer: '这段在铺垫。' }]
  const { markdown, count } = notesMarkdown(BOOK, TRANS, marks, asks)
  assert.equal(count, 3)
  assert.ok(markdown.startsWith('# 《Test: Book/One》 · 划线与笔记'))
  assert.ok(markdown.includes('## One') && markdown.includes('## Two'))
  assert.ok(markdown.includes('> 阿尔法\n') && markdown.includes('**笔记**：我的笔记'))
  assert.ok(markdown.includes('> 贝塔。') && markdown.includes('**追问**这段在说什么'))
  assert.ok(markdown.includes('**追问**「Gamma」') && markdown.includes('伽马的解释。'))
  assert.ok(markdown.includes('*Alpha text.*'))
  assert.ok(markdown.indexOf('## One') < markdown.indexOf('## Two'))
})

test('notesMarkdown 空书', () => {
  assert.ok(notesMarkdown(BOOK, TRANS, {}, []).markdown.includes('还没有'))
})

test('textMarkdown 单章译文 / 双语 / 全书', () => {
  const zh = textMarkdown(BOOK, TRANS, { chapterId: 'c1' })
  assert.equal(zh.paragraphs, 4)
  assert.ok(zh.markdown.includes('## 一\n') && zh.markdown.includes('阿尔法。') && zh.markdown.includes('> 译注：译注甲') && zh.markdown.includes('| 甲 | 乙 |'))
  assert.ok(zh.markdown.includes('本章导读'))
  assert.ok(!zh.markdown.includes('Alpha text.'))
  const bi = textMarkdown(BOOK, TRANS, { chapterId: 'c1', mode: 'bilingual' })
  assert.ok(bi.markdown.includes('阿尔法。\n*Alpha text.*'))
  const book = textMarkdown(BOOK, TRANS, {})
  assert.ok(book.markdown.includes('全书导读') && book.markdown.includes('## One'))
  assert.ok(!book.markdown.includes('## Two'), '没译的章不导出')
})

test('safeName', () => {
  assert.equal(safeName('Test: Book/One'), 'Test Book One')
  assert.equal(safeName(''), 'book')
})

test('safeName 超长按词边界截断', () => {
  const name = safeName('Competitive Advantage of Nations: Creating and Sustaining Superior Performance')
  assert.ok(name.length <= 60 && !name.endsWith('Sup') && name.endsWith('Sustaining'))
})
