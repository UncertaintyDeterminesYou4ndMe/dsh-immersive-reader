/**
 * 浏览器半与 dsh 宿主服务的小桥：组件不碰 ctx，apply 时把需要的能力注册进来。
 * 目前只有一个：把一段原文/译文带着问题丢给 dsh 的 agent（新建会话并预填提示）。
 */
let askAgentImpl = null

export function setAskAgent(fn) { askAgentImpl = fn }

/** @returns {boolean} 是否成功交给 agent；false 表示宿主没有这个能力，调用方自行降级 */
export function askAgent(prompt) {
  if (typeof askAgentImpl !== 'function') return false
  try { return askAgentImpl(prompt) !== false } catch (error) { console.warn('[immersive-reader] 交给 agent 失败', error); return false }
}

/** 从 cordis ctx 里尽量拿到 uiWorkspace.startSession；拿不到返回 null（老版本宿主或服务名变了）。 */
export function resolveAskAgent(ctx) {
  const pick = () => {
    try {
      const service = (typeof ctx.get === 'function' ? ctx.get('uiWorkspace', false) : undefined) ?? ctx.uiWorkspace
      return service && typeof service.startSession === 'function' ? service : null
    } catch { return null }
  }
  return (prompt) => {
    const service = pick()
    if (!service) return false
    service.startSession(undefined, { prompt, whenDraftExists: 'append' })
    return true
  }
}
