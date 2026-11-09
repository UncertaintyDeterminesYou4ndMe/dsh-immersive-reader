/**
 * dsh-reading-room · 宿主半入口。
 *
 * 做三件事：
 *   1. 书库目录（默认 $DSH_HOME/reading-room）+ 翻译引擎；
 *   2. 注册 HTTP 路由 /api/reading-room/**（浏览器半用）；
 *   3. tools 服务就绪后注册 reader_* 工具（agent 用），拿不到就跳过。
 *
 * inject 只硬依赖 webServer 与 llm：没有 webServer 的 profile（headless）不会装这个插件。
 */
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, renameSync } from 'node:fs'
import { LibraryStore } from './lib/store.js'
import { Translator } from './lib/translate.js'
import { registerRoutes, parseByFilename } from './lib/routes.js'
import { registerTools } from './lib/tools.js'

export const name = 'dsh-reading-room'
export const inject = ['webServer', 'llm']

function resolveLibraryDir(config) {
  if (config && typeof config.libraryDir === 'string' && config.libraryDir.trim()) return config.libraryDir
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  const dir = join(home, 'reading-room')
  // 插件原名 dsh-immersive-reader，书库在 immersive-reader/：新目录还没有时整个挪过来
  const legacy = join(home, 'immersive-reader')
  if (!existsSync(dir) && existsSync(legacy)) {
    try { renameSync(legacy, dir) } catch { return legacy }
  }
  return dir
}

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console
  const store = new LibraryStore(resolveLibraryDir(config))
  const translator = new Translator({ ctx, store, logger })

  ctx.effect(() => {
    let disposeRoutes = () => {}
    store.init()
      .then(() => {
        disposeRoutes = registerRoutes(ctx, { store, translator, logger })
        logger.info?.(`[reading-room] 书库：${store.root}`)
      })
      .catch(error => logger.warn(`[reading-room] 初始化失败：${error?.stack ?? error}`))
    return () => {
      translator.dispose()
      disposeRoutes()
    }
  })

  ctx.inject(['tools'], (scoped) => {
    registerTools(scoped, { store, translator, parseByFilename }, logger)
      .catch(error => logger.warn(`[reading-room] 注册工具失败：${error?.message ?? error}`))
  })
}
