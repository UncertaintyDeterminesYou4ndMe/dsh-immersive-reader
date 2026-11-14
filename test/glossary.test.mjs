import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relevantGlossary, batchPrompt } from '../lib/translate.js'

const G = [
  { term: 'cluster', zh: '集群' },
  { term: 'competitive advantage', zh: '竞争优势' },
  { term: 'Diamond', zh: '钻石体系' },
  { term: 'rival', zh: '对手' },
  { term: 'box', zh: '箱' },
  { term: '道', zh: 'Tao' },
]

test('relevantGlossary 只取原文里作为完整词出现的术语，含复数', () => {
  const text = 'Clusters and the diamond explain Competitive Advantage; rivalry is fierce. Boxes too. 道可道'
  assert.deepEqual(relevantGlossary(G, text).map(g => g.term), ['cluster', 'competitive advantage', 'Diamond', 'box', '道'])
  assert.deepEqual(relevantGlossary(G, 'no matches here'), [])
  assert.deepEqual(relevantGlossary(G, 'cluster box rival', 2).map(g => g.term), ['cluster', 'rival'])
})

test('batchPrompt 只把本批用得上的术语放进提示词，排在 200 条以后的也能用上', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ term: `term${i}`, zh: `术语${i}` }))
  const p = batchPrompt({ book: { title: 'B' }, chapter: { title: 'C' }, batch: [{ id: 'a', kind: 'p', text: 'We use term250 here.' }], glossary: many, previous: [] })
  assert.ok(p.includes('term250 → 术语250'))
  assert.ok(!p.includes('term1 → '))
})

test('整理术语表：只看模型提议的条目，按块返回建议删除的，不碰读者固定的', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { LibraryStore } = await import('../lib/store.js')
  const { Translator } = await import('../lib/translate.js')
  const dir = await mkdtemp(join(tmpdir(), 'ir-gloss-'))
  try {
    const store = new LibraryStore(dir)
    await store.init()
    const doc = { title: 'Book', author: 'A', language: 'en', chapters: [{ id: 'c1', title: 'One', paragraphs: [{ id: 'c1p1', kind: 'p', text: 'x' }] }] }
    const book = await store.addBook(new Uint8Array([1]), { filename: 'a.txt', doc })
    await store.mergeTranslations(book.id, { glossary: [{ term: 'sophistication', zh: '成熟度' }, { term: 'Diamond', zh: '钻石体系' }, { term: 'remarkable', zh: '非凡', by: 'reader' }, { term: 'high wages', zh: '高工资' }] })
    const prompts = []
    const ctx = { llm: { stream: async function* (o) { prompts.push(o.messages[0].content[0].text); yield { type: 'text-delta', text: '{"drop":["sophistication","high wages","remarkable"]}' }; yield { type: 'finish', reason: { kind: 'stop' } } } } }
    const translator = new Translator({ ctx, store, logger: { info() {}, warn() {} } })
    translator.resolveModel = async () => ({ provider: 'p', model: 'm' })
    const r = await translator.reviewGlossary(book.id, { offset: 0, limit: 2 })
    assert.equal(r.total, 3)
    assert.deepEqual(r.drop, [{ term: 'sophistication', zh: '成熟度' }])
    assert.ok(!prompts[0].includes('remarkable →'), '读者固定的不发给模型')
    const r2 = await translator.reviewGlossary(book.id, { offset: 2, limit: 2 })
    assert.deepEqual(r2.drop.map(g => g.term), ['high wages'])
    assert.deepEqual(await translator.reviewGlossary(book.id, { offset: 9 }), { drop: [], total: 3 })
  } finally { await rm(dir, { recursive: true, force: true }) }
})
