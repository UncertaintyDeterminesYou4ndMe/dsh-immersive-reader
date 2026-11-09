/**
 * dsh-immersive-reader · 浏览器半 —— 构建产物，不要手改（node build.mjs 从 src/client/ 生成）。
 * 只 require 宿主给的 react；界面全部是 slot 里的 React 组件。
 */
window.__ModuleLoader__.load({
  id: "dsh-immersive-reader",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/client/index.jsx
var exports_client = {};
__export(exports_client, {
  inject: () => inject,
  apply: () => apply,
  PanelPage: () => PanelPage,
  PanelIcon: () => PanelIcon
});
module.exports = __toCommonJS(exports_client);
var import_react4 = __toESM(require("react"));

// src/client/api.js
var API_BASE = "/api/immersive-reader";
async function call(method, path, { json, body, headers } = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      credentials: "same-origin",
      headers: { ...json !== undefined ? { "content-type": "application/json" } : {}, ...headers ?? {} },
      body: json !== undefined ? JSON.stringify(json) : body
    });
  } catch (error) {
    throw new Error("连不上 dsh 宿主，检查它是否还在运行");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!data || typeof data !== "object")
    throw new Error(`宿主返回了异常响应（HTTP ${res.status}）`);
  if (!data.ok) {
    const error = new Error(data.error?.message ?? "操作失败");
    error.code = data.error?.code;
    throw error;
  }
  return data.value;
}
var api = {
  books: () => call("GET", "/books"),
  importFile: (file) => call("POST", "/books/import", { body: file, headers: { "content-type": "application/octet-stream", "x-filename": encodeURIComponent(file.name) } }),
  importPath: (path) => call("POST", "/books/import-path", { json: { path } }),
  importUrl: (url) => call("POST", "/books/import-url", { json: { url } }),
  book: (id) => call("GET", `/books/${id}`),
  removeBook: (id) => call("DELETE", `/books/${id}`),
  chapter: (id, cid) => call("GET", `/books/${id}/chapters/${cid}`),
  saveState: (id, state) => call("POST", `/books/${id}/state`, { json: state }),
  translate: (id, options) => call("POST", `/books/${id}/translate`, { json: options ?? {} }),
  retranslate: (id, paraIds, instruction) => call("POST", `/books/${id}/retranslate`, { json: { paraIds, instruction } }),
  cancel: (id) => call("POST", `/books/${id}/cancel`, { json: {} }),
  status: (id) => call("GET", `/books/${id}/status`),
  glossary: (id, entry) => call("POST", `/books/${id}/glossary`, { json: entry }),
  bookSettings: (id) => call("GET", `/books/${id}/settings`),
  saveBookSettings: (id, patch) => call("POST", `/books/${id}/settings`, { json: patch }),
  session: (id, extend) => call("GET", `/books/${id}/session${extend ? "?extend=1" : ""}`),
  recall: (id) => call("POST", `/books/${id}/session/recall`, { json: {} }),
  recallBook: (id) => call("POST", `/books/${id}/recall-book`, { json: {} }),
  search: (id, q) => call("GET", `/books/${id}/search?q=${encodeURIComponent(q)}`),
  paragraph: (id, pid) => call("GET", `/books/${id}/paragraphs/${pid}`),
  marks: (id) => call("GET", `/books/${id}/marks`),
  setMark: (id, paraId, patch) => call("POST", `/books/${id}/marks`, { json: { paraId, ...patch } }),
  stats: (id, payload) => call("POST", `/books/${id}/stats`, { json: payload }),
  ask: (id, payload) => call("POST", `/books/${id}/ask`, { json: payload }),
  asks: (id) => call("GET", `/books/${id}/asks`),
  removeAsk: (id, askId) => call("DELETE", `/books/${id}/asks/${askId}`),
  exportBook: (id, params) => call("GET", `/books/${id}/export?${new URLSearchParams(params)}`),
  settings: () => call("GET", "/settings"),
  saveSettings: (patch) => call("POST", "/settings", { json: patch }),
  models: () => call("GET", "/models")
};

// src/client/style.js
var STYLE_ID = "dsh-immersive-reader-style";
var CSS = `
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

.ir-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; padding-left: max(16px, var(--dsh-frame-leading-clearance, 0px)); border-bottom: 1px solid var(--ir-line); min-height: 44px; flex: none; }
.ir-bar .ir-title { font-family: var(--ir-serif); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.ir-bar .ir-title small { color: var(--ir-fg-2); font-family: var(--ir-sans); font-size: 12px; margin-left: 8px; }
.ir-bar .ir-right { display: flex; gap: 6px; align-items: center; flex: none; }

.ir-scroll { flex: 1; min-height: 0; overflow-y: auto; }
/* 宿主在 macOS 上没有系统标题栏：带 data-window-drag 的元素才能拖动窗口（按钮等自动排除）。书架没有顶栏，留一条和宿主插件页同高的拖动带。 */
.ir-dragband { flex: none; height: var(--dsh-frame-top-clearance, 0px); }
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
.ir-book-title small { display: block; font-size: 13px; color: var(--ir-fg-2); }
.ir-book-meta { color: var(--ir-fg-2); font-size: 13px; font-family: var(--ir-mono); }
.ir-book-actions { flex: none; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.ir-progress { height: 2px; background: var(--ir-line); margin-top: 8px; }
.ir-progress i { display: block; height: 100%; background: var(--ir-fg-2); }

/* 阅读 */
.ir-page { max-width: 44rem; margin: 0 auto; padding: 28px 24px 120px; font-family: var(--ir-serif); letter-spacing: .01em; }
.ir-chapter-title { font-weight: normal; font-size: 1.5em; line-height: 1.4; margin: 0 0 6px; }
.ir-chapter-orig { font-size: .8em; color: var(--ir-fg-2); margin: -2px 0 8px; }
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
.ir-ctx { position: absolute; z-index: 6; min-width: 150px; padding: 4px 0; font-family: var(--ir-sans); font-size: 13px; line-height: 1.4; background: var(--ir-bg); border: 1px solid var(--ir-fg-3); user-select: none; }
.ir-ctx-head { padding: 4px 14px 6px; font-size: 12px; color: var(--ir-fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.ir-root .ir-ctx button { display: block; width: 100%; text-align: left; border: none; border-radius: 0; padding: 5px 14px; background: none; color: var(--ir-fg); font: inherit; cursor: default; }
.ir-root .ir-ctx button:hover { background: var(--ir-bg-2); }
.ir-ctx hr { border: none; border-top: 1px solid var(--ir-line); margin: 4px 0; }
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
.ir-progress-line { position: relative; z-index: 3; height: 2px; background: var(--ir-line); flex: none; }
.ir-progress-line i { display: block; height: 100%; width: 0; background: var(--ir-accent); }
/* 进度线上的标记：按钮是 10px 宽的热区，看得见的只有一道细刻度 */
.ir-root .ir-mk { position: absolute; top: -4px; width: 10px; height: 14px; margin-left: -5px; padding: 0; border: none; border-radius: 0; background: none; cursor: pointer; }
.ir-mk::after { content: ""; position: absolute; left: 4px; top: 4px; width: 2px; height: 6px; background: var(--ir-fg-3); }
/* 书签做成带缺口的小书签条，和「上次读到」的细竖线分得开（有的主题强调色就是墨色） */
.ir-mk-bookmark::after { left: 2px; top: 2px; width: 6px; height: 10px; background: var(--ir-accent); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%); }
.ir-mk-resume::after { height: 10px; background: var(--ir-fg); }
.ir-mk:hover::after { background: var(--ir-accent); }
.ir-mk-tip { display: none; position: absolute; top: 16px; left: 50%; transform: translateX(-50%); width: max-content; max-width: 320px; padding: 6px 10px; background: var(--ir-bg); border: 1px solid var(--ir-fg-3); font-family: var(--ir-sans); font-size: 12px; line-height: 1.6; color: var(--ir-fg); text-align: left; white-space: normal; pointer-events: none; }
.ir-mk-tip.ir-tip-l { left: 0; transform: none; }
.ir-mk-tip.ir-tip-r { left: auto; right: 0; transform: none; }
.ir-mk-tip b { display: block; font-weight: normal; color: var(--ir-fg-2); }
.ir-mk:hover .ir-mk-tip, .ir-mk:focus-visible .ir-mk-tip { display: block; }
/* 加了书签的段落：左边距里一枚小书签，形状和进度线上的一致 */
.ir-bookmarked { position: relative; }
.ir-bookmarked::after { content: ""; position: absolute; left: -18px; top: .35em; width: 8px; height: 12px; background: var(--ir-accent); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%); }
.ir-root button.ir-icon { display: inline-flex; align-items: center; padding: 2px 4px; }
.ir-root button.ir-icon svg { display: block; }
.ir-root button.ir-icon.ir-on { color: var(--ir-accent); }
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
  .ir-bar { padding: 8px 10px; padding-left: max(10px, var(--dsh-frame-leading-clearance, 0px)); }
  .ir-page { padding: 20px 16px 120px; }
  .ir-field { grid-template-columns: 1fr; }
  .ir-field .ir-field-help { grid-column: 1; }
}
`;
var PLUGIN_ID = "dsh-immersive-reader";
function ensureStyle(doc) {
  if (!doc || !doc.head)
    return;
  const existing = doc.getElementById(STYLE_ID);
  if (existing) {
    existing.setAttribute("data-plugin", PLUGIN_ID);
    if (existing.textContent !== CSS)
      existing.textContent = CSS;
    return;
  }
  const tag = doc.createElement("style");
  tag.id = STYLE_ID;
  tag.setAttribute("data-plugin", PLUGIN_ID);
  tag.textContent = CSS;
  doc.head.appendChild(tag);
}

