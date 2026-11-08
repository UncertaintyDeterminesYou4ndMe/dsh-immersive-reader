/**
 * 样式：参照「汉译世界学术名著」那类纸书的版式——正文宋体、1px 细线分隔、单一强调色、无阴影无圆角。
 * 颜色尽量接 dsh 的主题 token（--dsw-alias-*），token 缺失时退到纸墨默认值，所以在深浅两套主题下都能读。
 */
const STYLE_ID = 'dsh-immersive-reader-style'

export const CSS = `
.ir-root {
  --ir-bg: var(--dsw-alias-bg-base, #faf9f6);
  --ir-bg-2: var(--dsw-alias-bg-layer-1, #f3f1ec);
  --ir-fg: var(--dsw-alias-label-primary, #1f1e1c);
  --ir-fg-2: var(--dsw-alias-label-secondary, #78736b);
  --ir-fg-3: var(--dsw-alias-label-tertiary, #a09b92);
  --ir-line: var(--dsw-alias-border-l2, #e4e1da);
  --ir-accent: var(--dsw-alias-brand-primary, #b03a2e);
  --ir-serif: "Songti SC", "Noto Serif SC", "Source Han Serif SC", "Georgia", serif;
  --ir-sans: -apple-system, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif;
  --ir-mono: ui-monospace, "SF Mono", Menlo, monospace;
  position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column;
  background: var(--ir-bg); color: var(--ir-fg); font-family: var(--ir-sans); font-size: 15px; line-height: 1.6;
}
.ir-root *, .ir-root *::before, .ir-root *::after { box-sizing: border-box; }
.ir-root button { font: inherit; color: inherit; background: none; border: 1px solid var(--ir-line); padding: 4px 10px; cursor: pointer; border-radius: 2px; }
.ir-root button:hover { border-color: var(--ir-fg-2); }
.ir-root button:disabled { opacity: .5; cursor: default; }
.ir-root button.ir-primary { border-color: var(--ir-fg); }
.ir-root button.ir-link { border: none; padding: 0; color: var(--ir-accent); }
.ir-root button.ir-link:hover { text-decoration: underline; }
.ir-root button.ir-plain { border: none; padding: 2px 6px; color: var(--ir-fg-2); }
.ir-root button.ir-plain:hover { color: var(--ir-fg); }
.ir-root input, .ir-root select, .ir-root textarea { font: inherit; color: inherit; background: var(--ir-bg); border: 1px solid var(--ir-line); padding: 5px 8px; border-radius: 2px; }
.ir-root input:focus, .ir-root select:focus, .ir-root textarea:focus { outline: none; border-color: var(--ir-fg-2); }
.ir-root a { color: var(--ir-accent); }

.ir-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--ir-line); min-height: 44px; flex: none; }
.ir-bar .ir-title { font-family: var(--ir-serif); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.ir-bar .ir-title small { color: var(--ir-fg-2); font-family: var(--ir-sans); font-size: 12px; margin-left: 8px; }
.ir-bar .ir-right { display: flex; gap: 6px; align-items: center; flex: none; }

.ir-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.ir-empty { padding: 48px 24px; color: var(--ir-fg-2); text-align: center; }
.ir-error { color: var(--ir-accent); padding: 8px 16px; border-bottom: 1px solid var(--ir-line); }
.ir-hint { color: var(--ir-fg-2); font-size: 13px; }

/* 书架 */
.ir-shelf { max-width: 46rem; margin: 0 auto; padding: 24px 20px 64px; }
.ir-shelf h1 { font-family: var(--ir-serif); font-weight: normal; font-size: 24px; margin: 0 0 4px; }
.ir-shelf .ir-lead { color: var(--ir-fg-2); margin: 0 0 24px; }
.ir-import { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid var(--ir-line); border-bottom: 1px solid var(--ir-line); margin-bottom: 8px; }
.ir-import input[type=text] { flex: 1; min-width: 200px; }
.ir-book { display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--ir-line); cursor: pointer; }
.ir-book:hover .ir-book-title { color: var(--ir-accent); }
.ir-book .ir-cover { flex: none; width: 44px; height: 62px; border: 1px solid var(--ir-line); display: flex; align-items: center; justify-content: center; font-family: var(--ir-serif); font-size: 18px; color: var(--ir-fg-2); overflow: hidden; }
.ir-book .ir-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ir-book .ir-book-main { flex: 1; min-width: 0; }
.ir-book-title { font-family: var(--ir-serif); font-size: 18px; margin: 0 0 2px; }
.ir-book-meta { color: var(--ir-fg-2); font-size: 13px; font-family: var(--ir-mono); }
.ir-book-actions { flex: none; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.ir-progress { height: 2px; background: var(--ir-line); margin-top: 8px; }
.ir-progress i { display: block; height: 100%; background: var(--ir-fg-2); }

/* 阅读 */
.ir-page { max-width: 44rem; margin: 0 auto; padding: 28px 24px 120px; font-family: var(--ir-serif); letter-spacing: .01em; }
.ir-chapter-title { font-weight: normal; font-size: 1.5em; line-height: 1.4; margin: 0 0 6px; }
.ir-chapter-sub { font-family: var(--ir-sans); font-size: 13px; color: var(--ir-fg-2); margin: 0 0 24px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.ir-intro { position: relative; border-top: 1px solid var(--ir-line); border-bottom: 1px solid var(--ir-line); padding: 12px 0; margin: 0 0 28px; font-family: var(--ir-sans); font-size: .9em; line-height: 1.75; color: var(--ir-fg-2); }
.ir-intro b { font-weight: normal; color: var(--ir-fg); margin-right: 8px; }
.ir-intro p { margin: 6px 0 0; }
.ir-para { margin: 0 0 1.1em; position: relative; }
.ir-para.ir-h1, .ir-para.ir-h2, .ir-para.ir-h3 { font-size: 1.2em; margin: 1.6em 0 .8em; }
.ir-para.ir-h1 { font-size: 1.35em; }
.ir-para.ir-li { padding-left: 1.2em; }
.ir-para.ir-li::before { content: "·"; position: absolute; left: .2em; }
.ir-para.ir-blockquote { padding-left: 1em; border-left: 1px solid var(--ir-line); color: var(--ir-fg-2); }
.ir-zh { cursor: pointer; }
.ir-zh:hover { color: var(--ir-accent); }
.ir-root[data-display="bilingual"] .ir-zh { cursor: text; }
.ir-root[data-display="bilingual"] .ir-zh:hover { color: inherit; }
.ir-src { font-family: "Georgia", "Times New Roman", var(--ir-serif); color: var(--ir-fg-2); font-size: .88em; line-height: 1.6; margin-top: .35em; }
.ir-root[data-display="original"] .ir-src { color: var(--ir-fg); font-size: 1em; margin-top: 0; line-height: inherit; }
.ir-pending { color: var(--ir-fg-3); font-family: var(--ir-sans); font-size: .8em; margin-left: 6px; }
.ir-note-mark { font-family: var(--ir-sans); font-size: .7em; color: var(--ir-accent); vertical-align: super; margin-left: 2px; cursor: pointer; }
.ir-note { font-family: var(--ir-sans); font-size: .82em; color: var(--ir-fg-2); border-left: 1px solid var(--ir-accent); padding-left: 10px; margin-top: .4em; line-height: 1.6; }
.ir-note b { font-weight: normal; color: var(--ir-accent); margin-right: 6px; }
.ir-figure { margin: 1.2em 0; text-align: center; }
.ir-figure img { max-width: 100%; height: auto; border: 1px solid var(--ir-line); }
.ir-figure figcaption { font-family: var(--ir-sans); font-size: .8em; color: var(--ir-fg-2); margin-top: 6px; }
.ir-session { border-top: 1px solid var(--ir-fg-2); border-bottom: 1px solid var(--ir-line); padding: 14px 0 16px; margin: 1.6em 0 2em; font-family: var(--ir-sans); font-size: .86em; line-height: 1.7; }
.ir-session-head { display: flex; gap: 12px; align-items: baseline; margin-bottom: 8px; }
.ir-session-head b { font-weight: normal; font-family: var(--ir-serif); font-size: 1.15em; }
.ir-session-head span { color: var(--ir-fg-2); }
.ir-session-actions { display: flex; gap: 8px; margin-top: 10px; }
.ir-recall p { margin: 6px 0; }
.ir-recall b { font-weight: normal; color: var(--ir-accent); margin-right: 8px; }
.ir-recall ol, .ir-recall ul { margin: 4px 0 8px; padding-left: 1.4em; }
.ir-recall li { margin: 2px 0; }
.ir-recall i { font-style: normal; font-family: var(--ir-serif); }
.ir-booktab { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.ir-booktab label { color: var(--ir-fg-2); margin-top: 6px; }
.ir-booktab textarea { min-height: 64px; resize: vertical; }
.ir-hl { text-decoration: underline; text-decoration-color: var(--ir-accent); text-decoration-thickness: 2px; text-underline-offset: 5px; }
.ir-root button.ir-fn { border: none; padding: 0 2px; font-family: var(--ir-sans); font-size: .7em; color: var(--ir-accent); vertical-align: super; }
.ir-root button.ir-fn:hover { text-decoration: underline; }
.ir-fn-body { display: block; }
.ir-hl-range { text-decoration: underline; text-decoration-color: var(--ir-accent); text-decoration-thickness: 2px; text-underline-offset: 5px; cursor: pointer; }
.ir-para { position: relative; }
.ir-sel-pop { position: absolute; z-index: 3; display: inline-flex; font-family: var(--ir-sans); font-size: 12px; line-height: 1; background: var(--ir-bg); border: 1px solid var(--ir-fg-2); user-select: none; }
.ir-root .ir-sel-pop button { border: none; border-radius: 0; padding: 7px 10px; color: var(--ir-accent); }
.ir-root .ir-sel-pop button + button { border-left: 1px solid var(--ir-line); }
.ir-root .ir-sel-pop button:hover { background: var(--ir-bg-2); }
.ir-ask { border-left-color: var(--ir-fg-2); white-space: pre-wrap; }
.ir-ask-anchor { text-decoration: underline dotted; text-decoration-color: var(--ir-fg-3); text-decoration-thickness: 1px; text-underline-offset: 5px; cursor: pointer; }
.ir-ask-anchor:hover, .ir-ask-anchor.ir-on { text-decoration-color: var(--ir-accent); }
.ir-ask-mark { font-family: var(--ir-sans); font-size: .7em; color: var(--ir-fg-3); vertical-align: super; margin-left: 2px; cursor: pointer; user-select: none; }
.ir-ask-mark:hover, .ir-ask-mark.ir-on { color: var(--ir-accent); }
.ir-ask-card { position: absolute; z-index: 4; box-sizing: border-box; max-height: 50vh; overflow-y: auto; background: var(--ir-bg); border: 1px solid var(--ir-fg-3); padding: 10px 12px; font-family: var(--ir-sans); font-size: 13px; line-height: 1.7; font-weight: normal; color: var(--ir-fg); text-align: left; text-indent: 0; }
.ir-ask-card .ir-ask-item { white-space: pre-wrap; }
.ir-ask-card .ir-ask-item + .ir-ask-item { border-top: 1px solid var(--ir-line); margin-top: 8px; padding-top: 8px; }
.ir-ask-card b { font-weight: normal; color: var(--ir-fg-2); margin-right: 6px; }
.ir-ask b { color: var(--ir-fg-2); }
.ir-ask .ir-ask-q { font-style: normal; color: var(--ir-fg); margin-right: 8px; }
.ir-ask .ir-ask-answer { display: block; margin-top: 4px; color: var(--ir-fg); }
.ir-root .ir-ask .ir-ask-del { color: var(--ir-fg-3); font-size: .9em; margin-top: 2px; }
.ir-root .ir-ask .ir-ask-del:hover { color: var(--ir-accent); }
.ir-para.ir-reading { border-left: 2px solid var(--ir-accent); margin-left: -14px; padding-left: 12px; }
.ir-root button.ir-plain.ir-reading-on { color: var(--ir-accent); }
.ir-progress-line { height: 2px; background: var(--ir-line); flex: none; }
.ir-progress-line i { display: block; height: 100%; width: 0; background: var(--ir-accent); }
.ir-root[data-font="sans"] .ir-page { font-family: var(--ir-sans); letter-spacing: 0; }
.ir-root[data-font="sans"] .ir-src { font-family: var(--ir-sans); }
.ir-booktab code { font-family: var(--ir-mono); font-size: .9em; word-break: break-all; }
.ir-hit-range { display: block; font-family: var(--ir-serif); text-decoration: underline; text-decoration-color: var(--ir-accent); text-underline-offset: 4px; margin: 2px 0; }
.ir-fn-src { display: block; color: var(--ir-fg-3); font-family: "Georgia", serif; margin-top: 2px; }
.ir-usernote { border-left-color: var(--ir-fg-2); cursor: text; }
.ir-usernote b { color: var(--ir-fg-2); }
.ir-hit { display: block; }
.ir-hit-body { display: block; font-family: var(--ir-sans); font-size: 13px; line-height: 1.5; white-space: normal; color: var(--ir-fg); }
.ir-hit-ch { display: block; font-size: 11px; color: var(--ir-fg-2); margin-bottom: 2px; }
.ir-table-wrap { overflow-x: auto; margin: .4em 0; }
.ir-table { border-collapse: collapse; font-family: var(--ir-sans); font-size: .82em; line-height: 1.5; min-width: 50%; }
.ir-table th, .ir-table td { border: 1px solid var(--ir-line); padding: 5px 10px; text-align: left; vertical-align: top; }
.ir-table th { font-weight: normal; color: var(--ir-fg-2); border-bottom: 1px solid var(--ir-fg-2); }
.ir-table-muted .ir-table { color: var(--ir-fg-2); font-family: "Georgia", serif; }
.ir-para-tools { font-family: var(--ir-sans); font-size: 12px; margin-top: 4px; display: flex; gap: 10px; }
.ir-retrans { font-family: var(--ir-sans); font-size: 13px; margin-top: 6px; display: flex; gap: 6px; }
.ir-retrans input { flex: 1; }
.ir-chapter-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--ir-line); font-family: var(--ir-sans); font-size: 14px; }
.ir-chapter-nav button { max-width: 48%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ir-status { font-family: var(--ir-sans); font-size: 12px; color: var(--ir-fg-2); max-width: 22em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ir-status.ir-busy::before { content: ""; display: inline-block; width: 6px; height: 6px; background: var(--ir-accent); margin-right: 6px; vertical-align: middle; }

/* 抽屉：目录 / 术语 / 设置 */
.ir-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(380px, 100%); background: var(--ir-bg); border-left: 1px solid var(--ir-line); display: flex; flex-direction: column; z-index: 5; }
.ir-drawer .ir-bar { padding: 8px 12px; }
.ir-drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 0 24px; }
.ir-toc-item { display: flex; gap: 10px; align-items: baseline; width: 100%; text-align: left; border: none; border-bottom: 1px solid var(--ir-line); padding: 9px 16px; border-radius: 0; }
.ir-toc-item:hover { background: var(--ir-bg-2); border-color: var(--ir-line); }
.ir-toc-item.ir-current { border-left: 2px solid var(--ir-accent); }
.ir-toc-item .ir-toc-title { flex: 1; min-width: 0; font-family: var(--ir-serif); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ir-toc-item .ir-toc-count { font-family: var(--ir-mono); font-size: 12px; color: var(--ir-fg-2); flex: none; }
.ir-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--ir-line); overflow-x: auto; }
.ir-tabs button { border: none; border-bottom: 1px solid transparent; border-radius: 0; margin-bottom: -1px; padding: 8px 11px; color: var(--ir-fg-2); white-space: nowrap; flex: none; }
.ir-tabs button.ir-on { color: var(--ir-fg); border-bottom-color: var(--ir-fg); }
.ir-gloss { padding: 6px 16px; border-bottom: 1px solid var(--ir-line); display: flex; gap: 8px; align-items: baseline; font-size: 14px; }
.ir-gloss .ir-term { font-family: "Georgia", serif; color: var(--ir-fg-2); flex: 1; }
.ir-gloss .ir-zh-term { font-family: var(--ir-serif); }
.ir-block { padding: 10px 16px; white-space: pre-wrap; font-size: 14px; line-height: 1.75; color: var(--ir-fg-2); border-bottom: 1px solid var(--ir-line); }

/* 设置 */
.ir-settings { max-width: 40rem; margin: 0 auto; padding: 16px 20px 64px; }
.ir-field { display: grid; grid-template-columns: 9em 1fr; gap: 8px 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--ir-line); }
.ir-field label { color: var(--ir-fg-2); font-size: 14px; }
.ir-field .ir-field-help { grid-column: 2; font-size: 12px; color: var(--ir-fg-3); }
.ir-field .ir-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ir-field textarea { width: 100%; min-height: 64px; resize: vertical; }
.ir-seg { display: inline-flex; border: 1px solid var(--ir-line); border-radius: 2px; }
.ir-seg button { border: none; border-radius: 0; padding: 4px 10px; color: var(--ir-fg-2); }
.ir-seg button + button { border-left: 1px solid var(--ir-line); }
.ir-seg button.ir-on { color: var(--ir-fg); background: var(--ir-bg-2); }

@media (max-width: 640px) {
  .ir-bar { padding: 8px 10px; }
  .ir-page { padding: 20px 16px 120px; }
  .ir-field { grid-template-columns: 1fr; }
  .ir-field .ir-field-help { grid-column: 1; }
}
`

export function ensureStyle(doc) {
  if (!doc || !doc.head) return
  // 插件更新后宿主可能还留着旧的样式标签：同 id 已存在就换成当前内容
  const existing = doc.getElementById(STYLE_ID)
  if (existing) { if (existing.textContent !== CSS) existing.textContent = CSS; return }
  const tag = doc.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  doc.head.appendChild(tag)
}
