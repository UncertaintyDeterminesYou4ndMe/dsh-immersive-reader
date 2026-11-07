import { unzipSync } from 'fflate';
import { htmlToBlocks, tokenize } from './html-text.js';

const MAX_UNZIPPED = 200 * 1024 * 1024;
const TEXTY = /\.(xml|opf|ncx|x?html?|xhtml)$/i;
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_IMAGES_TOTAL = 300 * 1024 * 1024;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const FONT_OBFUSCATION = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
]);

const local = (name) => name.slice(name.lastIndexOf(':') + 1);
const dec = new TextDecoder('utf-8');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

function safeDecodeURI(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** 相对 baseDir 解析 href：去 fragment/query、URL 解码、归一化 ./ ../。外部链接返回 null。 */
function resolvePath(baseDir, href) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  let h = href.split('#')[0].split('?')[0];
  h = safeDecodeURI(h);
  const parts = h.startsWith('/') ? [] : baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const seg of h.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function invalid() { return new Error('EPUB_INVALID'); }

function unzip(bytes) {
  let total = 0;
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter(f) {
        total += f.originalSize;
        if (total > MAX_UNZIPPED) throw new Error('EPUB_TOO_BIG');
        return TEXTY.test(f.name); // 图片/字体不解压
      },
    });
  } catch (e) {
    if (e && e.message === 'EPUB_TOO_BIG') throw e;
    throw invalid();
  }
  const lower = new Map();
  for (const k of Object.keys(files)) lower.set(k.toLowerCase(), k);
  const get = (name) => {
    if (files[name]) return files[name];
    const k = lower.get(name.toLowerCase());
    return k ? files[k] : undefined;
  };
  return get;
}

/** 二次解压：只取 wanted（zip 内路径，大小写不敏感）里的图片。单张 >20MB 跳过，累计 >300MB 后续跳过。 */
function extractImages(bytes, wanted) {
  const want = new Map([...wanted].map((p) => [p.toLowerCase(), p]));
  const out = {};
  if (!want.size) return out;
  let total = 0;
  try {
    const files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter(f) {
        if (!want.has(f.name.toLowerCase())) return false;
        if (f.originalSize > MAX_IMAGE || total + f.originalSize > MAX_IMAGES_TOTAL) return false;
        total += f.originalSize;
        return true;
      },
    });
    for (const [name, data] of Object.entries(files)) {
      const key = want.get(name.toLowerCase());
      if (key) out[key] = data;
    }
  } catch { /* 图片取不到就当没有 */ }
  return out;
}

function isEncrypted(xml) {
  let count = 0;
  let plain = 0; // 非字体混淆的 EncryptedData
  let cur = null;
  for (const t of tokenize(xml)) {
    if (t.type === 'open' && local(t.name) === 'encrypteddata') { count++; cur = { algo: null }; }
    else if (t.type === 'open' && local(t.name) === 'encryptionmethod' && cur) cur.algo = t.attrs.algorithm || '';
    else if (t.type === 'close' && local(t.name) === 'encrypteddata' && cur) {
      if (!cur.algo || !FONT_OBFUSCATION.has(cur.algo)) plain++;
      cur = null;
    }
  }
  if (cur && (!cur.algo || !FONT_OBFUSCATION.has(cur.algo))) plain++;
  return count > 0 && plain > 0;
}

function parseOpf(xml) {
  const meta = { title: '', creators: [], language: '' };
  const manifest = new Map();
  const spine = [];
  let spineToc = '';
  let coverId = '';
  let inMeta = false;
  let capture = null;
  let text = '';
  for (const t of tokenize(xml)) {
    if (t.type === 'open') {
      const n = local(t.name);
      if (n === 'metadata') inMeta = true;
      else if (inMeta && (n === 'title' || n === 'creator' || n === 'language') && !t.selfClosing) { capture = n; text = ''; }
      else if (n === 'item') {
        if (t.attrs.id && t.attrs.href !== undefined) manifest.set(t.attrs.id, {
          id: t.attrs.id, href: t.attrs.href, type: (t.attrs['media-type'] || '').toLowerCase(),
          props: (t.attrs.properties || '').split(/\s+/).filter(Boolean),
        });
      } else if (inMeta && n === 'meta' && (t.attrs.name || '').toLowerCase() === 'cover' && t.attrs.content) coverId = t.attrs.content;
      else if (n === 'spine') spineToc = t.attrs.toc || '';
      else if (n === 'itemref' && t.attrs.idref) spine.push({ idref: t.attrs.idref, linear: (t.attrs.linear || 'yes').toLowerCase() !== 'no' });
    } else if (t.type === 'text') {
      if (capture) text += t.text;
    } else {
      const n = local(t.name);
      if (n === 'metadata') inMeta = false;
      if (capture && n === capture) {
        const v = collapse(text);
        if (v) {
          if (capture === 'title') { if (!meta.title) meta.title = v; }
          else if (capture === 'creator') { if (!meta.creators.includes(v)) meta.creators.push(v); }
          else if (!meta.language) meta.language = v;
        }
        capture = null;
      }
    }
  }
  return { meta, manifest, spine, spineToc, coverId };
}

