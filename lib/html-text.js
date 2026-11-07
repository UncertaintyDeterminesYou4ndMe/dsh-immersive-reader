// XHTML/HTML -> blocks。含一个按引号判断边界的小 tokenizer，供 epub.js 复用解析 OPF/NCX/nav。

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  deg: '°', plusmn: '±', times: '×', divide: '÷', middot: '·', bull: '•', sect: '§',
  para: '¶', euro: '€', pound: '£', yen: '¥', cent: '¢', frac12: '½', frac14: '¼',
  frac34: '¾', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', aacute: 'á', agrave: 'à',
  acirc: 'â', auml: 'ä', aring: 'å', ccedil: 'ç', iacute: 'í', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', oacute: 'ó', ocirc: 'ô', ouml: 'ö', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  szlig: 'ß', Eacute: 'É', Ouml: 'Ö', Uuml: 'Ü', Auml: 'Ä', shy: '', ensp: ' ', emsp: ' ',
  thinsp: ' ', zwj: '', zwnj: '', larr: '←', rarr: '→', dagger: '†', Dagger: '‡', prime: '′',
  Prime: '″', minus: '−', infin: '∞', ne: '≠', le: '≤', ge: '≥',
};

export function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '';
      return String.fromCodePoint(code);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
  });
}

const RAW_TEXT = new Set(['script', 'style']);
const isWs = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';

/**
 * tokenize(src) -> Array of
 *   {type:'text', text}                       (实体已解码；CDATA 原样)
 *   {type:'open', name, attrs, selfClosing}   (name/attr 名小写)
 *   {type:'close', name}
 * 状态机：text / tag / 单引号 / 双引号 / 注释 / CDATA。永不抛错。
 */
export function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let textStart = 0;
  const pushText = (end) => {
    if (end > textStart) tokens.push({ type: 'text', text: decodeEntities(src.slice(textStart, end)) });
  };
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) {
      pushText(lt);
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      textStart = i;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      pushText(lt);
      const e = src.indexOf(']]>', lt + 9);
      const body = src.slice(lt + 9, e < 0 ? n : e);
      if (body) tokens.push({ type: 'text', text: body });
      i = e < 0 ? n : e + 3;
      textStart = i;
      continue;
    }
    const c = src[lt + 1];
    if (c === '!' || c === '?') {
      pushText(lt);
      const e = src.indexOf('>', lt + 2);
      i = e < 0 ? n : e + 1;
      textStart = i;
      continue;
    }
    const isClose = c === '/';
    const nameStart = lt + (isClose ? 2 : 1);
    if (!(src[nameStart] && /[A-Za-z_:]/.test(src[nameStart]))) {
      i = lt + 1; // 孤立的 '<'，当文本
      continue;
    }
    // --- tag 状态 ---
    pushText(lt);
    let p = nameStart;
    while (p < n && !isWs(src[p]) && src[p] !== '>' && src[p] !== '/') p++;
    const name = src.slice(nameStart, p).toLowerCase();
    const attrs = {};
    let selfClosing = false;
    let terminated = false;
    while (p < n) {
      while (p < n && isWs(src[p])) p++;
      if (p >= n) break;
      const ch = src[p];
      if (ch === '>') { p++; terminated = true; break; }
      if (ch === '/') {
        if (src[p + 1] === '>') { selfClosing = true; p += 2; terminated = true; break; }
        p++;
        continue;
      }
      const as = p;
      while (p < n && !isWs(src[p]) && src[p] !== '=' && src[p] !== '>' && !(src[p] === '/' && src[p + 1] === '>')) p++;
      const aname = src.slice(as, p).toLowerCase();
      while (p < n && isWs(src[p])) p++;
      let val = '';
      if (src[p] === '=') {
        p++;
        while (p < n && isWs(src[p])) p++;
        const q = src[p];
        if (q === '"' || q === "'") { // 引号状态：值内的 '>' 不结束标签
          const e = src.indexOf(q, p + 1);
          val = src.slice(p + 1, e < 0 ? n : e);
          p = e < 0 ? n : e + 1;
        } else {
          const vs = p;
          while (p < n && !isWs(src[p]) && src[p] !== '>') p++;
          val = src.slice(vs, p);
        }
      }
      if (aname && !(aname in attrs)) attrs[aname] = decodeEntities(val);
    }
    i = p;
    textStart = i;
    if (!terminated) break; // 未闭合的标签：丢弃尾部
    if (isClose) {
      tokens.push({ type: 'close', name });
    } else {
      tokens.push({ type: 'open', name, attrs, selfClosing });
      if (RAW_TEXT.has(name) && !selfClosing) {
        const re = new RegExp('</' + name + '(?=[\\s/>]|$)', 'gi');
        re.lastIndex = i;
        const m = re.exec(src);
        const end = m ? m.index : n;
        if (end > i) tokens.push({ type: 'text', text: src.slice(i, end) });
        i = end;
        textStart = i;
      }
    }
  }
  pushText(n);
  return tokens;
}