// src/client/Shelf.jsx
var import_react = __toESM(require("react"));
function bookMinutes(book) {
  const zhLike = /^zh/i.test(book.language || "") || /[\u4e00-\u9fff]/.test(book.title || "");
  return Math.max(1, Math.round((book.chars || 0) * (zhLike ? 1 : 0.3) / 400));
}
function planText(book, sessionMinutes) {
  const minutes = bookMinutes(book);
  const left = Math.round(minutes * (1 - (book.paragraphs ? book.translated / book.paragraphs : 0)));
  const hours = minutes >= 90 ? `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} 小时` : `${minutes} 分钟`;
  const per = Math.max(5, Number(sessionMinutes) || 30);
  const days = Math.max(1, Math.ceil(minutes / per));
  return `全书约 ${hours}，每天 ${per} 分钟约 ${days} 天${left > 0 && left < minutes ? `，按已译进度还剩约 ${Math.ceil(left / per)} 天` : ""}`;
}
function Shelf({ settings, onOpen, onSettings }) {
  const [books, setBooks] = import_react.useState(null);
  const [error, setError] = import_react.useState("");
  const [busy, setBusy] = import_react.useState("");
  const [path, setPath] = import_react.useState("");
  const fileRef = import_react.useRef(null);
  const reload = async () => {
    try {
      setBooks(await api.books());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  import_react.useEffect(() => {
    reload();
  }, []);
  const importFile = async (file) => {
    if (!file)
      return;
    setBusy(`正在导入 ${file.name}…`);
    try {
      const book = await api.importFile(file);
      await reload();
      setBusy("");
      onOpen(book.id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };
  const importPath = async () => {
    const p = path.trim();
    if (!p)
      return;
    const isUrl = /^https?:\/\//i.test(p);
    setBusy(isUrl ? `正在抓取 ${p}…` : `正在导入 ${p}…`);
    try {
      const book = isUrl ? await api.importUrl(p) : await api.importPath(p);
      setPath("");
      await reload();
      setBusy("");
      onOpen(book.id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };
  const remove = async (book) => {
    if (!window.confirm(`删除《${book.title}》及其全部译文？划线、笔记与追问会先导出一份 Markdown 留在书库 exports 目录。`))
      return;
    try {
      const r = await api.removeBook(book.id);
      await reload();
      if (r?.kept)
        setBusy(`已删除；笔记备份在 ${r.kept}`);
    } catch (e) {
      setError(e.message);
    }
  };
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-dragband",
    "data-window-drag": ""
  }), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-scroll"
  }, /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-shelf"
  }, /* @__PURE__ */ import_react.default.createElement("h1", null, "阅读室"), /* @__PURE__ */ import_react.default.createElement("p", {
    className: "ir-lead"
  }, "导入原版书或网页文章，按章节由模型精译，用母语读，点一下看原文；读不懂的地方选中就能追问。"), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-import"
  }, /* @__PURE__ */ import_react.default.createElement("button", {
    className: "ir-primary",
    onClick: () => fileRef.current?.click(),
    disabled: Boolean(busy)
  }, "导入 EPUB / TXT / Markdown"), /* @__PURE__ */ import_react.default.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".epub,.txt,.md,.markdown",
    style: { display: "none" },
    onChange: (e) => {
      importFile(e.target.files?.[0]);
      e.target.value = "";
    }
  }), /* @__PURE__ */ import_react.default.createElement("input", {
    type: "text",
    placeholder: "或填本机文件的绝对路径、网页链接",
    value: path,
    onChange: (e) => setPath(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter")
        importPath();
    }
  }), /* @__PURE__ */ import_react.default.createElement("button", {
    onClick: importPath,
    disabled: Boolean(busy) || !path.trim()
  }, /^https?:\/\//i.test(path.trim()) ? "抓取网页" : "导入路径"), /* @__PURE__ */ import_react.default.createElement("button", {
    className: "ir-plain",
    onClick: onSettings
  }, "设置")), busy ? /* @__PURE__ */ import_react.default.createElement("p", {
    className: "ir-hint"
  }, busy) : null, error ? /* @__PURE__ */ import_react.default.createElement("p", {
    className: "ir-error",
    style: { padding: "8px 0" }
  }, error) : null, books === null ? /* @__PURE__ */ import_react.default.createElement("p", {
    className: "ir-empty"
  }, "读取书架…") : null, books && books.length === 0 ? /* @__PURE__ */ import_react.default.createElement("p", {
    className: "ir-empty"
  }, "书架还是空的。导入一本书试试，也可以在聊天里让 agent 调 reader_import。") : null, books && books.map((book) => /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-book",
    key: book.id,
    onClick: () => onOpen(book.id)
  }, /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-cover"
  }, book.coverFile ? /* @__PURE__ */ import_react.default.createElement("img", {
    src: `${API_BASE}/books/${book.id}/assets/${book.coverFile}`,
    alt: ""
  }) : (book.title || "书").slice(0, 1)), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-book-main"
  }, /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-book-title",
    title: book.title
  }, book.titleZh || book.title, book.titleZh ? /* @__PURE__ */ import_react.default.createElement("small", null, book.title) : null), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-book-meta"
  }, book.author ? `${book.author} · ` : "", book.source === "web" ? "网页 · " : "", book.chapters, " 章 · ", book.paragraphs, " 段 · 已译 ", book.translated, book.currentChapter ? ` · 读到「${book.currentChapter.slice(0, 24)}」` : "", book.stats && book.stats.minutes > 0 ? ` · 读了 ${book.stats.minutes} 分钟 / ${book.stats.days} 天${book.stats.streak > 1 ? `，连续 ${book.stats.streak} 天` : ""}` : ""), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-book-meta"
  }, planText(book, settings?.sessionMinutes)), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-progress"
  }, /* @__PURE__ */ import_react.default.createElement("i", {
    style: { width: `${book.paragraphs ? Math.round(100 * book.translated / book.paragraphs) : 0}%` }
  }))), /* @__PURE__ */ import_react.default.createElement("div", {
    className: "ir-book-actions",
    onClick: (e) => e.stopPropagation()
  }, /* @__PURE__ */ import_react.default.createElement("button", {
    className: "ir-plain",
    onClick: () => remove(book)
  }, "删除")))))));
}

// src/client/Reader.jsx
var import_react2 = __toESM(require("react"));

// src/client/host.js
var askAgentImpl = null;
function setAskAgent(fn) {
  askAgentImpl = fn;
}
function askAgent(prompt) {
  if (typeof askAgentImpl !== "function")
    return false;
  try {
    return askAgentImpl(prompt) !== false;
  } catch (error) {
    console.warn("[immersive-reader] 交给 agent 失败", error);
    return false;
  }
}
function resolveAskAgent(ctx) {
  const pick = () => {
    try {
      const service = (typeof ctx.get === "function" ? ctx.get("uiWorkspace", false) : undefined) ?? ctx.uiWorkspace;
      return service && typeof service.startSession === "function" ? service : null;
    } catch {
      return null;
    }
  };
  return (prompt) => {
    const service = pick();
    if (!service)
      return false;
    service.startSession(undefined, { prompt, whenDraftExists: "append" });
    return true;
  };
}

