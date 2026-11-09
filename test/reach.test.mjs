import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../lib/store.js'
import { chapterReach } from '../lib/routes.js'

const para = (id, kind = 'p') => ({ id, kind, text: id })
const BOOK = {
  title: 'T', author: 'A', language: 'en', source: 'txt',
  chapters: [
    { id: 'c1', title: 'One', paragraphs: [para('c1p1'), para('c1p2'), para('c1p3'), para('c1p4')] },
    { id: 'c2', title: 'Two', paragraphs: [para('c2p1'), para('c2p2'), para('c2p3'), para('c2p4')] },
    { id: 'c3', title: 'Three', paragraphs: [para('c3p1')] },
  ],
}

test('saveState：每章读到的比例只往大里记，不写进别的章', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ir-reach-'))
  try {
    const store = new LibraryStore(dir); await store.init()
    const book = await store.addBook(new Uint8Array([7]), { filename: 'r.txt', doc: BOOK })
    await store.saveState(book.id, { chapterId: 'c1', paraId: 'c1p3', progress: 0.5 })
    await store.saveState(book.id, { chapterId: 'c1', paraId: 'c1p1', progress: 0 })
    await store.saveState(book.id, { chapterId: 'c2', paraId: 'c2p1', progress: 1.7 })
    await store.saveState(book.id, { chapterId: 'c2', paraId: 'c2p2' })
    const state = await store.state(book.id)
    assert.deepEqual(state.reach, { c1: 0.5, c2: 1 })
    assert.equal(state.progress, undefined)
    assert.equal(state.paraId, 'c2p2')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('chapterReach：有记录用记录；没有时当前章按段位置、之前的章按已译比例估', () => {
  const trans = { paragraphs: { c1p1: {}, c1p2: {}, c1p3: {} } }
  assert.deepEqual(chapterReach(BOOK, trans, { chapterId: 'c2', paraId: 'c2p3' }), { c1: 0.75, c2: 0.5, c3: 0 })
  assert.deepEqual(chapterReach(BOOK, trans, { chapterId: 'c2', paraId: 'c2p3', reach: { c1: 1, c3: 0.2 } }), { c1: 1, c2: 0.5, c3: 0.2 })
  assert.deepEqual(chapterReach(BOOK, trans, null), { c1: 0, c2: 0, c3: 0 })
})