const SKIP = new Set(['script', 'style', 'head', 'title', 'svg', 'math']);
const imgBlock = (src, alt) => ({ kind: 'img', src, text: String(alt ?? '').replace(/\s+/g, ' ').trim() });
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col', 'area', 'base', 'wbr', 'source', 'embed', 'param', 'track']);
const SOFT = new Set(['div', 'section', 'article', 'td', 'th', 'dd', 'dt', 'tr', 'table', 'thead', 'tbody', 'tfoot',
  'figure', 'figcaption', 'hr', 'aside', 'header', 'footer', 'main', 'dl', 'body', 'html', 'caption', 'form', 'fieldset', 'address', 'details', 'summary']);
const HEAD_KIND = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3' };
const STACKED = new Set(['p', 'li', 'blockquote', 'pre', 'ul', 'ol', ...Object.keys(HEAD_KIND)]);

function shouldSkipNav(attrs) {
  const t = (attrs['epub:type'] || attrs.role || '').toLowerCase();
  return /\b(landmarks|page-list|doc-pagelist)\b/.test(t);
}

function keep(text) {
  const stripped = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (!stripped) return false;
  if (/^\p{N}+$/u.test(stripped) && stripped.length <= 4) return false;
  return true;
}

/** 把收集到的表格做成一个块：rows 保留结构，text 是 Markdown 表格（给模型译、给界面渲染）。 */
function tableBlock(tb) {
  const rows = tb.rows.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim())).filter((r) => r.some((c) => c));
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  for (const r of rows) while (r.length < width) r.push('');
  if (!rows.some((r) => r.some((c) => keep(c)))) return null;
  return { kind: 'table', text: rowsToMarkdown(rows), rows, header: Boolean(tb.firstRowTh) };
}

/** rows → Markdown 表格（第一行当表头，单元格里的 | 转义）。 */
export function rowsToMarkdown(rows) {
  const esc = (c) => String(c ?? '').replace(/\|/g, '\\|');
  const line = (r) => '| ' + r.map(esc).join(' | ') + ' |';
  return [line(rows[0]), '|' + rows[0].map(() => ' --- |').join(''), ...rows.slice(1).map(line)].join('\n');
}

/** Markdown 表格 → rows（忽略分隔行；找不到表格返回 null）。 */
export function markdownToRows(text) {
  const rows = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line)) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
    rows.push(cells);
  }
  return rows.length ? rows : null;
}

const NOTE_MARK = /^(?:\d{1,4}|[ivx]{1,4}|[IVX]{1,4}|[*†‡]{1,4})$/;

/** 链接是否是脚注引用：内容是 <sup>、epub:type 含 noteref，或带 # 且文字是 ≤4 字符的数字/罗马数字/*†‡。 */
function isNoteRef(link, marker) {
  if (!marker) return false;
  if (link.sup) return true;
  if (/\bnoteref\b/i.test(link.type)) return true;
  return link.href.includes('#') && NOTE_MARK.test(marker);
}