// src/client/Reader.jsx
var DISPLAY_LABEL = { zh: "译文", bilingual: "双语", original: "原文" };
var DISPLAY_ORDER = ["zh", "bilingual", "original"];
var ASK_LABEL = { explain: "解释", intent: "这段在说什么", custom: "追问" };
var ZH_PER_MINUTE = 400;
function tt(o, display) {
  return display !== "original" && o?.titleZh || o?.title || "";
}
function statusText(status, unfinished) {
  if (!status)
    return "";
  const n = (status.queued ?? 0) + (status.running ?? 0);
  if (n > 0)
    return `后台翻译中：还有 ${n} 段`;
  if (unfinished && status.errors && status.errors.length > 0)
    return `翻译出错：${status.errors[0].message}`;
  return "";
}
function readingChars(p) {
  if (p.kind === "img")
    return 0;
  return p.zh ? p.zh.length : Math.round(p.text.length * 0.3);
}
function minutesOf(paragraphs) {
  const chars = paragraphs.reduce((n, p) => n + readingChars(p), 0);
  return Math.max(1, Math.round(chars / ZH_PER_MINUTE));
}
function Reader({ bookId, settings, onBack, onSettings, onDisplayChange }) {
  const [book, setBook] = import_react2.useState(null);
  const [chapter, setChapter] = import_react2.useState(null);
  const [error, setError] = import_react2.useState("");
  const [drawer, setDrawer] = import_react2.useState("");
  const [status, setStatus] = import_react2.useState(null);
  const [session, setSession] = import_react2.useState(null);
  const [recalling, setRecalling] = import_react2.useState(false);
  const [marks, setMarks] = import_react2.useState({});
  const [asks, setAsks] = import_react2.useState([]);
  const [stats, setStats] = import_react2.useState(null);
  const seenParas = import_react2.useRef(new Set);
  const scrollRef = import_react2.useRef(null);
  const pendingScroll = import_react2.useRef(null);
  const stateTimer = import_react2.useRef(null);
  const lastSaved = import_react2.useRef("");
  const progressRef = import_react2.useRef(null);
  const currentPara = import_react2.useRef(null);
  const [reading, setReading] = import_react2.useState(null);
  const speech = import_react2.useRef({ token: 0 });
  const display = settings.display ?? "zh";
  const tocRunning = import_react2.useRef(false);
  const bookmarkRef = import_react2.useRef(null);
  const [resume, setResume] = import_react2.useState(null);
  const loadBook = import_react2.useCallback(async () => {
    const info = await api.book(bookId);
    setBook(info);
    setStatus(info.status);
    setMarks(info.marks ?? {});
    setAsks(info.asks ?? []);
    setStats(info.stats ?? null);
    return info;
  }, [bookId]);
  const loadChapter = import_react2.useCallback(async (cid, paraId) => {
    const data = await api.chapter(bookId, cid);
    setChapter(data);
    setStatus(data.status);
    if (paraId !== undefined)
      pendingScroll.current = paraId;
    return data;
  }, [bookId]);
  import_react2.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await loadBook();
        if (cancelled)
          return;
        const cid = info.state?.chapterId && info.chapters.some((c) => c.id === info.state.chapterId) ? info.state.chapterId : info.startChapterId ?? info.chapters[0]?.id;
        if (!cid) {
          setError("这本书没有可读的章节");
          return;
        }
        if (info.state?.chapterId && info.state.paraId)
          setResume({ chapterId: info.state.chapterId, paraId: info.state.paraId });
        await loadChapter(cid, info.state?.chapterId === cid ? info.state.paraId ?? null : null);
        api.saveState(bookId, { chapterId: cid, paraId: info.state?.paraId }).then((r) => setStatus(r.status)).catch(() => {});
        api.session(bookId).then(setSession).catch(() => {});
      } catch (e) {
        if (!cancelled)
          setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, loadBook, loadChapter]);
  import_react2.useEffect(() => {
    if (!chapter)
      return;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    const root = scrollRef.current;
    if (!root)
      return;
    if (target) {
      const el = root.querySelector(`[data-para="${target}"]`);
      if (el) {
        el.scrollIntoView({ block: "start" });
        return;
      }
    }
    root.scrollTop = 0;
    progressRef.current?.(0);
    bookmarkRef.current?.(chapter.paragraphs[0]?.id ?? null);
  }, [chapter?.id]);
  const unfinished = import_react2.useMemo(() => chapter ? chapter.paragraphs.some((p) => p.kind !== "img" && !p.zh) : false, [chapter]);
  const busy = status ? (status.queued ?? 0) + (status.running ?? 0) > 0 : false;
  import_react2.useEffect(() => {
    if (!chapter || !(busy || unfinished))
      return;
    const timer = setInterval(async () => {
      try {
        const data = await api.chapter(bookId, chapter.id);
        setChapter((prev) => prev && prev.id === data.id ? data : prev);
        setStatus(data.status);
        if (!data.paragraphs.some((p) => p.kind !== "img" && !p.zh) && data.status.queued + data.status.running === 0) {
          loadBook().catch(() => {});
        }
      } catch {}
    }, 4000);
    return () => clearInterval(timer);
  }, [bookId, chapter?.id, busy, unfinished, loadBook]);
  const tocBusy = Boolean(status?.toc);
  import_react2.useEffect(() => {
    if (tocRunning.current && !tocBusy)
      loadBook().catch(() => {});
    tocRunning.current = tocBusy;
  }, [tocBusy, loadBook]);
  const topParagraph = import_react2.useCallback(() => {
    const root = scrollRef.current;
    if (!root)
      return { current: null, index: 0, nodes: [] };
    const top = root.getBoundingClientRect().top + 8;
    const nodes = root.querySelectorAll("[data-para]");
    for (let i = 0;i < nodes.length; i++) {
      if (nodes[i].getBoundingClientRect().bottom >= top)
        return { current: nodes[i].dataset.para, index: i, nodes };
    }
    return { current: null, index: 0, nodes };
  }, []);
  const onScroll = import_react2.useCallback(() => {
    const root = scrollRef.current;
    if (!root || !chapter)
      return;
    const { current, index, nodes } = topParagraph();
    if (!current)
      return;
    currentPara.current = current;
    bookmarkRef.current?.(current);
    const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
    progressRef.current?.(atEnd ? nodes.length : index);
    seenParas.current.add(current);
    const key = `${chapter.id}:${current}`;
    if (key === lastSaved.current)
      return;
    clearTimeout(stateTimer.current);
    stateTimer.current = setTimeout(() => {
      lastSaved.current = key;
      api.saveState(bookId, { chapterId: chapter.id, paraId: current }).then((r) => setStatus(r.status)).catch(() => {});
    }, 1200);
  }, [bookId, chapter, topParagraph]);
  import_react2.useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key === "ArrowRight" && chapter?.next)
        goChapter(chapter.next);
      else if (e.key === "ArrowLeft" && chapter?.prev)
        goChapter(chapter.prev);
      else if (e.key === "b")
        toggleBookmark();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  import_react2.useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible")
        return;
      const paragraphs = seenParas.current.size;
      seenParas.current = new Set;
      api.stats(bookId, { seconds: 60, paragraphs }).then(setStats).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [bookId]);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  const stopReading = import_react2.useCallback(() => {
    speech.current.token += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    setReading(null);
  }, []);
  import_react2.useEffect(() => stopReading, [chapter?.id, stopReading]);
  const pickVoice = async (lang) => {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length === 0) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 800);
        synth.addEventListener("voiceschanged", () => {
          clearTimeout(t);
          resolve();
        }, { once: true });
      });
      voices = synth.getVoices();
    }
    const want = lang.toLowerCase();
    const match = (v) => v.lang && v.lang.toLowerCase().replace("_", "-");
    return voices.find((v) => match(v) === want) || voices.find((v) => match(v)?.startsWith(want.split("-")[0])) || null;
  };
  const startReading = async (fromParaId) => {
    if (!chapter)
      return;
    if (!canSpeak) {
      setError("这个宿主没有语音合成，没法朗读");
      return;
    }
    stopReading();
    const token = speech.current.token;
    const synth = window.speechSynthesis;
    const useSrc = display === "original";
    const list = chapter.paragraphs.filter((p) => p.kind !== "img" && (useSrc ? p.text : p.zh));
    if (list.length === 0) {
      setError("这一章还没有可读的译文");
      return;
    }
    let i = Math.max(0, list.findIndex((p) => p.id === (fromParaId ?? currentPara.current)));
    const lang = useSrc ? book?.language || "en" : "zh-CN";
    const voice = await pickVoice(lang);
    if (!voice) {
      setError(`系统里没有${useSrc ? "原文语言" : "中文"}语音，没法朗读`);
      return;
    }
    if (speech.current.token !== token)
      return;
    const rate = Math.min(2, Math.max(0.5, Number(settings.speechRate) || 1));
    const speakNext = () => {
      if (speech.current.token !== token)
        return;
      if (i >= list.length) {
        setReading(null);
        return;
      }
      const p = list[i++];
      const text = (useSrc ? p.text : p.zh).replace(/\|/g, "，").replace(/-{3,}/g, " ");
      const u = new window.SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      u.onend = () => speakNext();
      u.onerror = (e) => {
        if (speech.current.token !== token)
          return;
        if (e.error !== "interrupted" && e.error !== "canceled") {
          setError(`朗读失败：${e.error}`);
          setReading(null);
        }
      };
      setReading(p.id);
      const el = scrollRef.current?.querySelector(`[data-para="${p.id}"]`);
      const root = scrollRef.current;
      if (el && root) {
        const r = el.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        if (r.top < rr.top || r.bottom > rr.bottom)
          el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      synth.speak(u);
    };
    speakNext();
  };
  const setMark = async (paraId, patch) => {
    try {
      setMarks(await api.setMark(bookId, paraId, patch));
    } catch (e) {
      setError(e.message);
    }
  };
  const toggleBookmark = () => {
    if (!chapter)
      return;
    const pid = topParagraph().current ?? chapter.paragraphs[0]?.id;
    if (!pid)
      return;
    bookmarkRef.current?.(pid);
    setMark(pid, { bookmark: !marks[pid]?.bookmark });
  };
  const asksBy = import_react2.useMemo(() => {
    const m = {};
    for (const a of asks) {
      (m[a.paraId] ??= []).push(a);
    }
    return m;
  }, [asks]);
  const doAsk = async (paraId, input) => {
    const item = await api.ask(bookId, { paraId, ...input });
    setAsks((prev) => [...prev, item]);
    return item;
  };
  const removeAsk = async (askId) => {
    try {
      setAsks(await api.removeAsk(bookId, askId));
    } catch (e) {
      setError(e.message);
    }
  };
  const extendSession = async () => {
    try {
      setSession(await api.session(bookId, true));
      const data = await api.chapter(bookId, chapter.id);
      setChapter(data);
      setStatus(data.status);
    } catch (e) {
      setError(e.message);
    }
  };
  const [recallingBook, setRecallingBook] = import_react2.useState(false);
  const doRecallBook = async () => {
    setRecallingBook(true);
    try {
      const bookRecall = await api.recallBook(bookId);
      setBook((b) => b ? { ...b, bookRecall } : b);
    } catch (e) {
      setError(e.message);
    } finally {
      setRecallingBook(false);
    }
  };
  const doRecall = async () => {
    setRecalling(true);
    try {
      const recall = await api.recall(bookId);
      setSession((s) => s ? { ...s, recall } : s);
    } catch (e) {
      setError(e.message);
    } finally {
      setRecalling(false);
    }
  };
  const goChapter = async (cid, paraId = null) => {
    if (!cid)
      return;
    setDrawer("");
    try {
      if (chapter && chapter.id === cid && paraId) {
        const el = scrollRef.current?.querySelector(`[data-para="${paraId}"]`);
        if (el) {
          el.scrollIntoView({ block: "start" });
          return;
        }
      }
      await loadChapter(cid, paraId);
      lastSaved.current = `${cid}:${paraId ?? ""}`;
      const r = await api.saveState(bookId, { chapterId: cid, paraId });
      setStatus(r.status);
    } catch (e) {
      setError(e.message);
    }
  };
  const translateChapter = async () => {
    if (!chapter)
      return;
    try {
      const r = await api.translate(bookId, { chapterId: chapter.id });
      setStatus(r.status);
    } catch (e) {
      setError(e.message);
    }
  };
  const cycleDisplay = () => {
    const next = DISPLAY_ORDER[(DISPLAY_ORDER.indexOf(display) + 1) % DISPLAY_ORDER.length];
    onDisplayChange(next);
  };
  const chapterMeta = book && chapter ? book.chapters.find((c) => c.id === chapter.id) : null;
  const markers = import_react2.useMemo(() => {
    if (!chapter)
      return [];
    const out = [];
    chapter.paragraphs.forEach((p, index) => {
      const m = marks[p.id];
      const kinds = [];
      if (m?.bookmark)
        kinds.push("书签");
      if (resume?.chapterId === chapter.id && resume.paraId === p.id)
        kinds.push("上次读到");
      if (m?.highlight || m?.ranges?.length)
        kinds.push("划线");
      if (m?.note)
        kinds.push("笔记");
      if (asksBy[p.id]?.length)
        kinds.push("追问");
      if (!kinds.length)
        return;
      const text = m?.ranges?.[0] ?? m?.note ?? asksBy[p.id]?.[0]?.selection ?? (display === "original" ? p.text : p.zh || p.text) ?? "";
      out.push({ paraId: p.id, index, kinds, text: text.length > 60 ? text.slice(0, 60) + "…" : text });
    });
    return out;
  }, [chapter, marks, asksBy, resume, display]);
  const chapterMinutes = chapter ? minutesOf(chapter.paragraphs) : 0;
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-root-inner",
    style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }
  }, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-bar",
    "data-window-drag": ""
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: onBack
  }, "‹ 书架"), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-title",
    title: book ? book.title : ""
  }, book ? tt(book, display) : "…", chapter ? /* @__PURE__ */ import_react2.default.createElement("small", null, tt(chapter, display)) : null), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-right"
  }, session ? /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-status",
    title: "今日份：按设置的阅读时长切出的这一段"
  }, "第 ", session.day, " 天 · 全书 ", Math.round(100 * session.position / Math.max(1, session.total)), "%") : null, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: `ir-status${busy ? " ir-busy" : ""}`,
    title: statusText(status, unfinished)
  }, statusText(status, unfinished)), canSpeak ? /* @__PURE__ */ import_react2.default.createElement("button", {
    className: `ir-plain${reading ? " ir-reading-on" : ""}`,
    onClick: () => reading ? stopReading() : startReading(),
    title: reading ? "停止朗读" : "从当前位置朗读译文（原文模式读原文）"
  }, reading ? "停止" : "朗读") : null, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: cycleDisplay,
    title: "切换显示：译文 / 双语 / 原文"
  }, DISPLAY_LABEL[display]), /* @__PURE__ */ import_react2.default.createElement(BookmarkButton, {
    marks,
    onToggle: toggleBookmark,
    register: (fn) => {
      bookmarkRef.current = fn;
    }
  }), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: () => setDrawer(drawer === "toc" ? "" : "toc")
  }, "目录"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: onSettings
  }, "设置"))), chapter ? /* @__PURE__ */ import_react2.default.createElement(ProgressLine, {
    key: chapter.id,
    total: chapter.paragraphs.length,
    markers,
    onJump: (pid) => goChapter(chapter.id, pid),
    register: (fn) => {
      progressRef.current = fn;
    }
  }) : null, error ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-error"
  }, error, " ", /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => setError("")
  }, "关闭")) : null, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-scroll",
    ref: scrollRef,
    onScroll
  }, chapter ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-page",
    style: { fontSize: `${settings.fontSize || 18}px`, lineHeight: settings.lineHeight || 1.9 }
  }, /* @__PURE__ */ import_react2.default.createElement("h1", {
    className: "ir-chapter-title"
  }, tt(chapter, display)), tt(chapter, display) !== chapter.title ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-chapter-orig"
  }, chapter.title) : null, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-chapter-sub"
  }, /* @__PURE__ */ import_react2.default.createElement("span", null, chapter.index + 1, " / ", book?.chapters.length ?? "?"), /* @__PURE__ */ import_react2.default.createElement("span", null, "约 ", chapterMinutes, " 分钟"), /* @__PURE__ */ import_react2.default.createElement("span", null, chapterMeta ? `${chapterMeta.translated}/${chapterMeta.translatable ?? chapterMeta.paragraphs} 段已译` : ""), unfinished && !busy ? /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: translateChapter
  }, "译这一章") : null, busy ? /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => api.cancel(bookId).then(() => api.status(bookId)).then(setStatus).catch(() => {})
  }, "停止") : null), chapter.index === 0 && book?.intro ? /* @__PURE__ */ import_react2.default.createElement(IntroBlock, {
    label: "导读",
    paraId: "intro:book",
    text: book.intro,
    asks: asksBy["intro:book"],
    onAsk: (input) => doAsk("intro:book", input),
    onRemoveAsk: removeAsk
  }) : null, chapter.intro ? /* @__PURE__ */ import_react2.default.createElement(IntroBlock, {
    label: "本章导读",
    paraId: `intro:${chapter.id}`,
    text: chapter.intro,
    asks: asksBy[`intro:${chapter.id}`],
    onAsk: (input) => doAsk(`intro:${chapter.id}`, input),
    onRemoveAsk: removeAsk
  }) : null, chapter.paragraphs.map((p) => /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, {
    key: p.id
  }, /* @__PURE__ */ import_react2.default.createElement(Paragraph, {
    p,
    display,
    bookId,
    book,
    chapter,
    mark: marks[p.id],
    asks: asksBy[p.id],
    reading: reading === p.id,
    onRead: canSpeak ? () => startReading(p.id) : null,
    onMark: (patch) => setMark(p.id, patch),
    onAsk: (input) => doAsk(p.id, input),
    onRemoveAsk: removeAsk,
    onUpdated: (zh, note) => setChapter((prev) => prev ? { ...prev, paragraphs: prev.paragraphs.map((q) => q.id === p.id ? { ...q, zh, note } : q) } : prev)
  }), session && session.to === p.id ? /* @__PURE__ */ import_react2.default.createElement(SessionCard, {
    session,
    stats,
    recalling,
    onRecall: doRecall,
    onExtend: extendSession
  }) : null)), !chapter.next && book ? /* @__PURE__ */ import_react2.default.createElement(FinishCard, {
    book,
    stats,
    busy: recallingBook,
    onRecall: doRecallBook,
    onExport: () => setDrawer("toc:book")
  }) : null, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-chapter-nav"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    disabled: !chapter.prev,
    onClick: () => goChapter(chapter.prev)
  }, "‹ ", tt(book?.chapters.find((c) => c.id === chapter.prev), display) || "上一章"), /* @__PURE__ */ import_react2.default.createElement("button", {
    disabled: !chapter.next,
    onClick: () => goChapter(chapter.next)
  }, tt(book?.chapters.find((c) => c.id === chapter.next), display) || "下一章", " ›"))) : /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-empty"
  }, error ? "" : "打开中…")), drawer.startsWith("toc") && book ? /* @__PURE__ */ import_react2.default.createElement(TocDrawer, {
    key: drawer,
    initialTab: drawer === "toc:book" ? "book" : "toc",
    book,
    display,
    current: chapter?.id,
    marks,
    asks,
    onClose: () => setDrawer(""),
    onGo: goChapter,
    onBookChanged: loadBook,
    onRetranslateChapter: async () => {
      if (!chapter)
        return;
      try {
        const r = await api.translate(bookId, { chapterId: chapter.id, force: true });
        setStatus(r.status);
        setDrawer("");
      } catch (e) {
        setError(e.message);
      }
    }
  }) : null);
}
function BookmarkButton({ marks, onToggle, register }) {
  const [pid, setPid] = import_react2.useState(null);
  import_react2.useEffect(() => {
    register(setPid);
    return () => register(null);
  }, [register]);
  const on = Boolean(pid && marks?.[pid]?.bookmark);
  return /* @__PURE__ */ import_react2.default.createElement("button", {
    className: `ir-plain ir-icon${on ? " ir-on" : ""}`,
    onClick: onToggle,
    "aria-pressed": on,
    "aria-label": on ? "取消书签" : "加书签",
    title: `${on ? "取消这里的书签" : "在当前位置加书签"}（快捷键 B）`
  }, /* @__PURE__ */ import_react2.default.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: on ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false"
  }, /* @__PURE__ */ import_react2.default.createElement("path", {
    d: "M7 3.5h10v17l-5-4.2-5 4.2z"
  })));
}
function ProgressLine({ total, register, markers = [], onJump }) {
  const [index, setIndex] = import_react2.useState(0);
  import_react2.useEffect(() => {
    register(setIndex);
    return () => register(null);
  }, [register]);
  const pct = total > 0 ? Math.min(100, Math.round(100 * index / total)) : 0;
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-progress-line"
  }, /* @__PURE__ */ import_react2.default.createElement("i", {
    style: { width: `${pct}%` },
    title: `本章 ${pct}%`
  }), markers.map((mk) => {
    const at = total > 0 ? 100 * mk.index / total : 0;
    const kind = mk.kinds.includes("书签") ? "bookmark" : mk.kinds.includes("上次读到") ? "resume" : "note";
    const side = at < 20 ? "ir-tip-l" : at > 80 ? "ir-tip-r" : "";
    return /* @__PURE__ */ import_react2.default.createElement("button", {
      key: mk.paraId,
      className: `ir-mk ir-mk-${kind}`,
      style: { left: `${at}%` },
      onClick: () => onJump?.(mk.paraId),
      "aria-label": mk.kinds.join("、")
    }, /* @__PURE__ */ import_react2.default.createElement("span", {
      className: `ir-mk-tip ${side}`
    }, /* @__PURE__ */ import_react2.default.createElement("b", null, mk.kinds.join(" · ")), mk.text));
  }));
}
function FinishCard({ book, stats, busy, onRecall, onExport }) {
  const r = book.bookRecall;
  const done = book.chapters.every((c) => c.translated >= (c.translatable ?? c.paragraphs));
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session ir-finish"
  }, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session-head"
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "全书到此"), /* @__PURE__ */ import_react2.default.createElement("span", null, book.chapters.length, " 章", stats && stats.minutes > 0 ? ` · 共读了 ${stats.minutes} 分钟，${stats.days} 天` : "", done ? "" : " · 还有章节没译完")), r ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-recall"
  }, /* @__PURE__ */ import_react2.default.createElement("p", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "全书论证"), r.summary), r.threads?.length ? /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "贯穿的线索"), /* @__PURE__ */ import_react2.default.createElement("ul", null, r.threads.map((t, i) => /* @__PURE__ */ import_react2.default.createElement("li", {
    key: i
  }, t)))) : null, r.questions?.length ? /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "跨章回想"), /* @__PURE__ */ import_react2.default.createElement("ol", null, r.questions.map((q, i) => /* @__PURE__ */ import_react2.default.createElement("li", {
    key: i
  }, q)))) : null, r.next ? /* @__PURE__ */ import_react2.default.createElement("p", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "接着读"), r.next) : null) : /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, "合上书，先自己把全书的论证顺一遍；再让模型按各章导读和你每一份的回想整理一版对照。"), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session-actions"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-primary",
    onClick: onRecall,
    disabled: busy
  }, busy ? "整理中…" : r ? "重新整理全书回想" : "回想全书"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: onExport
  }, "导出划线与笔记")));
}
function SessionCard({ session, stats, recalling, onRecall, onExtend }) {
  const r = session.recall;
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session"
  }, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session-head"
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "今日份到此"), /* @__PURE__ */ import_react2.default.createElement("span", null, "第 ", session.day, " 天 · ", session.paragraphs, " 段", session.extended ? ` · 已加读 ${session.extended} 份` : "", stats ? ` · 今天 ${stats.today.minutes} 分钟 · 累计 ${stats.minutes} 分钟 · 连续 ${stats.streak} 天` : "")), r ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-recall"
  }, /* @__PURE__ */ import_react2.default.createElement("p", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "论证脉络"), r.summary), r.questions?.length ? /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "回想一下"), /* @__PURE__ */ import_react2.default.createElement("ol", null, r.questions.map((q, i) => /* @__PURE__ */ import_react2.default.createElement("li", {
    key: i
  }, q)))) : null, r.terms?.length ? /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("b", null, "这一份的关键概念"), /* @__PURE__ */ import_react2.default.createElement("ul", null, r.terms.map((t, i) => /* @__PURE__ */ import_react2.default.createElement("li", {
    key: i
  }, /* @__PURE__ */ import_react2.default.createElement("i", null, t.zh || t.term), t.zh ? `（${t.term}）` : "", t.note ? `：${t.note}` : "")))) : null) : /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, "读完先合上书回想一遍，再对照模型整理的论证脉络和问题。"), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session-actions"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-primary",
    onClick: onRecall,
    disabled: recalling
  }, recalling ? "整理中…" : r ? "重新整理回想" : "回想本次论证"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: onExtend
  }, "再读一份")));
}
function mdRows(text) {
  const rows = [];
  for (const raw of String(text ?? "").split(`
`)) {
    const line = raw.trim();
    if (!line.startsWith("|"))
      continue;
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line))
      continue;
    rows.push(line.replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim()));
  }
  return rows;
}
function TableView({ text, muted, header }) {
  const rows = mdRows(text);
  if (rows.length === 0)
    return /* @__PURE__ */ import_react2.default.createElement("div", {
      className: muted ? "ir-src" : ""
    }, text);
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: `ir-table-wrap${muted ? " ir-table-muted" : ""}`
  }, /* @__PURE__ */ import_react2.default.createElement("table", {
    className: "ir-table"
  }, /* @__PURE__ */ import_react2.default.createElement("tbody", null, rows.map((r, i) => /* @__PURE__ */ import_react2.default.createElement("tr", {
    key: i
  }, r.map((c, j) => i === 0 && header ? /* @__PURE__ */ import_react2.default.createElement("th", {
    key: j
  }, c) : /* @__PURE__ */ import_react2.default.createElement("td", {
    key: j
  }, c)))))));
}
function Footnote({ bookId, note }) {
  const [open, setOpen] = import_react2.useState(false);
  const [data, setData] = import_react2.useState(null);
  const toggle = async () => {
    if (!open && !data && note.paraId) {
      try {
        const para = await api.paragraph(bookId, note.paraId);
        setData(para);
        if (!para.zh && para.kind !== "img") {
          api.retranslate(bookId, [note.paraId]).then((r) => {
            const it = r.items?.[note.paraId];
            if (it)
              setData((d) => ({ ...d ?? para, zh: it.zh }));
          }).catch(() => {});
        }
      } catch (e) {
        setData({ text: e.message });
      }
    }
    setOpen((v) => !v);
  };
  return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-fn",
    onClick: (e) => {
      e.stopPropagation();
      toggle();
    },
    title: "脚注"
  }, "[", note.marker, "]"), open ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-note ir-fn-body",
    onClick: (e) => e.stopPropagation()
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "注 ", note.marker), note.paraId ? data ? /* @__PURE__ */ import_react2.default.createElement("span", null, data.zh || data.text, data.zh ? /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-fn-src"
  }, data.text) : /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-pending"
  }, "译文生成中…")) : "载入中…" : "这个脚注在书里找不到对应的注释") : null);
}
function splitAsks(text, asks) {
  const groups = new Map;
  const rest = [];
  for (const a of asks ?? []) {
    if (text && a.selection && text.includes(a.selection)) {
      if (!groups.has(a.selection))
        groups.set(a.selection, []);
      groups.get(a.selection).push(a);
    } else
      rest.push(a);
  }
  return { groups, rest };
}
function Annotated({ text, ranges, onRemove, groups, ctl }) {
  const cuts = [];
  for (const [sel, list] of groups ?? []) {
    const at = text.indexOf(sel);
    if (at >= 0)
      cuts.push({ start: at, end: at + sel.length, ids: list.map((a) => a.id) });
  }
  for (const r of ranges ?? []) {
    const at = text.indexOf(r);
    if (at >= 0)
      cuts.push({ start: at, end: at + r.length, r });
  }
  if (cuts.length === 0)
    return text;
  cuts.sort((a, b) => a.start - b.start || (a.ids ? -1 : 1));
  const out = [];
  let pos = 0;
  for (const c of cuts) {
    if (c.start < pos)
      continue;
    if (c.start > pos)
      out.push(text.slice(pos, c.start));
    const piece = text.slice(c.start, c.end);
    if (c.ids) {
      const on = ctl.card && ctl.card.ids.join() === c.ids.join();
      out.push(/* @__PURE__ */ import_react2.default.createElement("span", {
        key: c.start,
        className: `ir-ask-anchor${on ? " ir-on" : ""}`,
        ...ctl.anchorProps(c.ids)
      }, piece));
    } else {
      out.push(/* @__PURE__ */ import_react2.default.createElement("span", {
        key: c.start,
        className: "ir-hl-range",
        title: "点击取消这段划线",
        onClick: (e) => {
          e.stopPropagation();
          onRemove(c.r);
        }
      }, piece));
    }
    pos = c.end;
  }
  if (pos < text.length)
    out.push(text.slice(pos));
  return out;
}
function useAskCard(hostRef) {
  const [card, setCard] = import_react2.useState(null);
  const hideTimer = import_react2.useRef(null);
  const cardRef = import_react2.useRef(null);
  const show = (ids, el, pinned) => {
    clearTimeout(hideTimer.current);
    const host = hostRef.current?.getBoundingClientRect();
    if (!host || !el)
      return;
    const r = el.getBoundingClientRect();
    const w = Math.min(480, host.width);
    setCard({ ids, pinned, w, x: Math.max(0, Math.min(r.left - host.left, host.width - w)), y: r.bottom - host.top });
  };
  const keep = () => clearTimeout(hideTimer.current);
  const hideSoon = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCard((c) => c && !c.pinned ? null : c), 300);
  };
  const anchorProps = (ids) => ({
    "data-ask": ids.join(" "),
    onMouseEnter: (e) => {
      if (!card?.pinned)
        show(ids, e.currentTarget, false);
    },
    onMouseLeave: hideSoon,
    onMouseUp: (e) => e.stopPropagation(),
    onClick: (e) => {
      e.stopPropagation();
      if (card?.pinned && card.ids.join() === ids.join())
        setCard(null);
      else
        show(ids, e.currentTarget, true);
    }
  });
  const openFor = (id) => {
    const el = hostRef.current?.querySelector(`[data-ask~="${id}"]`);
    if (el)
      show(el.dataset.ask.split(" "), el, true);
  };
  import_react2.useEffect(() => {
    if (!card?.pinned)
      return;
    const onDown = (e) => {
      if (cardRef.current?.contains(e.target))
        return;
      if (hostRef.current?.contains(e.target) && e.target.closest?.("[data-ask]"))
        return;
      setCard(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape")
        setCard(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [card?.pinned]);
  const openRef = import_react2.useRef(openFor);
  openRef.current = openFor;
  import_react2.useEffect(() => {
    const onOpen = (e) => openRef.current(e.detail);
    window.addEventListener("ir-open-ask", onOpen);
    return () => {
      window.removeEventListener("ir-open-ask", onOpen);
      clearTimeout(hideTimer.current);
    };
  }, []);
  return { card, cardRef, anchorProps, openFor, keep, hideSoon };
}
function AskCard({ ctl, asks, onRemove }) {
  const { card } = ctl;
  if (!card)
    return null;
  const list = (asks ?? []).filter((a) => card.ids.includes(a.id));
  if (list.length === 0)
    return null;
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-ask-card",
    ref: ctl.cardRef,
    style: { left: card.x, top: card.y, width: card.w },
    onMouseEnter: ctl.keep,
    onMouseLeave: ctl.hideSoon,
    onClick: (e) => e.stopPropagation(),
    onMouseUp: (e) => e.stopPropagation()
  }, list.map((a) => /* @__PURE__ */ import_react2.default.createElement("div", {
    key: a.id,
    className: "ir-ask ir-ask-item"
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, ASK_LABEL[a.kind] ?? "追问"), a.selection ? /* @__PURE__ */ import_react2.default.createElement("i", {
    className: "ir-ask-q"
  }, "「", a.selection, "」") : null, a.kind === "custom" && a.question ? /* @__PURE__ */ import_react2.default.createElement("i", {
    className: "ir-ask-q"
  }, a.question) : null, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-ask-answer"
  }, a.answer), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link ir-ask-del",
    onClick: () => onRemove(a.id)
  }, "删除"))));
}
function AskMark({ asks, ctl }) {
  if (!asks || asks.length === 0)
    return null;
  const ids = asks.map((a) => a.id);
  const on = ctl.card && ctl.card.ids.join() === ids.join();
  return /* @__PURE__ */ import_react2.default.createElement("span", {
    className: `ir-ask-mark${on ? " ir-on" : ""}`,
    title: "追问",
    ...ctl.anchorProps(ids)
  }, "问", asks.length > 1 ? asks.length : "");
}
function AskPending({ asking }) {
  if (!asking)
    return null;
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-note ir-ask",
    onClick: (e) => e.stopPropagation()
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, asking.label), asking.detail ? /* @__PURE__ */ import_react2.default.createElement("i", {
    className: "ir-ask-q"
  }, asking.detail) : null, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-pending"
  }, "思考中…"));
}
function selectedText(host) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed)
    return "";
  const range = sel.getRangeAt(0);
  if (host && !range.intersectsNode(host))
    return "";
  const frag = range.cloneContents();
  frag.querySelectorAll(".ir-ask-mark, .ir-note-mark, .ir-fn, .ir-sel-pop, .ir-ctx, button").forEach((n) => n.remove());
  return (frag.textContent || "").trim();
}
function clearSelection() {
  try {
    window.getSelection()?.removeAllRanges();
  } catch {}
}
function useTextMenu(hostRef, locate) {
  const [selection, setSelection] = import_react2.useState(null);
  const [menu, setMenu] = import_react2.useState(null);
  const menuRef = import_react2.useRef(null);
  const lastTouch = import_react2.useRef(0);
  const onMouseDown = (e) => {
    if (e.button === 2 || e.button === 0 && e.ctrlKey)
      e.preventDefault();
  };
  const onContextMenu = (e) => {
    if (Date.now() - lastTouch.current < 1500)
      return;
    const host = hostRef.current?.getBoundingClientRect();
    if (!host)
      return;
    e.preventDefault();
    const text = selectedText(hostRef.current);
    setSelection(null);
    setMenu({ x: Math.max(0, Math.min(e.clientX - host.left, host.width - 168)), y: e.clientY - host.top + 2, text, where: text ? locate(text) : null });
  };
  const closeMenu = import_react2.useCallback(() => setMenu(null), []);
  import_react2.useEffect(() => {
    if (!menu)
      return;
    const onDown = (ev) => {
      if (ev.composedPath().includes(menuRef.current))
        return;
      setMenu(null);
      if (ev.button !== 0)
        return;
      const swallow = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, true), 600);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        setMenu(null);
      }
    };
    const onClose = () => setMenu(null);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [menu]);
  import_react2.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu)
      return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8)
      el.style.top = `${Math.max(0, menu.y - r.height - 4)}px`;
  }, [menu]);
  const popFromTouch = () => {
    const sel = window.getSelection();
    const text = selectedText(hostRef.current);
    if (!text || text.length > 600) {
      setSelection(null);
      return;
    }
    const where = locate(text);
    const host = hostRef.current?.getBoundingClientRect();
    if (!where || !host) {
      setSelection(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelection({ text, where, x: Math.max(0, rect.left - host.left), y: rect.bottom - host.top + 4 });
  };
  const clear = () => {
    setSelection(null);
    setMenu(null);
    clearSelection();
  };
  const handlers = {
    onMouseDown,
    onContextMenu,
    onTouchStart: () => {
      lastTouch.current = Date.now();
    },
    onTouchEnd: () => {
      lastTouch.current = Date.now();
      setTimeout(popFromTouch, 350);
    }
  };
  return { selection, menu, menuRef, closeMenu, handlers, clear };
}
function TextMenu({ menu, menuRef, items, onClose }) {
  if (!menu)
    return null;
  const list = items.filter(Boolean).filter((it, i, a) => it !== "-" || i > 0 && i < a.length - 1 && a[i - 1] !== "-");
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-ctx",
    ref: menuRef,
    role: "menu",
    style: { left: menu.x, top: menu.y },
    onMouseUp: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation(),
    onContextMenu: (e) => {
      e.preventDefault();
      e.stopPropagation();
    }
  }, menu.text ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-ctx-head"
  }, "「", menu.text.length > 16 ? `${menu.text.slice(0, 16)}…` : menu.text, "」") : null, list.map((it, i) => it === "-" ? /* @__PURE__ */ import_react2.default.createElement("hr", {
    key: i
  }) : /* @__PURE__ */ import_react2.default.createElement("button", {
    key: i,
    role: "menuitem",
    onMouseDown: (e) => e.preventDefault(),
    onClick: () => {
      onClose();
      it.run();
    }
  }, it.label)));
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    try {
      document.execCommand("copy");
    } catch {}
  }
}
function useAsk(onAsk, placeholder, onDone) {
  const [open, setOpen] = import_react2.useState(false);
  const [sel, setSel] = import_react2.useState("");
  const [draft, setDraft] = import_react2.useState("");
  const [asking, setAsking] = import_react2.useState(null);
  const [err, setErr] = import_react2.useState("");
  const run = async ({ selection = "", question = "", kind }) => {
    setErr("");
    setAsking({ label: ASK_LABEL[kind], detail: kind === "explain" ? `「${selection}」` : kind === "custom" ? question : "" });
    try {
      const item = await onAsk({ selection, question, kind });
      if (item?.id && onDone)
        setTimeout(() => onDone(item), 80);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAsking(null);
    }
  };
  const submit = () => {
    const q = draft.trim();
    if (!q)
      return;
    run({ selection: sel, question: q, kind: "custom" });
    setOpen(false);
    setDraft("");
    setSel("");
  };
  const openFor = (text = "") => {
    setSel(text);
    setDraft("");
    setOpen(true);
  };
  const toggle = () => {
    setSel("");
    setOpen((v) => !v);
  };
  const row = open ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-retrans",
    onClick: (e) => e.stopPropagation()
  }, /* @__PURE__ */ import_react2.default.createElement("input", {
    placeholder: sel ? `关于「${sel.slice(0, 24)}」想问什么…` : placeholder,
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter")
        submit();
      if (e.key === "Escape")
        setOpen(false);
    },
    autoFocus: true
  }), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: submit,
    disabled: !draft.trim()
  }, "问"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: () => {
      setOpen(false);
      setSel("");
    }
  }, "取消")) : null;
  return { asking, err, setErr, run, openFor, toggle, row };
}
function IntroBlock({ label, paraId, text, asks, onAsk, onRemoveAsk }) {
  const hostRef = import_react2.useRef(null);
  const { selection, menu, menuRef, closeMenu, handlers, clear } = useTextMenu(hostRef, (t) => text.includes(t) ? "zh" : null);
  const ctl = useAskCard(hostRef);
  const ask = useAsk(onAsk, `对这段${label}想问什么…`, (item) => ctl.openFor(item.id));
  const { groups, rest } = splitAsks(text, asks);
  const sel = menu?.text;
  const menuItems = sel ? [
    sel.length <= 600 ? { label: "解释", run: () => {
      clear();
      ask.run({ selection: sel, kind: "explain" });
    } } : null,
    sel.length <= 600 ? { label: "追问…", run: () => {
      ask.openFor(sel);
      clear();
    } } : null,
    "-",
    { label: "复制", run: () => copyText(sel) }
  ] : [
    { label: `追问这段${label}…`, run: () => ask.openFor("") },
    { label: `复制${label}`, run: () => copyText(text) }
  ];
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-intro",
    "data-para": paraId,
    ref: hostRef,
    ...handlers
  }, selection ? /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-sel-pop",
    style: { left: selection.x, top: selection.y },
    onMouseUp: (e) => e.stopPropagation(),
    onTouchEnd: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation()
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => {
      const t = selection.text;
      clear();
      ask.run({ selection: t, kind: "explain" });
    }
  }, "解释"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => {
      ask.openFor(selection.text);
      clear();
    }
  }, "追问")) : null, /* @__PURE__ */ import_react2.default.createElement(TextMenu, {
    menu,
    menuRef,
    items: menuItems,
    onClose: closeMenu
  }), /* @__PURE__ */ import_react2.default.createElement("b", null, label), /* @__PURE__ */ import_react2.default.createElement("p", null, /* @__PURE__ */ import_react2.default.createElement(Annotated, {
    text,
    groups,
    ctl
  }), /* @__PURE__ */ import_react2.default.createElement(AskMark, {
    asks: rest,
    ctl
  })), /* @__PURE__ */ import_react2.default.createElement(AskCard, {
    ctl,
    asks,
    onRemove: onRemoveAsk
  }), ask.row, /* @__PURE__ */ import_react2.default.createElement(AskPending, {
    asking: ask.asking
  }), ask.err ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-note"
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "错误"), ask.err) : null);
}
function Paragraph({ p, display, bookId, book, chapter, mark, asks, reading, onRead, onMark, onUpdated, onAsk, onRemoveAsk }) {
  const hostRef = import_react2.useRef(null);
  const { selection, menu, menuRef, closeMenu, handlers, clear: clearSelection2 } = useTextMenu(hostRef, (text) => p.zh && p.zh.includes(text) ? "zh" : p.text.includes(text) ? "src" : null);
  const ctl = useAskCard(hostRef);
  const ask = useAsk(onAsk, "对这一段想问什么…", (item) => ctl.openFor(item.id));
  const { asking, err, setErr, run: runAsk } = ask;
  const mainText = display === "original" || !p.zh ? p.text : p.zh;
  const { groups: askGroups, rest: askRest } = p.kind === "table" ? { groups: new Map, rest: asks ?? [] } : splitAsks(mainText, asks);
  const [showSrc, setShowSrc] = import_react2.useState(false);
  const [editNote, setEditNote] = import_react2.useState(false);
  const [noteDraft, setNoteDraft] = import_react2.useState(mark?.note ?? "");
  const [showNote, setShowNote] = import_react2.useState(false);
  const [retrans, setRetrans] = import_react2.useState(false);
  const [instruction, setInstruction] = import_react2.useState("");
  const [busy, setBusy] = import_react2.useState(false);
  const kindClass = `ir-para ir-${p.kind || "p"}${selection || menu ? " ir-has-sel" : ""}${reading ? " ir-reading" : ""}${mark?.bookmark ? " ir-bookmarked" : ""}`;
  const isHeading = p.kind === "h1" || p.kind === "h2" || p.kind === "h3";
  const isTable = p.kind === "table";
  const doRetranslate = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.retranslate(bookId, [p.id], instruction);
      const item = r.items?.[p.id];
      if (item)
        onUpdated(item.zh, item.note ?? null);
      setRetrans(false);
      setInstruction("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (p.kind === "img") {
    if (!p.file)
      return null;
    return /* @__PURE__ */ import_react2.default.createElement("figure", {
      className: `ir-figure${mark?.bookmark ? " ir-bookmarked" : ""}`,
      "data-para": p.id
    }, /* @__PURE__ */ import_react2.default.createElement("img", {
      src: `${API_BASE}/books/${bookId}/assets/${p.file}`,
      alt: p.text || "",
      loading: "lazy"
    }), p.text && !/^(image|img|figure|picture|photo|\d+)$/i.test(p.text.trim()) && !/\.(png|jpe?g|gif|webp|svg)$/i.test(p.text.trim()) ? /* @__PURE__ */ import_react2.default.createElement("figcaption", null, p.text) : null);
  }
  const askInChat = async () => {
    const prompt = `我在读《${book?.title ?? ""}》${chapter?.title ? `的「${chapter.title}」` : ""}，有一段想请你帮我理解。

原文：
${p.text}

${p.zh ? `现有译文：
${p.zh}

` : ""}请说明：作者这段想表达什么、它在上下文论证里的作用、涉及的历史或背景知识；如果译文有不准确或生硬的地方也指出来。`;
    if (!askAgent(prompt)) {
      try {
        await navigator.clipboard.writeText(prompt);
        window.alert("这个宿主没法直接新建会话，问题已复制到剪贴板，去聊天框粘贴即可。");
      } catch {
        window.alert("这个宿主没法直接新建会话。");
      }
    }
  };
  const popover = selection ? /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-sel-pop",
    style: { left: selection.x, top: selection.y },
    onMouseUp: (e) => e.stopPropagation(),
    onTouchEnd: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation()
  }, selection.where === "zh" && selection.text.length >= 2 ? /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => {
      onMark({ addRange: selection.text });
      clearSelection2();
    }
  }, "划线") : null, /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => {
      const t = selection.text;
      clearSelection2();
      runAsk({ selection: t, kind: "explain" });
    }
  }, "解释"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => {
      ask.openFor(selection.text);
      clearSelection2();
    }
  }, "追问")) : null;
  const sel = menu?.text;
  const zhShown = Boolean(p.zh) && display !== "original";
  const menuItems = sel ? [
    menu.where === "zh" && sel.length >= 2 ? { label: "划线", run: () => {
      onMark({ addRange: sel });
      clearSelection2();
    } } : null,
    sel.length <= 600 ? { label: "解释", run: () => {
      clearSelection2();
      runAsk({ selection: sel, kind: "explain" });
    } } : null,
    sel.length <= 600 ? { label: "追问…", run: () => {
      ask.openFor(sel);
      clearSelection2();
    } } : null,
    "-",
    { label: "复制", run: () => copyText(sel) }
  ] : [
    { label: "这段在说什么", run: () => {
      if (!asking)
        runAsk({ kind: "intent" });
    } },
    { label: "追问这段…", run: () => ask.openFor("") },
    onRead ? { label: "从这段朗读", run: () => onRead() } : null,
    "-",
    zhShown ? { label: mark?.highlight ? "取消整段划线" : "整段划线", run: () => onMark({ highlight: !mark?.highlight }) } : null,
    { label: mark?.note ? "改笔记" : "写笔记", run: () => {
      setNoteDraft(mark?.note ?? "");
      setEditNote(true);
    } },
    { label: mark?.bookmark ? "取消书签" : "加书签", run: () => onMark({ bookmark: !mark?.bookmark }) },
    "-",
    display === "zh" && p.zh ? { label: showSrc ? "收起原文" : "看原文", run: () => setShowSrc((v) => !v) } : null,
    p.note ? { label: showNote ? "收起译注" : "看译注", run: () => setShowNote((v) => !v) } : null,
    p.zh ? { label: "重译这段…", run: () => setRetrans(true) } : null,
    { label: "开会话问", run: askInChat },
    "-",
    { label: "复制这段", run: () => copyText(zhShown ? p.zh : p.text) }
  ];
  const textMenu = /* @__PURE__ */ import_react2.default.createElement(TextMenu, {
    menu,
    menuRef,
    items: menuItems,
    onClose: closeMenu
  });
  const askRow = ask.row;
  const askList = /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement(AskCard, {
    ctl,
    asks,
    onRemove: onRemoveAsk
  }), /* @__PURE__ */ import_react2.default.createElement(AskPending, {
    asking
  }));
  if (display === "original") {
    return /* @__PURE__ */ import_react2.default.createElement("div", {
      className: kindClass,
      "data-para": p.id,
      ref: hostRef,
      ...handlers
    }, popover, textMenu, isTable ? /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement(TableView, {
      text: p.text,
      header: p.header
    }), /* @__PURE__ */ import_react2.default.createElement(AskMark, {
      asks: askRest,
      ctl
    })) : /* @__PURE__ */ import_react2.default.createElement("div", {
      className: "ir-src"
    }, /* @__PURE__ */ import_react2.default.createElement(Annotated, {
      text: p.text,
      groups: askGroups,
      ctl
    }), /* @__PURE__ */ import_react2.default.createElement(AskMark, {
      asks: askRest,
      ctl
    }), (p.notes ?? []).filter((n) => n.paraId).map((n, i) => /* @__PURE__ */ import_react2.default.createElement(Footnote, {
      key: i,
      bookId,
      note: n
    }))), askRow, askList, err ? /* @__PURE__ */ import_react2.default.createElement("div", {
      className: "ir-note"
    }, /* @__PURE__ */ import_react2.default.createElement("b", null, "错误"), err) : null);
  }
  const srcVisible = display === "bilingual" || showSrc || !p.zh;
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: kindClass,
    "data-para": p.id,
    ref: hostRef,
    ...handlers
  }, popover, textMenu, p.zh ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: `ir-zh${mark?.highlight ? " ir-hl" : ""}`,
    onClick: () => {
      if (display === "zh" && !selection && !window.getSelection()?.toString())
        setShowSrc((v) => !v);
    }
  }, isTable ? /* @__PURE__ */ import_react2.default.createElement(TableView, {
    text: p.zh,
    header: p.header
  }) : /* @__PURE__ */ import_react2.default.createElement(Annotated, {
    text: p.zh,
    ranges: mark?.ranges,
    onRemove: (r) => onMark({ removeRange: r }),
    groups: askGroups,
    ctl
  }), p.note ? /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-note-mark",
    onClick: (e) => {
      e.stopPropagation();
      setShowNote((v) => !v);
    }
  }, "注") : null, /* @__PURE__ */ import_react2.default.createElement(AskMark, {
    asks: askRest,
    ctl
  }), (p.notes ?? []).filter((n) => n.paraId).map((n, i) => /* @__PURE__ */ import_react2.default.createElement(Footnote, {
    key: i,
    bookId,
    note: n
  }))) : null, mark?.note && !editNote ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-note ir-usernote",
    onClick: () => setEditNote(true)
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "笔记"), mark.note) : null, editNote ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-retrans"
  }, /* @__PURE__ */ import_react2.default.createElement("input", {
    placeholder: "写一条笔记…",
    value: noteDraft,
    onChange: (e) => setNoteDraft(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        onMark({ note: noteDraft });
        setEditNote(false);
      }
    },
    autoFocus: true
  }), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => {
      onMark({ note: noteDraft });
      setEditNote(false);
    }
  }, "保存"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: () => setEditNote(false)
  }, "取消")) : null, srcVisible ? isTable ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-src"
  }, /* @__PURE__ */ import_react2.default.createElement(TableView, {
    text: p.text,
    muted: true,
    header: p.header
  }), !p.zh ? /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement(AskMark, {
    asks: askRest,
    ctl
  }), /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-pending"
  }, "待译")) : null) : /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-src"
  }, p.zh ? p.text : /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement(Annotated, {
    text: p.text,
    groups: askGroups,
    ctl
  }), /* @__PURE__ */ import_react2.default.createElement(AskMark, {
    asks: askRest,
    ctl
  })), !p.zh && !isHeading ? /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-pending"
  }, "待译") : null) : null, showNote && p.note ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-note"
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "译注"), p.note) : null, showSrc && display === "zh" && p.zh ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-para-tools"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => runAsk({ kind: "intent" }),
    disabled: Boolean(asking)
  }, "这段在说什么"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: ask.toggle
  }, "追问"), onRead ? /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: (e) => {
      e.stopPropagation();
      onRead();
    }
  }, "从这段朗读") : null, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => setRetrans((v) => !v)
  }, "重译"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => onMark({ highlight: !mark?.highlight })
  }, mark?.highlight ? "取消划线" : "划线"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => {
      setNoteDraft(mark?.note ?? "");
      setEditNote(true);
    }
  }, mark?.note ? "改笔记" : "笔记"), p.note && !showNote ? /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: () => setShowNote(true)
  }, "看译注") : null, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: askInChat,
    title: "把这段带着问题丢进 dsh 的新会话"
  }, "开会话问")) : null, askRow, retrans ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-retrans"
  }, /* @__PURE__ */ import_react2.default.createElement("input", {
    placeholder: "对这一段的要求，如：更口语、保留原文句式…",
    value: instruction,
    onChange: (e) => setInstruction(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter")
        doRetranslate();
    },
    disabled: busy
  }), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: doRetranslate,
    disabled: busy
  }, busy ? "翻译中…" : "重译")) : null, askList, err ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-note"
  }, /* @__PURE__ */ import_react2.default.createElement("b", null, "错误"), err) : null);
}
function BookTab({ book, chapterId, onRetranslateChapter }) {
  const [draft, setDraft] = import_react2.useState({ style: "", instruction: "" });
  const [saved, setSaved] = import_react2.useState("");
  const [exported, setExported] = import_react2.useState(null);
  const [exporting, setExporting] = import_react2.useState("");
  import_react2.useEffect(() => {
    api.bookSettings(book.id).then(setDraft).catch(() => {});
  }, [book.id]);
  const save = async () => {
    try {
      setDraft(await api.saveBookSettings(book.id, draft));
      setSaved("已保存，之后新译的段落按这个风格；已译的章节可点「重译本章」。");
    } catch (e) {
      setSaved(e.message);
    }
  };
  const doExport = async (kind, mode) => {
    setExporting(kind + mode);
    setExported(null);
    try {
      setExported(await api.exportBook(book.id, { kind, mode: mode ?? "zh", ...kind === "chapter" ? { cid: chapterId } : {} }));
    } catch (e) {
      setExported({ error: e.message });
    } finally {
      setExporting("");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported.markdown);
      setExported((x) => ({ ...x, copied: true }));
    } catch {}
  };
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-booktab"
  }, book.url ? /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, "来源：", /* @__PURE__ */ import_react2.default.createElement("a", {
    href: book.url,
    target: "_blank",
    rel: "noreferrer"
  }, book.url)) : null, /* @__PURE__ */ import_react2.default.createElement("label", null, "本书译文风格", /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-hint"
  }, "（留空用全局设置）")), /* @__PURE__ */ import_react2.default.createElement("textarea", {
    placeholder: "例如：学术书，术语按国内通行译法，不加文学修饰 / 小说，保留口语和反讽",
    value: draft.style ?? "",
    onChange: (e) => setDraft((d) => ({ ...d, style: e.target.value }))
  }), /* @__PURE__ */ import_react2.default.createElement("label", null, "本书附加要求"), /* @__PURE__ */ import_react2.default.createElement("textarea", {
    placeholder: "例如：人名保留英文；引用的书名用中文通行译名",
    value: draft.instruction ?? "",
    onChange: (e) => setDraft((d) => ({ ...d, instruction: e.target.value }))
  }), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session-actions"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-primary",
    onClick: save
  }, "保存"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: onRetranslateChapter
  }, "按此重译当前章")), saved ? /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, saved) : null, /* @__PURE__ */ import_react2.default.createElement("label", {
    style: { marginTop: 18 }
  }, "导出 Markdown"), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-session-actions",
    style: { flexWrap: "wrap", marginTop: 2 }
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => doExport("notes"),
    disabled: Boolean(exporting)
  }, "划线、笔记与追问"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => doExport("chapter", "zh"),
    disabled: Boolean(exporting) || !chapterId
  }, "本章译文"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => doExport("chapter", "bilingual"),
    disabled: Boolean(exporting) || !chapterId
  }, "本章双语"), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: () => doExport("book", "zh"),
    disabled: Boolean(exporting)
  }, "全书已译部分")), exporting ? /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, "导出中…") : null, exported?.error ? /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, exported.error) : null, exported && !exported.error ? /* @__PURE__ */ import_react2.default.createElement("p", {
    className: "ir-hint"
  }, "已写入 ", /* @__PURE__ */ import_react2.default.createElement("code", null, exported.path), exported.count ? `（${exported.count} 条）` : "", " ", /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-link",
    onClick: copy
  }, exported.copied ? "已复制" : "复制内容")) : null);
}
function SearchTab({ book, onGo }) {
  const [q, setQ] = import_react2.useState("");
  const [hits, setHits] = import_react2.useState(null);
  const [busy, setBusy] = import_react2.useState(false);
  const run = async () => {
    if (!q.trim())
      return;
    setBusy(true);
    try {
      setHits(await api.search(book.id, q.trim()));
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-gloss"
  }, /* @__PURE__ */ import_react2.default.createElement("input", {
    placeholder: "搜原文或译文",
    value: q,
    onChange: (e) => setQ(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter")
        run();
    },
    style: { flex: 1 },
    autoFocus: true
  }), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: run,
    disabled: busy
  }, busy ? "…" : "搜索")), hits && hits.length === 0 ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-block"
  }, "没有找到。") : null, hits && hits.length ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-block",
    style: { padding: "4px 16px" }
  }, hits.length, " 处", hits.length >= 100 ? "（只显示前 100）" : "") : null, (hits ?? []).map((h, i) => /* @__PURE__ */ import_react2.default.createElement("button", {
    key: i,
    className: "ir-toc-item ir-hit",
    onClick: () => onGo(h.chapterId, h.paraId)
  }, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-hit-body"
  }, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-hit-ch"
  }, h.chapterTitle), h.snippet))));
}
function MarksTab({ book, display, marks, onGo }) {
  const entries = Object.entries(marks ?? {}).sort((a, b) => (b[1].at ?? "").localeCompare(a[1].at ?? ""));
  if (entries.length === 0)
    return /* @__PURE__ */ import_react2.default.createElement("div", {
      className: "ir-block"
    }, "还没有划线、笔记或书签。选中译文里的一段文字就能划线；译文模式下点开一段，还有「划线」「笔记」。");
  const chapterOf = (pid) => book.chapters.find((c) => pid.startsWith(c.id + "p"));
  return /* @__PURE__ */ import_react2.default.createElement("div", null, entries.map(([pid, m]) => {
    const ch = chapterOf(pid);
    return /* @__PURE__ */ import_react2.default.createElement("button", {
      key: pid,
      className: "ir-toc-item ir-hit",
      onClick: () => onGo(ch?.id, pid)
    }, /* @__PURE__ */ import_react2.default.createElement("span", {
      className: "ir-hit-body"
    }, /* @__PURE__ */ import_react2.default.createElement("span", {
      className: "ir-hit-ch"
    }, ch ? tt(ch, display) : pid, m.bookmark ? " · 书签" : "", m.highlight ? " · 整段划线" : ""), m.ranges?.length ? m.ranges.map((r, i) => /* @__PURE__ */ import_react2.default.createElement("span", {
      key: i,
      className: "ir-hit-range"
    }, r)) : null, m.note ? m.note : !m.ranges?.length && (m.highlight || !m.bookmark) ? "（划线）" : ""));
  }));
}
function AsksTab({ book, display, asks, onGo }) {
  const list = [...asks ?? []].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  if (list.length === 0)
    return /* @__PURE__ */ import_react2.default.createElement("div", {
      className: "ir-block"
    }, "还没有追问。选中一个词或一句话点「解释」，或点开一段用「这段在说什么」「追问」，答案都会记在这里。");
  const chapterOf = (a) => book.chapters.find((c) => c.id === a.chapterId || a.paraId.startsWith(c.id + "p"));
  return /* @__PURE__ */ import_react2.default.createElement("div", null, list.map((a) => {
    const ch = chapterOf(a);
    const head = a.selection ? `「${a.selection}」` : a.kind === "custom" ? a.question : ASK_LABEL[a.kind];
    return /* @__PURE__ */ import_react2.default.createElement("button", {
      key: a.id,
      className: "ir-toc-item ir-hit",
      onClick: () => {
        onGo(ch?.id, a.paraId);
        setTimeout(() => window.dispatchEvent(new CustomEvent("ir-open-ask", { detail: a.id })), 500);
      }
    }, /* @__PURE__ */ import_react2.default.createElement("span", {
      className: "ir-hit-body"
    }, /* @__PURE__ */ import_react2.default.createElement("span", {
      className: "ir-hit-ch"
    }, ch ? tt(ch, display) : a.paraId), /* @__PURE__ */ import_react2.default.createElement("span", {
      className: "ir-hit-range",
      style: { textDecoration: "none" }
    }, head), String(a.answer ?? "").slice(0, 90), a.answer && a.answer.length > 90 ? "…" : ""));
  }));
}
function TocDrawer({ book, display, current, marks, asks, initialTab, onClose, onGo, onBookChanged, onRetranslateChapter }) {
  const [tab, setTab] = import_react2.useState(initialTab || "toc");
  const [term, setTerm] = import_react2.useState("");
  const [zh, setZh] = import_react2.useState("");
  const [glossary, setGlossary] = import_react2.useState(book.glossary ?? []);
  const listRef = import_react2.useRef(null);
  import_react2.useEffect(() => {
    const el = listRef.current?.querySelector(".ir-current");
    if (el)
      el.scrollIntoView({ block: "center" });
  }, []);
  const addTerm = async () => {
    if (!term.trim() || !zh.trim())
      return;
    try {
      setGlossary(await api.glossary(book.id, { term: term.trim(), zh: zh.trim() }));
      setTerm("");
      setZh("");
      onBookChanged();
    } catch {}
  };
  const removeTerm = async (t) => {
    try {
      setGlossary(await api.glossary(book.id, { remove: t }));
      onBookChanged();
    } catch {}
  };
  return /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-drawer",
    "data-window-drag-recall": ""
  }, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-bar"
  }, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-title",
    title: book.title
  }, tt(book, display)), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-right"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: onClose
  }, "关闭"))), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-tabs"
  }, /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "toc" ? "ir-on" : "",
    onClick: () => setTab("toc")
  }, "目录"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "intro" ? "ir-on" : "",
    onClick: () => setTab("intro")
  }, "导读"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "glossary" ? "ir-on" : "",
    onClick: () => setTab("glossary")
  }, "术语 ", glossary.length || ""), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "search" ? "ir-on" : "",
    onClick: () => setTab("search")
  }, "搜索"), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "marks" ? "ir-on" : "",
    onClick: () => setTab("marks")
  }, "划线 ", Object.keys(marks ?? {}).length || ""), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "asks" ? "ir-on" : "",
    onClick: () => setTab("asks")
  }, "追问 ", (asks ?? []).length || ""), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: tab === "book" ? "ir-on" : "",
    onClick: () => setTab("book")
  }, "本书")), /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-drawer-body",
    ref: listRef
  }, tab === "toc" ? book.chapters.map((c) => /* @__PURE__ */ import_react2.default.createElement("button", {
    key: c.id,
    className: `ir-toc-item${c.id === current ? " ir-current" : ""}`,
    onClick: () => onGo(c.id)
  }, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-toc-title",
    title: c.title
  }, tt(c, display)), /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-toc-count"
  }, c.translated, "/", c.translatable ?? c.paragraphs))) : null, tab === "book" ? /* @__PURE__ */ import_react2.default.createElement(BookTab, {
    book,
    chapterId: current,
    onRetranslateChapter
  }) : null, tab === "search" ? /* @__PURE__ */ import_react2.default.createElement(SearchTab, {
    book,
    onGo
  }) : null, tab === "marks" ? /* @__PURE__ */ import_react2.default.createElement(MarksTab, {
    book,
    display,
    marks,
    onGo
  }) : null, tab === "asks" ? /* @__PURE__ */ import_react2.default.createElement(AsksTab, {
    book,
    display,
    asks,
    onGo
  }) : null, tab === "intro" ? /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-block"
  }, book.intro || "导读还没生成。打开任一章节时会自动生成（需要在设置里开着「导读」）。"), book.bookRecall ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-block"
  }, /* @__PURE__ */ import_react2.default.createElement("b", {
    style: { color: "var(--ir-fg)" }
  }, "全书回想"), `
`, book.bookRecall.summary, book.bookRecall.threads?.length ? `

线索：
` + book.bookRecall.threads.map((t) => "· " + t).join(`
`) : "") : null) : null, tab === "glossary" ? /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-gloss"
  }, /* @__PURE__ */ import_react2.default.createElement("input", {
    placeholder: "原文术语",
    value: term,
    onChange: (e) => setTerm(e.target.value),
    style: { flex: 1 }
  }), /* @__PURE__ */ import_react2.default.createElement("input", {
    placeholder: "固定译法",
    value: zh,
    onChange: (e) => setZh(e.target.value),
    style: { flex: 1 },
    onKeyDown: (e) => {
      if (e.key === "Enter")
        addTerm();
    }
  }), /* @__PURE__ */ import_react2.default.createElement("button", {
    onClick: addTerm
  }, "固定")), glossary.length === 0 ? /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-block"
  }, "还没有术语。模型翻译时会自动提议，你也可以在这里固定译法。") : null, glossary.map((g) => /* @__PURE__ */ import_react2.default.createElement("div", {
    className: "ir-gloss",
    key: g.term
  }, /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-term"
  }, g.term), /* @__PURE__ */ import_react2.default.createElement("span", {
    className: "ir-zh-term"
  }, g.zh), /* @__PURE__ */ import_react2.default.createElement("button", {
    className: "ir-plain",
    onClick: () => removeTerm(g.term)
  }, "删")))) : null));
}

