import { markdownToRows, rowsToMarkdown } from './html-text.js';
// TXT / Markdown -> BookDoc

const CHUNK = 80;
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

const ZH_CHAPTER = /^第[一二三四五六七八九十百千零〇两0-9]+[章节卷回部篇]/;
const EN_CHAPTER = /^(?:(?:[Cc]hapter|CHAPTER)\s+(?:\d+|[IVXLC]+)|(?:[Pp]art|PART)\s+(?:\d+|[IVXLC]+))(?![A-Za-z])/;

function isChapterLine(line) {
  const s = line.trim();
  if (ZH_CHAPTER.test(s)) return s.length <= 40 && !/[。！？，；,;!?]$/.test(s);
  return EN_CHAPTER.test(s) && s.length <= 80;
}

function stripInline(s) {
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  return s
    .split(/(`+[^`]+`+)/)
    .map((seg, i) => {
      if (i % 2) return seg.replace(/^`+|`+$/g, '');
      return seg
        .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
        .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
        .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, '$1')
        .replace(/(?<![\w])_(?=\S)([^_]+?)(?<=\S)_(?![\w])/g, '$1');
    })
    .join('');
}

/** 返回 [{kind, text, chapterStart:boolean}] */
function parseMarkdownBlocks(lines) {
  const out = [];
  let para = [];
  let quote = [];
  const flushPara = () => { if (para.length) { out.push({ kind: 'p', text: stripInline(para.join(' ')) }); para = []; } };
  const flushQuote = () => { if (quote.length) { out.push({ kind: 'blockquote', text: stripInline(quote.join(' ')) }); quote = []; } };
  const flush = () => { flushPara(); flushQuote(); };
  let tableLines = [];
  const flushTable = () => {
    if (!tableLines.length) return;
    const rows = markdownToRows(tableLines.join('\n'));
    tableLines = [];
    if (rows) out.push({ kind: 'table', text: rowsToMarkdown(rows), rows, header: true });
  };

  let fence = null; // {marker, lines}
  for (const line of lines) {
    if (fence) {
      if (new RegExp('^\\s*' + fence.marker).test(line)) {
        out.push({ kind: 'p', text: fence.lines.join(' ') });
        fence = null;
      } else fence.lines.push(line);
      continue;
    }
    const fm = /^\s*(```+|~~~+)/.exec(line);
    if (fm) { flush(); fence = { marker: fm[1].slice(0, 3), lines: [] }; continue; }
    if (/^\s*\|/.test(line)) { flush(); tableLines.push(line); continue; }
    else if (tableLines.length) flushTable();
    if (!line.trim()) { flush(); continue; }
    const im = /^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)\s*$/.exec(line);
    if (im) { flush(); out.push({ kind: 'img', text: im[1], src: im[2] }); continue; }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const lvl = h[1].length;
      out.push({ kind: lvl === 1 ? 'h1' : lvl === 2 ? 'h2' : 'h3', text: stripInline(h[2]), chapterStart: lvl <= 2 });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); continue; }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      if (!q[1].trim()) flushQuote(); else quote.push(q[1].trim());
      continue;
    }
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { flush(); out.push({ kind: 'li', text: stripInline(li[1]) }); continue; }
    flushQuote();
    para.push(line.trim());
  }
  if (fence) out.push({ kind: 'p', text: fence.lines.join(' ') });
  flushTable();
  flush();
  return out;
}

function parsePlainBlocks(lines) {
  const out = [];
  const hasBlank = lines.some((l) => !l.trim());
  let para = [];
  const flush = () => { if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; } };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (isChapterLine(line)) { flush(); out.push({ kind: 'h1', text: line, chapterStart: true }); continue; }
    if (hasBlank) para.push(line);
    else out.push({ kind: 'p', text: line });
  }
  flush();
  return out;
}

export function parseText(text, options = {}) {
  const filename = (options && options.filename) || '';
  let s = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = s.split('\n');

  const isMd = /\.(md|markdown)$/i.test(filename) || lines.filter((l) => l.startsWith('#')).length >= 3;
  const blocks = (isMd ? parseMarkdownBlocks(lines) : parsePlainBlocks(lines))
    .map((b) => ({ ...b, text: collapse(b.text) }))
    .filter((b) => b.text || b.kind === 'img');

  // 分章
  let raw = []; // {title, blocks}
  if (blocks.some((b) => b.chapterStart)) {
    let cur = null;
    for (const b of blocks) {
      if (b.chapterStart) {
        cur = { title: b.text, blocks: [] };
        raw.push(cur);
      } else if (!cur) {
        cur = { title: '前言', blocks: [] };
        raw.push(cur);
      }
      cur.blocks.push(b);
    }
  } else {
    for (let i = 0; i < blocks.length; i += CHUNK) raw.push({ title: '', blocks: blocks.slice(i, i + CHUNK) });
  }
  raw = raw.filter((c) => c.blocks.length);

  const chapters = raw.map((c, i) => {
    const id = `c${i + 1}`;
    return {
      id,
      title: c.title || `第 ${i + 1} 节`,
      paragraphs: c.blocks.map((b, j) => ({ id: `${id}p${j + 1}`, kind: b.kind, text: b.text, ...(b.kind === 'img' ? { src: b.src } : {}), ...(b.rows ? { rows: b.rows, header: Boolean(b.header) } : {}) })),
    };
  });

  const title = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  return { title, author: '', language: '', source: isMd ? 'md' : 'txt', chapters, assets: {} };
}