function parseNavToc(xml, navDir) {
  const out = [];
  let navDepth = 0;
  let inToc = false;
  let a = null;
  for (const t of tokenize(xml)) {
    if (t.type === 'open' && t.name === 'nav') {
      if (inToc) navDepth++;
      else if (/\btoc\b/.test(t.attrs['epub:type'] || '')) { inToc = true; navDepth = 1; }
    } else if (t.type === 'close' && t.name === 'nav' && inToc) {
      if (--navDepth === 0) { inToc = false; if (out.length) break; }
    } else if (inToc && t.type === 'open' && t.name === 'a' && !t.selfClosing) {
      a = { href: t.attrs.href || '', text: '' };
    } else if (inToc && t.type === 'close' && t.name === 'a' && a) {
      const p = resolvePath(navDir, a.href);
      const title = collapse(a.text);
      if (p && title) out.push([p, title]);
      a = null;
    } else if (a && t.type === 'text') a.text += t.text;
  }
  return out;
}

function parseNcx(xml, ncxDir) {
  const entries = [];
  const stack = [];
  let inLabel = false;
  let inText = false;
  for (const t of tokenize(xml)) {
    if (t.type === 'open') {
      const n = local(t.name);
      if (n === 'navpoint') { const e = { title: '', src: '' }; entries.push(e); if (!t.selfClosing) stack.push(e); }
      else if (n === 'navlabel') inLabel = true;
      else if (n === 'text' && inLabel) inText = true;
      else if (n === 'content' && stack.length) stack[stack.length - 1].src = t.attrs.src || '';
    } else if (t.type === 'close') {
      const n = local(t.name);
      if (n === 'navpoint') stack.pop();
      else if (n === 'navlabel') inLabel = false;
      else if (n === 'text') inText = false;
    } else if (inText && stack.length) {
      const e = stack[stack.length - 1];
      e.title += t.text;
    }
  }
  const out = [];
  for (const e of entries) {
    const p = resolvePath(ncxDir, e.src);
    const title = collapse(e.title);
    if (p && title) out.push([p, title]);
  }
  return out;
}

/**
 * @param {Uint8Array|Buffer} bytes
 * @param {{filename?: string}} [options] 仅在 OPF 没有书名时用作书名后备
 */
/** 作者字段常见垃圾：同一人的「姓, 名」变体、方括号别名、calibre 塞进去的短 id（如 cj5） */
function cleanCreators(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const v = raw.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!v) continue;
    if (v.length <= 4 && !/\s/.test(v) && !/[\u4e00-\u9fff]/.test(v)) continue;
    const key = v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').split('').sort().join('');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export { cleanCreators };

