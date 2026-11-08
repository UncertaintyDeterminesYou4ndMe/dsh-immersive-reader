import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../lib/store.js'
import { Translator, buildBatches, lookaheadTargets, parseBatchReply, extractJson, introTarget } from '../lib/translate.js'

const para = (id, text, kind = 'p') => ({ id, kind, text })
const BOOK = {
  title: 'Test Book', author: 'Someone', language: 'en', source: 'txt',
  chapters: [
    { id: 'c1', title: 'One', paragraphs: [para('c1p1', 'Alpha.'), para('c1p2', 'Beta.'), para('c1p3', 'Gamma.')] },
    { id: 'c2', title: 'Two', paragraphs: [para('c2p1', 'Delta.'), para('c2p2', 'Epsilon.')] },
    { id: 'c3', title: 'Three', paragraphs: [para('c3p1', 'Zeta.')] },
  ],
}

/** 假宿主：记录每次请求，按输入段落回 JSON 译文。 */
function fakeCtx(calls, { failFirst = 0 } = {}) {
  let n = 0
  return {
    get: () => null,
    logger: { info() {}, warn() {} },
    llm: {
      listProviders: () => [{ id: 'fake' }],
      listModels: async () => [{ id: 'm1' }],
      async *stream(options) {
        calls.push(options)
        n += 1
        if (n <= failFirst) {
          yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } }
          return
        }
        const user = options.messages[0].content[0].text
        if (user.includes('导读')) {
          yield { type: 'text-delta', index: 0, text: '这是导读。' }
        } else {
          const input = JSON.parse(user.slice(user.lastIndexOf('\n') + 1))
          const items = input.map(p => ({ id: p.id, zh: `译:${p.text}`, ...(p.id === 'c1p2' ? { note: '注释' } : {}) }))
          yield { type: 'text-delta', index: 0, text: '```json\n' + JSON.stringify({ items, glossary: [{ term: 'Alpha', zh: '阿尔法' }] }) + '\n```' }
        }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
}

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'ir-test-'))
  const store = new LibraryStore(dir)
  await store.init()
  return { store, dir }
}

test('buildBatches 按字数与段数切批', () => {
  const paras = Array.from({ length: 30 }, (_, i) => para(`p${i}`, 'x'.repeat(300)))
  const batches = buildBatches(paras, { maxChars: 1000, maxParas: 12 })
  assert.ok(batches.every(b => b.length <= 3))
  assert.equal(batches.flat().length, 30)
})

test('lookaheadTargets：按章 = 当前章剩余 + 后 N 章；按段 = 往后 N 段', () => {
  const byChapter = lookaheadTargets(BOOK, { chapterId: 'c1', paraId: 'c1p2' }, { unit: 'chapters', count: 1 })
  assert.deepEqual(byChapter.map(r => r.paragraph.id), ['c1p2', 'c1p3', 'c2p1', 'c2p2'])
  const byPara = lookaheadTargets(BOOK, { chapterId: 'c1', paraId: 'c1p3' }, { unit: 'paragraphs', count: 2 })
  assert.deepEqual(byPara.map(r => r.paragraph.id), ['c1p3', 'c2p1'])
  const fromStart = lookaheadTargets(BOOK, null, { unit: 'chapters', count: 0 })
  assert.deepEqual(fromStart.map(r => r.paragraph.id), ['c1p1', 'c1p2', 'c1p3'])
})

test('extractJson / parseBatchReply 容忍围栏与废话，报告缺漏', () => {
  const data = extractJson('好的，译文如下：\n```json\n{"items":[{"id":"a","zh":"甲",}],"glossary":[]}\n```')
  assert.equal(data.items[0].zh, '甲')
  const { items, missing, glossary } = parseBatchReply('{"items":[{"id":"a","zh":"甲","note":"n"}],"glossary":[{"term":"T","zh":"替"}]}', ['a', 'b'])
  assert.equal(items.get('a').note, 'n')
  assert.deepEqual(missing, ['b'])
  assert.equal(glossary[0].term, 'T')
})