// src/client/Settings.jsx
var import_react3 = __toESM(require("react"));
var EFFORTS = [["", "跟随模型默认"], ["low", "低（快）"], ["medium", "中"], ["high", "高（慢）"]];
function Settings({ settings, onChange, onBack }) {
  const [draft, setDraft] = import_react3.useState(settings);
  const [models, setModels] = import_react3.useState(null);
  const [saving, setSaving] = import_react3.useState(false);
  const [error, setError] = import_react3.useState("");
  import_react3.useEffect(() => {
    api.models().then(setModels).catch(() => setModels({ available: false, groups: [] }));
  }, []);
  import_react3.useEffect(() => {
    setDraft(settings);
  }, [settings]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onChange(await api.saveSettings(draft));
      onBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const modelValue = draft.provider && draft.model ? `${draft.provider}\x00${draft.model}` : "";
  return /* @__PURE__ */ import_react3.default.createElement("div", {
    style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }
  }, /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-bar",
    "data-window-drag": ""
  }, /* @__PURE__ */ import_react3.default.createElement("button", {
    className: "ir-plain",
    onClick: onBack
  }, "‹ 返回"), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-title"
  }, "设置"), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-right"
  }, /* @__PURE__ */ import_react3.default.createElement("button", {
    className: "ir-primary",
    onClick: save,
    disabled: saving
  }, saving ? "保存中…" : "保存"))), error ? /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-error"
  }, error) : null, /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-scroll"
  }, /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-settings"
  }, /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "预译范围"), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-row"
  }, /* @__PURE__ */ import_react3.default.createElement("span", null, "当前位置之后"), /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "number",
    min: "0",
    max: "999",
    style: { width: "5em" },
    value: draft.lookahead?.count ?? 1,
    onChange: (e) => set({ lookahead: { ...draft.lookahead, count: Number(e.target.value) } })
  }), /* @__PURE__ */ import_react3.default.createElement("span", {
    className: "ir-seg"
  }, /* @__PURE__ */ import_react3.default.createElement("button", {
    className: draft.lookahead?.unit === "chapters" ? "ir-on" : "",
    onClick: () => set({ lookahead: { ...draft.lookahead, unit: "chapters" } })
  }, "章"), /* @__PURE__ */ import_react3.default.createElement("button", {
    className: draft.lookahead?.unit === "paragraphs" ? "ir-on" : "",
    onClick: () => set({ lookahead: { ...draft.lookahead, unit: "paragraphs" } })
  }, "段"))), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "按「章」时，总会先译完当前章剩余部分，再往后译 N 章；按「段」时只保证往后 N 段。读到哪里，就从哪里往后补。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "每份阅读量"), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-row"
  }, /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "number",
    min: "5",
    max: "180",
    style: { width: "5em" },
    value: draft.sessionMinutes ?? 30,
    onChange: (e) => set({ sessionMinutes: Number(e.target.value) })
  }), /* @__PURE__ */ import_react3.default.createElement("span", null, "分钟")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "每天打开书时按这个时长切出「今日份」，读到份尾可以做回想；读完还想读就「再读一份」。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "模型"), /* @__PURE__ */ import_react3.default.createElement("select", {
    value: modelValue,
    onChange: (e) => {
      const [provider, model] = e.target.value.split("\x00");
      set({ provider: provider ?? "", model: model ?? "" });
    }
  }, /* @__PURE__ */ import_react3.default.createElement("option", {
    value: ""
  }, "跟随 dsh 当前默认", models?.default ? `（${models.default.model}）` : ""), (models?.groups ?? []).map((g) => /* @__PURE__ */ import_react3.default.createElement("optgroup", {
    key: g.id,
    label: g.name
  }, g.models.map((m) => /* @__PURE__ */ import_react3.default.createElement("option", {
    key: m.id,
    value: `${g.id}\x00${m.id}`
  }, m.name))))), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, models === null ? "读取模型列表…" : models.available ? "列表来自 dsh 的模型设置。" : "宿主没提供模型列表，只能跟随默认模型。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "思考强度"), /* @__PURE__ */ import_react3.default.createElement("select", {
    value: draft.reasoningEffort ?? "",
    onChange: (e) => set({ reasoningEffort: e.target.value })
  }, EFFORTS.map(([v, l]) => /* @__PURE__ */ import_react3.default.createElement("option", {
    key: v,
    value: v
  }, l))), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "翻译不需要很深的推理；模型不支持所选档位时会报错，改回默认即可。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "并发"), /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "number",
    min: "1",
    max: "4",
    style: { width: "5em" },
    value: draft.concurrency ?? 2,
    onChange: (e) => set({ concurrency: Number(e.target.value) })
  }), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "同时进行的模型调用数，1–4。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "译文风格"), /* @__PURE__ */ import_react3.default.createElement("textarea", {
    value: draft.style ?? "",
    onChange: (e) => set({ style: e.target.value })
  })), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "附加要求"), /* @__PURE__ */ import_react3.default.createElement("textarea", {
    placeholder: "例如：人名保留英文；经济学术语按曼昆教材译法；多用短句。",
    value: draft.instruction ?? "",
    onChange: (e) => set({ instruction: e.target.value })
  })), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "译注与导读"), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-row"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "checkbox",
    checked: Boolean(draft.notes),
    onChange: (e) => set({ notes: e.target.checked })
  }), " 需要时写译注"), /* @__PURE__ */ import_react3.default.createElement("label", null, /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "checkbox",
    checked: Boolean(draft.intros),
    onChange: (e) => set({ intros: e.target.checked })
  }), " 生成全书导读与各章导读"))), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "默认显示"), /* @__PURE__ */ import_react3.default.createElement("span", {
    className: "ir-seg"
  }, [["zh", "译文"], ["bilingual", "双语"], ["original", "原文"]].map(([v, l]) => /* @__PURE__ */ import_react3.default.createElement("button", {
    key: v,
    className: draft.display === v ? "ir-on" : "",
    onClick: () => set({ display: v })
  }, l))), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "「译文」模式下点一下段落即可看原文。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "正文字体"), /* @__PURE__ */ import_react3.default.createElement("span", {
    className: "ir-seg"
  }, [["serif", "宋体"], ["sans", "黑体"]].map(([v, l]) => /* @__PURE__ */ import_react3.default.createElement("button", {
    key: v,
    className: (draft.fontFamily ?? "serif") === v ? "ir-on" : "",
    onClick: () => set({ fontFamily: v })
  }, l))), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "宋体接近纸书；低分辨率屏幕上黑体更清楚。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "朗读语速"), /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "number",
    min: "0.5",
    max: "2",
    step: "0.1",
    style: { width: "5em" },
    value: draft.speechRate ?? 1,
    onChange: (e) => set({ speechRate: Number(e.target.value) })
  }), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field-help"
  }, "用系统语音读译文（原文模式读原文），1 为正常语速。")), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-field"
  }, /* @__PURE__ */ import_react3.default.createElement("label", null, "字号 / 行高"), /* @__PURE__ */ import_react3.default.createElement("div", {
    className: "ir-row"
  }, /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "number",
    min: "12",
    max: "32",
    style: { width: "5em" },
    value: draft.fontSize ?? 18,
    onChange: (e) => set({ fontSize: Number(e.target.value) })
  }), /* @__PURE__ */ import_react3.default.createElement("input", {
    type: "number",
    min: "1.2",
    max: "2.6",
    step: "0.1",
    style: { width: "5em" },
    value: draft.lineHeight ?? 1.9,
    onChange: (e) => set({ lineHeight: Number(e.target.value) })
  }))))));
}