export async function parseEpub(bytes, options = {}) {
  const get = unzip(bytes);
  const text = (name) => { const b = get(name); return b ? dec.decode(b) : null; };

  const enc = text('META-INF/encryption.xml');
  if (enc && isEncrypted(enc)) throw new Error('EPUB_ENCRYPTED');

  const container = text('META-INF/container.xml');
  if (!container) throw invalid();
  let opfPath = '';
  for (const t of tokenize(container)) {
    if (t.type === 'open' && local(t.name) === 'rootfile' && t.attrs['full-path']) { opfPath = resolvePath('', t.attrs['full-path']); break; }
  }
  const opfXml = opfPath ? text(opfPath) : null;
  if (!opfXml) throw invalid();

  const opfDir = dirname(opfPath);
  const { meta, manifest, spine, spineToc, coverId } = parseOpf(opfXml);

  // 目录：EPUB3 nav 优先，其次 NCX
  const tocTitle = new Map();
  const addToc = (pairs) => { for (const [p, title] of pairs) if (!tocTitle.has(p)) tocTitle.set(p, title); };
  for (const item of manifest.values()) {
    if (item.props.includes('nav')) {
      const p = resolvePath(opfDir, item.href);
      const x = p && text(p);
      if (x) addToc(parseNavToc(x, dirname(p)));
      break;
    }
  }
  if (!tocTitle.size) {
    const ncx = (spineToc && manifest.get(spineToc)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
    if (ncx) {
      const p = resolvePath(opfDir, ncx.href);
      const x = p && text(p);
      if (x) addToc(parseNcx(x, dirname(p)));
    }
  }

  // manifest 里的图片：小写 zip 路径集合
  const imageItems = new Set();
  for (const item of manifest.values()) {
    const ip = resolvePath(opfDir, item.href);
    if (ip && (item.type.startsWith('image/') || IMAGE_EXT.test(ip))) imageItems.add(ip.toLowerCase());
  }
  const wanted = new Set();

  const raw = [];
  for (const ref of spine) {
    if (!ref.linear) continue;
    const item = manifest.get(ref.idref);
    if (!item || item.props.includes('nav')) continue;
    if (!/html|xml/.test(item.type)) continue;
    const p = resolvePath(opfDir, item.href);
    const x = p && text(p);
    if (x == null) continue;
    const blocks = [];
    for (const b of htmlToBlocks(x)) {
      if (b.kind !== 'img') { blocks.push(b); continue; }
      const ip = resolvePath(dirname(p), b.src);
      if (!ip || !imageItems.has(ip.toLowerCase())) continue;
      wanted.add(ip);
      blocks.push({ ...b, src: ip });
    }
    // 只有图片没有文字的文档（封面页、整页插图）不单独成章
    if (!blocks.some((b) => b.kind !== 'img')) continue;
    if (!blocks.length) continue;
    let title = tocTitle.get(p) || '';
    if (!title) { const h = blocks.find((b) => b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3'); if (h) title = h.text; }
    raw.push({ title, blocks, path: p });
  }

  // 封面
  let cover;
  const coverItem = [...manifest.values()].find((m) => m.props.includes('cover-image')) || (coverId && manifest.get(coverId));
  if (coverItem) {
    const cp = resolvePath(opfDir, coverItem.href);
    if (cp && (coverItem.type.startsWith('image/') || IMAGE_EXT.test(cp))) { cover = cp; wanted.add(cp); }
  }

  const assets = extractImages(bytes, wanted);
  if (cover && !assets[cover]) cover = undefined;
  for (const r of raw) r.blocks = r.blocks.filter((b) => b.kind !== 'img' || assets[b.src]);

  // 锚点索引：(zip 路径小写, anchor) → 段落 id（同一锚点取第一个）
  const anchorIndex = new Map();
  const anchorKey = (path, a) => `${path.toLowerCase()}#${a}`;
  const kept = raw.filter((r) => r.blocks.length);
  const chapters = kept.map((r, i) => {
    const id = `c${i + 1}`;
    return {
      id,
      title: r.title || `第 ${i + 1} 节`,
      paragraphs: r.blocks.map((b, j) => {
        const pid = `${id}p${j + 1}`;
        if (b.anchor) { const k = anchorKey(r.path, b.anchor); if (!anchorIndex.has(k)) anchorIndex.set(k, pid); }
        return { id: pid, kind: b.kind, text: b.text, ...(b.kind === 'img' ? { src: b.src } : {}), ...(b.rows ? { rows: b.rows, header: Boolean(b.header) } : {}), ...(b.anchor ? { anchor: b.anchor } : {}) };
      }),
    };
  });
  // 脚注引用：所有文档解析完后再解析目标（可能指向后面的文档）
  kept.forEach((r, i) => {
    r.blocks.forEach((b, j) => {
      if (!b.refs) return;
      const notes = b.refs.map((ref) => {
        const hi = ref.href.indexOf('#');
        const filePart = hi < 0 ? ref.href : ref.href.slice(0, hi);
        const frag = hi < 0 ? '' : safeDecodeURI(ref.href.slice(hi + 1));
        const target = filePart ? resolvePath(dirname(r.path), filePart) : r.path;
        const paraId = target && frag ? anchorIndex.get(anchorKey(target, frag)) : undefined;
        return { marker: ref.marker, ...(paraId ? { paraId } : {}) };
      });
      chapters[i].paragraphs[j].notes = notes;
    });
  });

  const fname = (options.filename || '').replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  return {
    title: meta.title || fname,
    author: cleanCreators(meta.creators).join(', '),
    language: meta.language,
    source: 'epub',
    chapters,
    assets,
    ...(cover ? { cover } : {}),
  };
}