export function htmlToBlocks(html) {
  const blocks = [];
  const stack = [];
  let buf = '';
  let skipName = null;
  let skipDepth = 0;
  let table = null; // {rows, row, cell, caption, inCaption}
  let anchor = null; // 当前块遇到的第一个 id
  let refs = []; // 当前块的脚注引用
  let link = null; // 正在读的 <a href>：{href, type, start, sup}
  let brPending = false; // 上一个 <br> 之后还没出现文字
  let brAt = 0;
  const noteAnchor = (attrs) => { if (anchor === null && attrs && attrs.id) anchor = attrs.id; };
  const take = (b) => {
    if (anchor !== null) b.anchor = anchor;
    if (refs.length) b.refs = refs;
    anchor = null;
    refs = [];
    return b;
  };

  const kindNow = () => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const s = stack[k];
      if (HEAD_KIND[s]) return HEAD_KIND[s];
      if (s === 'li') return 'li';
      if (s === 'pre') return 'p';
    }
    return stack.includes('blockquote') ? 'blockquote' : 'p';
  };
  const flush = () => {
    link = null; // 块边界打断链接：不当脚注处理，文字保留
    brPending = false;
    if (buf) {
      const text = buf.replace(/\s+/g, ' ').trim();
      buf = '';
      if (text) {
        if (keep(text)) blocks.push(take({ kind: kindNow(), text }));
        else { anchor = null; refs = []; }
      }
    } else refs = [];
  };
  const popTo = (name) => {
    const idx = stack.lastIndexOf(name);
    if (idx >= 0) stack.length = idx;
  };

  for (const t of tokenize(String(html))) {
    if (skipName) {
      if (skipName === 'svg' && !table && t.type === 'open' && t.name === 'image') {
        const href = t.attrs.href || t.attrs['xlink:href'];
        if (href) blocks.push(imgBlock(href, ''));
        continue;
      }
      if (t.type === 'open' && t.name === skipName && !t.selfClosing) skipDepth++;
      else if (t.type === 'close' && t.name === skipName) { if (--skipDepth === 0) skipName = null; }
      else if (skipName === 'head' && t.type === 'open' && t.name === 'body') skipName = null;
      continue;
    }
    if (table) {
      if (t.type === 'text') {
        if (table.cell !== null) table.cell += t.text;
        else if (table.inCaption) table.caption += t.text;
        continue;
      }
      const n = t.name;
      if (t.type === 'open') {
        if (SKIP.has(n)) { if (!t.selfClosing && !VOID.has(n)) { skipName = n; skipDepth = 1; } continue; }
        noteAnchor(t.attrs);
        if (n === 'tr') table.row = [];
        else if (n === 'td' || n === 'th') { if (!table.row) table.row = []; table.cell = ''; if (n === 'th' && table.rows.length === 0) table.firstRowTh = true; }
        else if (n === 'caption') table.inCaption = true;
        else if (n === 'br' || STACKED.has(n)) { if (table.cell !== null) table.cell += ' '; }
      } else if (n === 'td' || n === 'th') {
        if (table.row && table.cell !== null) table.row.push(table.cell);
        table.cell = null;
      } else if (n === 'tr') {
        if (table.row) table.rows.push(table.row);
        table.row = null;
      } else if (n === 'caption') {
        table.inCaption = false;
      } else if (n === 'table') {
        if (table.row) { if (table.cell !== null) table.row.push(table.cell); table.rows.push(table.row); }
        const caption = table.caption.replace(/\s+/g, ' ').trim();
        if (caption && keep(caption)) blocks.push({ kind: 'p', text: caption });
        const block = tableBlock(table);
        if (block) blocks.push(take(block)); else { anchor = null; refs = []; }
        table = null;
      }
      continue;
    }
    if (t.type === 'text') { buf += t.text; if (brPending && t.text.trim()) brPending = false; continue; }
    const name = t.name;
    if (name === 'a') {
      if (t.type === 'open') {
        noteAnchor(t.attrs);
        if (t.attrs.href !== undefined && !t.selfClosing) link = { href: t.attrs.href, type: t.attrs['epub:type'] || '', start: buf.length, sup: false };
        else link = null;
      } else if (link) {
        const marker = buf.slice(link.start).replace(/\s+/g, ' ').trim();
        // 位于块首的数字链接是注释段指回正文的「回链」，不是脚注引用，保留文字
        if (isNoteRef(link, marker) && buf.slice(0, link.start).trim() !== '') {
          buf = buf.slice(0, link.start);
          refs.push({ marker, href: link.href });
        }
        link = null;
      }
      continue;
    }
    if (link && name === 'sup' && t.type === 'open') link.sup = true;
    if (t.type === 'open' && name === 'table' && !t.selfClosing) {
      flush();
      table = { rows: [], row: null, cell: null, caption: '', inCaption: false, firstRowTh: false };
      continue;
    }
    if (t.type === 'open') {
      if (SKIP.has(name) || (name === 'nav' && shouldSkipNav(t.attrs))) {
        if (!t.selfClosing && !VOID.has(name)) { flush(); skipName = name; skipDepth = 1; }
        continue;
      }
      if (name === 'br') {
        // 连续两个 <br>（中间只有空白）是老式网页的段落分隔；单个 <br> 仍当空格
        if (brPending && buf.trim() === buf.slice(0, brAt).trim()) { flush(); brPending = false; continue; }
        buf += ' '; brPending = true; brAt = buf.length; continue;
      }
      if (name === 'img') {
        if (t.attrs.src) { flush(); blocks.push(imgBlock(t.attrs.src, t.attrs.alt)); }
        continue;
      }
      if (STACKED.has(name)) {
        flush();
        if ((name === 'p' || name === 'li' || HEAD_KIND[name]) && stack.length) {
          const top = stack[stack.length - 1];
          if (top === 'p' || HEAD_KIND[top] || (name === 'li' && top === 'li')) stack.pop();
        }
        if (!t.selfClosing) stack.push(name);
      } else if (SOFT.has(name)) {
        flush();
      }
      noteAnchor(t.attrs);
    } else if (STACKED.has(name)) {
      flush();
      popTo(name);
    } else if (SOFT.has(name)) {
      flush();
    }
  }
  flush();
  return blocks;
}