// src/client/index.jsx
var PANEL_ID = "immersive-reader";
var LAST_KEY = "dsh-immersive-reader:last";
function readLast() {
  try {
    return JSON.parse(window.localStorage.getItem(LAST_KEY) || "null");
  } catch {
    return null;
  }
}
function writeLast(value) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(value));
  } catch {}
}

class Boundary extends import_react4.default.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ import_react4.default.createElement("div", {
        className: "ir-root"
      }, /* @__PURE__ */ import_react4.default.createElement("div", {
        className: "ir-error"
      }, "阅读室界面出错：", String(this.state.error?.message ?? this.state.error), " ", /* @__PURE__ */ import_react4.default.createElement("button", {
        className: "ir-link",
        onClick: () => this.setState({ error: null })
      }, "重试")));
    }
    return this.props.children;
  }
}
function PanelPage() {
  const last = readLast();
  const [screen, setScreen] = import_react4.useState(last?.bookId ? "reader" : "shelf");
  const [bookId, setBookId] = import_react4.useState(last?.bookId ?? null);
  const [settings, setSettings] = import_react4.useState(null);
  const [returnTo, setReturnTo] = import_react4.useState("shelf");
  import_react4.useEffect(() => {
    api.settings().then(setSettings).catch(() => setSettings({ display: "zh", fontSize: 18, lineHeight: 1.9, lookahead: { unit: "chapters", count: 1 } }));
  }, []);
  const open = (id) => {
    setBookId(id);
    writeLast({ bookId: id });
    setScreen("reader");
  };
  const back = () => {
    setBookId(null);
    writeLast(null);
    setScreen("shelf");
  };
  const toSettings = (from) => {
    setReturnTo(from);
    setScreen("settings");
  };
  const setDisplay = (display) => {
    setSettings((s) => ({ ...s, display }));
    api.saveSettings({ display }).catch(() => {});
  };
  let body;
  if (!settings)
    body = /* @__PURE__ */ import_react4.default.createElement("div", {
      className: "ir-empty"
    }, "载入设置…");
  else if (screen === "settings")
    body = /* @__PURE__ */ import_react4.default.createElement(Settings, {
      settings,
      onChange: setSettings,
      onBack: () => setScreen(returnTo)
    });
  else if (screen === "reader" && bookId)
    body = /* @__PURE__ */ import_react4.default.createElement(Reader, {
      bookId,
      settings,
      onBack: back,
      onSettings: () => toSettings("reader"),
      onDisplayChange: setDisplay
    });
  else
    body = /* @__PURE__ */ import_react4.default.createElement(Shelf, {
      settings,
      onOpen: open,
      onSettings: () => toSettings("shelf")
    });
  return /* @__PURE__ */ import_react4.default.createElement("div", {
    className: "ir-root",
    "data-display": settings?.display ?? "zh",
    "data-font": settings?.fontFamily === "sans" ? "sans" : "serif"
  }, /* @__PURE__ */ import_react4.default.createElement(Boundary, null, body));
}
function PanelIcon(props) {
  const size = Number.isFinite(props?.size) ? props.size : 20;
  return /* @__PURE__ */ import_react4.default.createElement("svg", {
    width: size,
    height: size,
    viewBox: "2 3 20 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false"
  }, /* @__PURE__ */ import_react4.default.createElement("path", {
    d: "M12 6.5c-1.8-1.4-4.1-1.9-7-1.7-.5 0-1 .5-1 1v11.4c0 .5.5 1 1 1 2.9-.2 5.2.3 7 1.7"
  }), /* @__PURE__ */ import_react4.default.createElement("path", {
    d: "M12 6.5c1.8-1.4 4.1-1.9 7-1.7.5 0 1 .5 1 1v11.4c0 .5-.5 1-1 1-2.9-.2-5.2.3-7 1.7"
  }), /* @__PURE__ */ import_react4.default.createElement("path", {
    d: "M12 6.5v13.4"
  }), /* @__PURE__ */ import_react4.default.createElement("path", {
    d: "M7 9.2h2.4M7 12h2.4M14.6 9.2H17M14.6 12H17"
  }));
}
var inject = ["slots"];
function apply(ctx) {
  try {
    if (typeof document !== "undefined")
      ensureStyle(document);
  } catch (error) {
    console.warn("[immersive-reader] 样式注入失败", error);
  }
  const slots = ctx && ctx.slots;
  if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") {
    console.warn("[immersive-reader] 宿主没有 slots 服务，不提供界面");
    return;
  }
  try {
    setAskAgent(resolveAskAgent(ctx));
  } catch {}
  ctx.effect(() => {
    const disposers = [];
    disposers.push(slots.inject("main", () => slots.register({ name: "main", key: PANEL_ID }, PanelPage)));
    disposers.push(slots.inject("sidebar.panellist", () => slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 60, label: () => "阅读室" }, PanelIcon)));
    return () => {
      for (const d of disposers.splice(0)) {
        try {
          d();
        } catch {}
      }
    };
  }, "immersive-reader: 面板入口");
}

    return module.exports
  },
})