test('ensureLookahead 走完整条队列：译文、译注、术语、导读都落盘', async () => {
  const { store, dir } = await tempStore()
  try {
    const book = await store.addBook(new Uint8Array([1, 2, 3]), { filename: 'a.txt', doc: BOOK })
    const calls = []
    const translator = new Translator({ ctx: fakeCtx(calls), store, logger: { info() {}, warn() {} } })
    const settings = await store.settings()
    const queued = await translator.ensureLookahead(book.id, { chapterId: 'c1', paraId: 'c1p1' }, { ...settings, lookahead: { unit: 'chapters', count: 0 } })
    assert.equal(queued, 3)
    await waitIdle(translator, book.id)
    const trans = await store.translations(book.id)
    assert.equal(trans.paragraphs.c1p1.zh, '译:Alpha.')
    assert.equal(trans.paragraphs.c1p2.note, '注释')
    assert.equal(trans.paragraphs.c2p1, undefined)
    assert.equal(trans.glossary[0].zh, '阿尔法')
    assert.equal(trans.intro, '这是导读。')
    assert.equal(trans.chapters.c1.intro, '这是导读。')
    // 第二次不会重复排队
    assert.equal(await translator.ensureLookahead(book.id, { chapterId: 'c1', paraId: 'c1p1' }, { ...settings, lookahead: { unit: 'chapters', count: 0 } }), 0)
    assert.ok(calls.some(c => c.system?.includes('译注')), '系统提示里要有译注规则')
    assert.ok(calls.some(c => c.messages[0].content[0].text.includes('术语表')), '提示里要带术语表')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('失败的批会重试，并记录错误', async () => {
  const { store, dir } = await tempStore()
  try {
    const book = await store.addBook(new Uint8Array([9]), { filename: 'b.txt', doc: BOOK })
    const calls = []
    const translator = new Translator({ ctx: fakeCtx(calls, { failFirst: 1 }), store, logger: { info() {}, warn() {} } })
    const settings = { ...(await store.settings()), intros: false, lookahead: { unit: 'paragraphs', count: 1 }, concurrency: 1 }
    await translator.ensureLookahead(book.id, { chapterId: 'c3', paraId: 'c3p1' }, settings)
    await waitIdle(translator, book.id, 8000)
    const trans = await store.translations(book.id)
    assert.equal(trans.paragraphs.c3p1.zh, '译:Zeta.')
    assert.equal(translator.status(book.id).errors.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('retranslate 覆盖旧译文并带上指令', async () => {
  const { store, dir } = await tempStore()
  try {
    const book = await store.addBook(new Uint8Array([7]), { filename: 'c.txt', doc: BOOK })
    const calls = []
    const translator = new Translator({ ctx: fakeCtx(calls), store, logger: { info() {}, warn() {} } })
    const items = await translator.retranslate(book.id, ['c2p2'], '更口语')
    assert.equal(items.c2p2.zh, '译:Epsilon.')
    assert.ok(calls[0].messages[0].content[0].text.includes('更口语'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

async function waitIdle(translator, bookId, timeout = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const s = translator.status(bookId)
    if (s.queued === 0 && s.running === 0) {
      await new Promise(r => setTimeout(r, 50))
      const again = translator.status(bookId)
      if (again.queued === 0 && again.running === 0) return
    }
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error('translator did not go idle')
}

test('buildBatches lead：第一批很小，后面照常', () => {
  const paras = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, kind: 'p', text: 'x'.repeat(200) }))
  const plain = buildBatches(paras)
  assert.equal(plain[0].length, 9, '默认按 1800 字封顶')
  const lead = buildBatches(paras, { lead: true })
  assert.equal(lead[0].length, 2, '首批 ≤ 500 字')
  assert.equal(lead[1].length, 9)
  assert.equal(lead.flat().length, 30)
})

test('askPrompt 带上原文、译文、上文、选中与问题；默认问题按 kind', async () => {
  const { askPrompt, ASK_KINDS } = await import('../lib/translate.js')
  const chapter = BOOK.chapters[0]
  const p = askPrompt({ book: BOOK, chapter, paragraph: chapter.paragraphs[2], zh: '伽马。', previous: ['阿', '贝'], bookIntro: '导读', glossary: [{ term: 'Alpha', zh: '阿尔法' }], selection: 'Gamma', kind: 'explain' })
  assert.ok(p.includes('这一段原文：\nGamma.') && p.includes('这一段译文：\n伽马。') && p.includes('> 阿\n> 贝'))
  assert.ok(p.includes('「Gamma」') && p.endsWith(`读者的问题：${ASK_KINDS.explain}`))
  const q = askPrompt({ book: BOOK, chapter, paragraph: chapter.paragraphs[2], zh: null, previous: [], bookIntro: null, glossary: [], question: '为什么？', kind: 'custom' })
  assert.ok(q.endsWith('读者的问题：为什么？') && !q.includes('这一段译文'))
})

test('Translator.ask 走模型并落盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-ask-'))
  try {
    const store = new LibraryStore(dir)
    await store.init()
    await store.addBook(Buffer.from('ask-book'), { filename: 'b.txt', doc: BOOK })
    const calls = []
    const ctx = fakeCtx(calls)
    ctx.llm.stream = async function* (options) { calls.push(options); yield { type: 'text-delta', text: '这是回答。' }; yield { type: 'finish', reason: { kind: 'stop' } } }
    const translator = new Translator({ ctx, store, logger: { info() {}, warn() {} } })
    const id = (await store.listBooks())[0].id
    const r = await translator.ask(id, { paraId: 'c1p2', selection: 'Beta', kind: 'explain' })
    assert.equal(r.answer, '这是回答。')
    assert.ok(calls[0].system.includes('导师') && calls[0].messages[0].content[0].text.includes('「Beta」'))
    const saved = await store.addAsk(id, { paraId: 'c1p2', chapterId: 'c1', selection: 'Beta', kind: 'explain', answer: r.answer })
    assert.ok(saved.id && saved.at)
    assert.equal((await store.asks(id)).length, 1)
    assert.equal((await store.removeAsk(id, saved.id)).length, 0)
    await assert.rejects(translator.ask(id, { paraId: 'nope', kind: 'intent' }), /没有这一段/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('recallBook：用章导读与各份回想拼提示，结果落在 trans.bookRecall', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-brecall-'))
  try {
    const store = new LibraryStore(dir)
    await store.init()
    await store.addBook(Buffer.from('recall-book'), { filename: 'b.txt', doc: BOOK })
    const id = (await store.listBooks())[0].id
    await store.mergeTranslations(id, { intro: '全书导读', chapters: { c1: { intro: '一章导读' } } })
    await store.saveSessions(id, [{ date: '2026-01-01', day: 1, from: 'c1p1', to: 'c1p3', recall: { summary: '第一份脉络' } }])
    const calls = []
    const ctx = fakeCtx(calls)
    ctx.llm.stream = async function* (options) { calls.push(options); yield { type: 'text-delta', text: '{"summary":"全书总结","threads":["线索甲"],"questions":["问一","问二","问三"],"next":"再读乙"}' }; yield { type: 'finish', reason: { kind: 'stop' } } }
    const translator = new Translator({ ctx, store, logger: { info() {}, warn() {} } })
    const r = await translator.recallBook(id)
    assert.equal(r.summary, '全书总结')
    assert.deepEqual(r.threads, ['线索甲'])
    const user = calls[0].messages[0].content[0].text
    assert.ok(user.includes('- One：一章导读') && user.includes('- 第一份脉络') && user.includes('全书导读：全书导读'))
    assert.equal((await store.translations(id)).bookRecall.summary, '全书总结')
    await store.mergeTranslations(id, { glossary: [{ term: 'x', zh: '叉' }] })
    assert.equal((await store.translations(id)).bookRecall.summary, '全书总结', '其他合并不丢 bookRecall')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('isFrontMatter / firstContentChapter：跳过封面版权目录', async () => {
  const { isFrontMatter, firstContentChapter } = await import('../lib/translate.js')
  assert.ok(isFrontMatter('Cover') && isFrontMatter('Title Page') && isFrontMatter('CONTENTS') && isFrontMatter('目录') && isFrontMatter('第 3 节'))
  assert.ok(isFrontMatter('Other Books by This Author') && isFrontMatter('Also by Nassim Taleb') && isFrontMatter('Praise for Antifragile'))
  assert.ok(!isFrontMatter('Introduction') && !isFrontMatter('1. The Need for a New Paradigm') && !isFrontMatter('Prologue'))
  const book = { chapters: [{ id: 'c1', title: 'Cover', paragraphs: [para('c1p1', 'x')] }, { id: 'c2', title: 'Contents', paragraphs: [para('c2p1', 'x')] }, { id: 'c3', title: 'Preface', paragraphs: [para('c3p1', 'x')] }] }
  assert.equal(firstContentChapter(book).id, 'c3')
  assert.equal(firstContentChapter({ chapters: [{ id: 'c1', title: 'Cover', paragraphs: [para('c1p1', 'x')] }] }).id, 'c1')
})

test('addBook 可指定 id：同一链接重抓时覆盖同一本书并保留译文', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-url-'))
  try {
    const store = new LibraryStore(dir)
    await store.init()
    const doc = { ...BOOK, url: 'https://x.test/a', source: 'web' }
    const first = await store.addBook(Buffer.from('v1'), { filename: 'a.html', doc })
    await store.mergeTranslations(first.id, { paragraphs: { c1p1: { zh: '甲' } } })
    const found = await store.findByUrl('https://x.test/a')
    assert.equal(found.id, first.id)
    const second = await store.addBook(Buffer.from('v2-different-bytes'), { filename: 'a.html', doc, id: found.id })
    assert.equal(second.id, first.id)
    assert.equal((await store.listBooks()).length, 1)
    assert.equal((await store.translations(first.id)).paragraphs.c1p1.zh, '甲')
    assert.equal(await store.findByUrl('https://x.test/none'), null)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('导读也能追问：intro:book / intro:<章> 走导读文本，提示里注明不是作者原文', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-ask-intro-'))
  try {
    const store = new LibraryStore(dir)
    await store.init()
    await store.addBook(Buffer.from('ask-intro'), { filename: 'b.txt', doc: BOOK })
    const id = (await store.listBooks())[0].id
    const calls = []
    const ctx = fakeCtx(calls)
    ctx.llm.stream = async function* (options) { calls.push(options); yield { type: 'text-delta', text: '导读回答。' }; yield { type: 'finish', reason: { kind: 'stop' } } }
    const translator = new Translator({ ctx, store, logger: { info() {}, warn() {} } })
    await assert.rejects(translator.ask(id, { paraId: 'intro:c1', selection: '巴比伦', kind: 'explain' }), /导读还没生成/)
    await store.mergeTranslations(id, { intro: '全书讲巴比伦法典。', chapters: { c1: { intro: '本章从巴比伦石碑讲起。' } } })
    const r = await translator.ask(id, { paraId: 'intro:c1', selection: '巴比伦石碑', kind: 'explain' })
    assert.equal(r.answer, '导读回答。')
    const text = calls[0].messages[0].content[0].text
    assert.ok(text.includes('本章导读（') && text.includes('本章从巴比伦石碑讲起') && text.includes('「巴比伦石碑」'))
    assert.ok(!text.includes('这一段原文'))
    await translator.ask(id, { paraId: 'intro:book', question: '为什么从法典讲起？', kind: 'custom' })
    const t2 = calls[1].messages[0].content[0].text
    assert.ok(t2.includes('全书导读（') && t2.includes('全书讲巴比伦法典') && !t2.includes('背景：'))
    assert.equal(introTarget(await store.book(id), await store.translations(id), 'c1p1'), null)
    assert.equal(introTarget(await store.book(id), await store.translations(id), 'intro:book').chapter.id, 'c1')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
