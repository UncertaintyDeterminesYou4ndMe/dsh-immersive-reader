import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { htmlToBlocks } from '../lib/html-text.js';
import { parseEpub } from '../lib/epub.js';
import { parseText } from '../lib/text.js';

const PORTER = process.env.IR_TEST_EPUB ?? fileURLToPath(new URL('./fixtures/porter.epub', import.meta.url));

test('parseEpub: porter.epub', { skip: !existsSync(PORTER) && 'porter.epub missing' }, async () => {
  const bytes = readFileSync(PORTER);
  const book = await parseEpub(bytes);
  assert.match(book.title, /Competitive Advantage/);
  assert.equal(book.source, 'epub');
  assert.ok(book.chapters.length >= 10);
  const ids = new Set();
  book.chapters.forEach((c, i) => {
    assert.equal(c.id, `c${i + 1}`);
    assert.ok(c.paragraphs.length > 0, `chapter ${c.id} empty`);
    for (const p of c.paragraphs) {
      assert.ok(!ids.has(p.id), `dup id ${p.id}`);
      ids.add(p.id);
      assert.ok(!p.text.includes('<') && !p.text.includes('&nbsp;'), p.id);
      if (p.kind !== 'table') assert.equal(p.text, p.text.replace(/\s+/g, ' ').trim());
      else assert.ok(Array.isArray(p.rows) && p.text.startsWith('| '), p.id);
    }
  });
  assert.ok(book.chapters.some((c) => /introduction|chapter/i.test(c.title)));
  // 稳定性
  assert.deepStrictEqual(await parseEpub(bytes), book);
});

test('parseEpub: invalid input', async () => {
  await assert.rejects(parseEpub(new Uint8Array([1, 2, 3])), { message: 'EPUB_INVALID' });
});

test('htmlToBlocks: 属性值含 > 不截断标签', () => {
  const b = htmlToBlocks('<p title="a > b" data-x=\'1>2\'>Hello <b>world</b></p>');
  assert.deepStrictEqual(b, [{ kind: 'p', text: 'Hello world' }]);
});

test('htmlToBlocks: 嵌套 blockquote/p', () => {
  const b = htmlToBlocks('<p>Before</p><blockquote><p>Quoted one</p><blockquote><p>Deep</p></blockquote>Loose text</blockquote><p>After</p>');
  assert.deepStrictEqual(b, [
    { kind: 'p', text: 'Before' },
    { kind: 'blockquote', text: 'Quoted one' },
    { kind: 'blockquote', text: 'Deep' },
    { kind: 'blockquote', text: 'Loose text' },
    { kind: 'p', text: 'After' },
  ]);
});

test('htmlToBlocks: 实体解码', () => {
  const b = htmlToBlocks('<p>A&amp;B &lt;x&gt; &quot;q&quot; &#65;&#x42; caf&eacute;&nbsp;ok&mdash;fine &unknown;</p>');
  assert.equal(b[0].text, 'A&B <x> "q" AB café ok—fine &unknown;');
});

test('htmlToBlocks: 跳过 script/style/head/注释，标题与 li 的 kind', () => {
  const b = htmlToBlocks('<html><head><title>T</title></head><body><script>var a="<p>no</p>";</script><style>p{}</style><!-- <p>c</p> --><h4>Sub</h4><ul><li>one</li><li>two</ul><p>text<sup><a href="#n1">12</a></sup></p></body></html>');
  assert.deepStrictEqual(b, [
    { kind: 'h3', text: 'Sub' }, { kind: 'li', text: 'one' }, { kind: 'li', text: 'two' }, { kind: 'p', text: 'text', refs: [{ marker: '12', href: '#n1' }] },
  ]);
});

test('htmlToBlocks: br 合并为同一块，纯页码/符号块丢弃', () => {
  const b = htmlToBlocks('<p>line1<br/>line2<BR>line3</p><p>123</p><p>***</p><p>12345</p><div>x</div>');
  assert.deepStrictEqual(b.map((x) => x.text), ['line1 line2 line3', '12345', 'x']);
});

test('parseText: 中文第X章分章', () => {
  const src = '序言内容\n\n第一章 开始\n\n正文一\n\n正文二\n\n第二章 继续\n\n正文三\n';
  const d = parseText(src, { filename: 'novel.txt' });
  assert.deepStrictEqual(d.chapters.map((c) => c.title), ['前言', '第一章 开始', '第二章 继续']);
  assert.equal(d.chapters[1].paragraphs[0].kind, 'h1');
  assert.equal(d.chapters[1].paragraphs.length, 3);
  assert.equal(d.title, 'novel');
  assert.equal(d.source, 'txt');
});

test('parseText: markdown 标题分章', () => {
  const src = '﻿# One\r\n\r\nSome **bold** and [link](http://x) `code`.\r\n\r\n- item a\r\n1. item b\r\n\r\n> quote\r\n\r\n## Two\r\n\r\n```\r\ncode  block\r\nline2\r\n```\r\n\r\n### Sub\r\n\r\nend';
  const d = parseText(src, { filename: 'a.md' });
  assert.equal(d.source, 'md');
  assert.deepStrictEqual(d.chapters.map((c) => c.title), ['One', 'Two']);
  assert.deepStrictEqual(d.chapters[0].paragraphs.map((p) => [p.kind, p.text]), [
    ['h1', 'One'], ['p', 'Some bold and link code.'], ['li', 'item a'], ['li', 'item b'], ['blockquote', 'quote'],
  ]);
  assert.deepStrictEqual(d.chapters[1].paragraphs.map((p) => [p.kind, p.text]), [
    ['h2', 'Two'], ['p', 'code block line2'], ['h3', 'Sub'], ['p', 'end'],
  ]);
});

test('parseText: 无标题 TXT 每 80 段切章', () => {
  const lines = Array.from({ length: 170 }, (_, i) => `line number ${i + 1}`).join('\n');
  const d = parseText(lines, {});
  assert.deepStrictEqual(d.chapters.map((c) => c.paragraphs.length), [80, 80, 10]);
  assert.deepStrictEqual(d.chapters.map((c) => c.title), ['第 1 节', '第 2 节', '第 3 节']);
  assert.equal(d.chapters[2].paragraphs[0].id, 'c3p1');
});

test('parseText: 稳定性', () => {
  const src = '第一章 A\n\nx\n\n第二章 B\n\ny';
  assert.deepStrictEqual(parseText(src, {}), parseText(src, {}));
});

test('htmlToBlocks: 连续两个 <br> 是段落边界', () => {
  const b = htmlToBlocks('<td><font>First paragraph here.<br><br>Second paragraph here.<br>\n<br>Third one.<br>still third</font></td>');
  assert.deepStrictEqual(b.map((x) => x.text), ['First paragraph here.', 'Second paragraph here.', 'Third one. still third']);
});

test('EPUB 作者字段去重清理', async () => {
  const { cleanCreators } = await import('../lib/epub.js');
  assert.deepStrictEqual(cleanCreators(['Nassim Nicholas Taleb', 'Nassim Nicholas Taleb [Taleb, Nassim Nicholas]', 'cj5', 'Taleb, Nassim Nicholas']), ['Nassim Nicholas Taleb']);
  assert.deepStrictEqual(cleanCreators(['鲁迅', 'Michael E. Porter']), ['鲁迅', 'Michael E. Porter']);
});
