#!/usr/bin/env node
/**
 * build.mjs —— 把 src/client/*.jsx 打成 client.js（浏览器半）。
 *
 * 用 bun 的打包器出 CommonJS，react 留作外部依赖（由宿主的 require 提供），
 * 再包进 dsh client-modules 认的形状：window.__ModuleLoader__.load({ id, factory(require) }).
 * 产物提交进仓库，安装方不需要 bun。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const tmp = mkdtempSync(join(tmpdir(), 'ir-build-'))
const out = join(tmp, 'bundle.js')

const result = spawnSync('bun', ['build', join(ROOT, 'src/client/index.jsx'), '--format=cjs', '--target=browser', '--external', 'react', '--external', 'react-dom', '--jsx-runtime=classic', `--outfile=${out}`], { stdio: 'inherit' })
if (result.status !== 0) {
  console.error('bun build 失败（需要安装 bun：https://bun.sh）')
  process.exit(result.status ?? 1)
}
const bundle = readFileSync(out, 'utf8')
rmSync(tmp, { recursive: true, force: true })

const banner = `/**
 * ${pkg.name} · 浏览器半 —— 构建产物，不要手改（node build.mjs 从 src/client/ 生成）。
 * 只 require 宿主给的 react；界面全部是 slot 里的 React 组件。
 */
`
const wrapped = `${banner}window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
${bundle}
    return module.exports
  },
})
`
// 先写临时文件再改名：宿主随时可能读 client.js，不能让它读到写了一半的文件
writeFileSync(join(ROOT, 'client.js.tmp'), wrapped)
renameSync(join(ROOT, 'client.js.tmp'), join(ROOT, 'client.js'))

// 求值一遍：语法 + 顶层引用错误在这里就炸，而不是装进 dsh 后面板静默消失
const fakeReact = new Proxy(function () {}, { get: (_t, key) => (key === '__esModule' ? false : key === 'default' ? fakeReact : function () {}) })
const loaded = []
new Function('window', 'document', wrapped)({ __ModuleLoader__: { load: m => loaded.push(m) }, localStorage: { getItem: () => null, setItem() {} } }, undefined)
const mod = loaded[0]?.factory((name) => { if (name === 'react' || name === 'react/jsx-runtime') return fakeReact; throw new Error(`unexpected require: ${name}`) })
if (typeof mod?.apply !== 'function' || !Array.isArray(mod?.inject)) {
  console.error('产物没有导出 apply / inject')
  process.exit(1)
}
console.log(`client.js ${(wrapped.length / 1024).toFixed(1)} KB，导出：${Object.keys(mod).join(', ')}`)
