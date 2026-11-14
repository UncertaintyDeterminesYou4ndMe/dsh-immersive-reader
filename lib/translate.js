/**
 * translate.js —— 翻译引擎。
 *
 * 三件事：
 *   1. 提示词：系统提示（译者原则）+ 每批的上下文（书、章、上文、术语表）+ 严格 JSON 输出。
 *   2. 分批：同一章内连续段落按字数攒成一批（默认 ≤ 1800 字符或 ≤ 12 段），
 *      一次模型调用译一批；段落 id 原样来回，译文按 id 落盘，所以批的边界不影响存储。
 *   3. 预译队列：读者位置一变就 `ensureLookahead`，把「当前位置起、往后 N 章 / N 段」里
 *      还没译的段落排进队列，按设置的并发数跑；章导读、全书导读也走同一条队列。
 *
 * 模型调用只经过宿主的 `ctx.llm.stream`，用的是 dsh 里配好的 provider/model，
 * 本插件不碰任何 API key。
 */

const MAX_BATCH_CHARS = 1800
const MAX_BATCH_PARAS = 12
const LEAD_BATCH_CHARS = 500
const LEAD_BATCH_PARAS = 3
const MAX_ATTEMPTS = 3

// ── 提示词 ───────────────────────────────────────────────

// 读者提供的写作要求，放在规则之后：规则管忠实，这段管中文写得好。盲评里两者合用比各自单用都好
const REBIRTH = "# 中文重生场\n\n英文进入此场即死。\n中文从其养分中生。\n\n场之根本律：\n\n【遗忘之律】\n忘记英文的句法。\n忘记英文的语序。\n只记住它要说的事。\n\n【重生之律】\n如果你是中国作者，\n面对中国读者，\n你会怎么讲这个故事？\n\n【地道之律】\n\"类似的剧情在计算机围棋领域也重演了一遍，只不过晚了20年。\"\n而非\"相似的情节在计算机围棋领域被重复了，延迟了20年。\"\n\n中文有自己的韵律：\n- 四字短语的节奏感\n- 口语的亲切感\n- 成语俗语的画面感\n\n场的检验标准：\n读完后，读者会说\"写得真好\"\n而不是\"翻译得真好\"。\n\n真实之锚：\n- 数据一字不改\n- 事实纹丝不动\n- 逻辑完整移植\n- 术语规范标注：大语言模型（LLM）\n\n───\n\n将英文投入。\n看它如何在中文土壤里，\n长成另一个生命。"

export function systemPrompt(settings) {
  const lines = [
    '你是一位资深译者，正在把一本书逐段译成简体中文。目标：中文读者读到的，像是作者本人用中文写的书——意思、分寸和语气都在，读不出翻译腔。',
    '',
    '怎么译：',
    '1. 先读懂，再重写。弄清这一段在论证里做什么、每句话到底说了什么（每个代词、每个从句指的是谁）、作者是什么口气，然后丢开英文句子的骨架，想想作者如果用中文写这段会怎么写，照那样写。不要从英文的词序和句式出发逐词替换。',
    '2. 检验：只看中文的读者，不应该能从译文猜出英文原句长什么样。猜得出，就是翻译腔，重写。',
    '3. 常见翻译腔，碰到就改：',
    '   - 名词化：英文爱用抽象名词做动作（achieve prosperity, pose a challenge, make an assessment），中文多还原成动词、形容词：「富起来」「和……一较高下」「评估」，而不是「实现了繁荣」「构成了挑战」「做出评估」。',
    '   - 搬字面的搭配和习语：success story、by ... standards、play a role、in terms of、a number of。找中文里真会这么说的话（「成功的例子」「拿……来比」「起作用」），不要「成功故事」「按……的标准」「扮演……的角色」「就……而言」「一些数量的」。',
    '   - 照搬语序：英文后置的让步、条件、原因、时间从句，中文一般放到前面或拆开说；长的后置定语拆成短句，避免「……的……的……」一长串定语。',
    '   - 被动和虚词：is seen as / is argued / was deemed 多改成主动或无主句（「人们认为」「常有人说」）；「尽管」「然而」「其」「它」「被」「对……进行……」「一个……的」，中文靠语序和上下文衔接，能省就省。',
    '   - 一词多义按语境取义，不取词典第一义。sophistication 说经济时指产业精细、高端，不是「成熟」；aggressive 说竞争时多是「积极、进攻性强」，不是「侵略性」。',
    '4. 忠实：信息、限定词（some, often, largely, arguably）、强调、作者的态度一个不丢，不删、不概括。改的是说法，不是意思。特别注意：为了读着顺而添原文没有的逻辑关系，是误译——原文没有因果就不写「于是」「因此」，没有转折就不写「反过来」「反而」，allow / enable 是「让……能够」，不是「才能」；也不要添原文没有的比喻和渲染。',
    '5. 语气和语域跟着作者走：学术书严谨但不僵硬；作者调侃、挖苦、口语、断言的地方，中文要有同样的劲；作者平实，就别加修辞。',
    '6. 双关、文字游戏、头韵、戏仿：重造它的机制，不搬它的字面——在中文里另编一个效果相当的；实在造不出，才译意思并在译注里点明原文的玩法。典故和专名照实译，不换成中国典故。',
    '7. 一致：术语表里的词作术语用时，沿用表里的译法；同一个词在这里只是普通用法（如 conservative 说客户「不愿改变」而非政治上的「保守派」），按语境译。作者自己的核心概念、不常见的人名和机构名，在本批首次出现时用「中文（原文）」标注一次，之后只用中文；NASA、Google 这类读者熟悉的名字不用标注。',
    settings.notes
      ? '8. 译注（note）：只在读者需要时写：一词多义的取舍、双关或典故、原文依赖的历史/文化/时代背景、原书写作年代导致的事实变化。一到两句，不解释常识，不评价原文。没有就不要这个字段。'
      : '8. 不写译注。',
    '9. 标题（kind 为 h1/h2/h3）译得简洁，不加译注。',
    '10. 表格（kind 为 table）的 text 是 Markdown 表格：逐格翻译，行数、列数和 Markdown 表格语法原样保留，zh 就是译好的整张表；表格不加译注。',
    '11. 输出：严格的 JSON 对象，不要任何解释，不要 Markdown 围栏。',
    '',
    '在守住上面这些规则的前提下，按下面这段要求来写（它不压过「忠实」：不添原文没有的意思和渲染）：',
    REBIRTH,
    '',
    `风格：${settings.style || '忠实、自然的现代书面中文。'}`,
  ]
  if (settings.instruction && settings.instruction.trim()) {
    lines.push(`读者的附加要求：${settings.instruction.trim()}`)
  }
  return lines.join('\n')
}

function glossaryText(glossary) {
  if (!glossary || glossary.length === 0) return '（暂无）'
  return glossary.map(g => `- ${g.term} → ${g.zh}`).join('\n')
}

const WORD_CHAR = /[\p{L}\p{N}]/u
const CJK_TERM = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/
/** 术语在 hay 里作为完整词出现（允许英文复数 s / es）。hay、term 都已转小写。中日韩术语不看词边界。 */
function mentions(hay, term) {
  if (CJK_TERM.test(term)) return hay.includes(term)
  const free = (j) => j >= hay.length || !WORD_CHAR.test(hay[j])
  for (let i = hay.indexOf(term); i >= 0; i = hay.indexOf(term, i + 1)) {
    if (i > 0 && WORD_CHAR.test(hay[i - 1])) continue
    const end = i + term.length
    if (free(end) || (hay[end] === 's' && free(end + 1)) || (hay.startsWith('es', end) && free(end + 2))) return true
  }
  return false
}

/**
 * 术语表里在这段原文中出现的条目。整本书的术语表可能有上千条，全发既贵又会被截断，
 * 只发本批用得上的，模型才真看得到、真能沿用。
 */
export function relevantGlossary(glossary, text, limit = 150) {
  if (!glossary || glossary.length === 0 || !text) return []
  const hay = text.toLowerCase()
  return glossary.filter(g => typeof g?.term === 'string' && g.term.trim() && mentions(hay, g.term.trim().toLowerCase())).slice(0, limit)
}

/**
 * @param {object} input
 * @param {object} input.book  BookDoc 元信息
 * @param {object} input.chapter
 * @param {Array} input.batch   [{id, kind, text}]
 * @param {Array} input.glossary
 * @param {Array<string>} input.previous  上文译文（最多两段）
 * @param {string|null} input.bookIntro
 * @param {string} [input.extra]  重译时的额外指令
 * @param {string} [input.chapterZh]  目录里的章名译文
 */
export function batchPrompt({ book, chapter, batch, glossary, previous, bookIntro, extra, chapterZh }) {
  const parts = []
  parts.push(`书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}${book.language ? `　原文语言：${book.language}` : ''}`)
  if (bookIntro) parts.push(`背景：${bookIntro.slice(0, 600)}`)
  parts.push(`当前章节：${chapter.title}${chapterZh ? `（目录里译作「${chapterZh}」，译到章标题时沿用）` : ''}`)
  if (previous && previous.length > 0) {
    parts.push('上文（已译，仅供承接语气，不要重译）：\n' + previous.map(p => `> ${p}`).join('\n'))
  }
  parts.push('术语表（本批原文里出现的术语，必须沿用）：\n' + glossaryText(relevantGlossary(glossary, batch.map(p => p.text).join('\n'))))
  if (extra && extra.trim()) parts.push(`本批特别要求：${extra.trim()}`)
  parts.push(
    '请翻译下面的段落。输入是 JSON 数组，每项 {id, kind, text}。',
    '输出 JSON 对象：{"items":[{"id":"…","zh":"…","note":"…"}],"glossary":[{"term":"…","zh":"…"}]}',
    'items 与输入一一对应、顺序一致、id 原样返回，每项必有 zh；note 可省略。',
    'glossary 只列本批新出现、需要全书统一译法的专门术语、作者自造的概念和专有名词（可为空数组），不要重复术语表里已有的。普通词不收：industry、high wages、sophistication 这类词的译法随语境变，固定下来反而误事。',
    '',
    JSON.stringify(batch.map(p => ({ id: p.id, kind: p.kind, text: p.text }))),
  )
  return parts.join('\n\n')
}

// ── 整理术语表 ──────────────────────────────────────────

export const GLOSSARY_REVIEW_CHUNK = 60

/** 让模型挑出不该留在术语表里的条目：普通词（译法该随语境变）和译错的。拿不准的留着。 */
export function glossaryReviewPrompt(book, items) {
  return [
    `书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}`,
    '下面是翻译这本书时积累的术语表。术语表的用途：让全书的专门术语译法统一，翻译时会强制沿用。',
    '请挑出不该留在表里的条目：一是普通词汇和常见搭配，它们的译法应该随语境变化，固定下来会让译文生硬或出错（例如 sophistication、remarkable、success story、high wages、conservative）；二是译法明显错误的条目。',
    '应当保留：学科术语（如 economies of scale）、作者自造或在本书里有特定含义的概念、专有名词（人名、公司、品牌、机构、地名、书刊、法律、事件）。拿不准的保留。',
    '输出 JSON 对象：{"drop":["term", ...]}，term 原样照抄，没有要删的就给空数组。',
    '',
    items.map(g => `- ${g.term} → ${g.zh}`).join('\n'),
  ].join('\n\n')
}

// ── 目录 ────────────────────────────────────────────────

const CJK = /[\u3400-\u9fff]/
const TOC_LIMIT = 200

/** 还没译的书名与章名。本来就是中文的（含解析时补的「第 n 节」）不译。 */
export function tocPending(book, trans) {
  const items = book.chapters
    .filter(c => c.title && !CJK.test(c.title) && !trans.chapters?.[c.id]?.title)
    .slice(0, TOC_LIMIT)
    .map(c => ({ id: c.id, text: c.title }))
  const title = Boolean(book.title) && !CJK.test(book.title) && !trans.title
  return { items, title }
}

export function tocPrompt(book, items) {
  return [
    `书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}`,
    '请把这本书的书名和下列目录标题译成中文，读者要靠它浏览和跳转。',
    '有通行中译本的，书名和章名沿用通行译法；章节编号原样保留（「Part I」译作「第一部分」）；人名、地名、术语用通行译法；简洁，不加解释。',
    '输出 JSON 对象：{"title":"书名译文","items":[{"id":"…","zh":"…"}]}。items 与输入一一对应，id 原样返回。',
    '',
    JSON.stringify(items),
  ].join('\n\n')
}

/** @returns {{ title: string|null, items: Map<string, string>, missing: string[] }} */
export function parseTocReply(text, expectedIds) {
  const data = extractJson(text)
  const expected = new Set(expectedIds)
  const items = new Map()
  for (const item of Array.isArray(data.items) ? data.items : []) {
    if (!item || typeof item.id !== 'string' || !expected.has(item.id) || typeof item.zh !== 'string' || !item.zh.trim()) continue
    items.set(item.id, item.zh.trim())
  }
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim().replace(/^《(.*)》$/, '$1') : null
  return { title, items, missing: expectedIds.filter(id => !items.has(id)) }
}

export function bookIntroPrompt(book, sampleText) {
  return [
    `书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}`,
    '请为准备读这本书原文的中文读者写一段 200–300 字的导读：作者是谁、这本书写于何时何种背景、它在所属领域的位置、读之前需要知道的背景与注意点（比如写作年代与今天的差异）。',
    '只写你确切知道的事实；不确定的不要写，也不要编造出版信息。输出纯文本，不要标题，不要列表。',
    '',
    '书的开头（供辨认版本与主题）：',
    sampleText.slice(0, 1500),
  ].join('\n\n')
}

export function chapterIntroPrompt(book, chapter, sampleText) {
  return [
    `书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}`,
    `章节：${chapter.title}`,
    '请写一段 100–200 字的本章导读：本章讨论什么、在全书论证里处于什么位置、读者需要的历史或概念背景。不剧透结论细节，不评价。输出纯文本，不要标题，不要列表。',
    '',
    '本章开头：',
    sampleText.slice(0, 2500),
  ].join('\n\n')
}

/** 按书的覆盖项（style / instruction）合进全局设置；空串表示不覆盖。 */
export function mergeBookSettings(settings, bookSettings) {
  if (!bookSettings) return settings
  const out = { ...settings }
  if (typeof bookSettings.style === 'string' && bookSettings.style.trim()) out.style = bookSettings.style.trim()
  if (typeof bookSettings.instruction === 'string' && bookSettings.instruction.trim()) {
    out.instruction = [settings.instruction, bookSettings.instruction].filter(x => x && x.trim()).join('\n')
  }
  return out
}

/**
 * 读完一份之后的「回想」：论证脉络 + 回想问题 + 本份术语。
 * 输入的是译文（读者读的就是译文），原文只在没有译文时补上。
 */
export function recallPrompt(book, items) {
  const body = items.map(it => `[${it.id}]${it.title ? `（${it.title}）` : ''} ${it.zh ?? it.text}`).join('\n\n')
  return [
    `书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}`,
    '下面是读者刚读完的一份内容（按段落顺序）。请帮读者做读后回想，输出 JSON 对象：',
    '{"summary":"…","questions":["…","…","…"],"terms":[{"term":"…","zh":"…","note":"…"}]}',
    'summary：150–250 字，按作者的论证顺序复述这一份讲了什么、论点之间怎么推进、关键的限定条件，不评价、不补充书外内容；',
    'questions：3 个回想问题，能靠这一份内容回答，用来检验读者是否抓住了论证，不要是非题；',
    'terms：这一份里 3–6 个关键概念或人名，term 是原文，zh 是译法，note 一句话说明它在论证里的作用。',
    '严格 JSON，不要围栏，不要解释。',
    '',
    body.slice(0, 24000),
  ].join('\n')
}

/**
 * 行内追问：读者选中一个词/一句话，或对整段提问，不离开阅读页就得到解释。
 * 答案要短、直接、只依据文本与确知的背景。
 */
export const ASK_SYSTEM = [
  '你是一位陪读者读这本书的中文导师。读者正在读原文的中文译文，遇到不懂或想深究的地方问你。',
  '规则：',
  '1. 只根据给定的原文、译文和你确切知道的背景知识回答；不确定就说不确定，不编造人物、年代和出处。',
  '2. 直接回答，不客套，不复述问题，不用「这段话」「这个词」开头。通常 80–200 字，确有必要可到 300 字。纯文本，可分段，不用 Markdown 标题和列表。',
  '3. 读者选中的是词或短语时：先用一句话给出它在此处的确切含义；再说明用法、典故、所指的人与事，或作者为什么用这个词。专有名词给出中文通行译名。',
  '4. 问整段时：说作者在这段想表达什么、它在本章论证里起什么作用、依赖哪些读者可能不熟悉的背景或当时的语境。',
  '5. 不评价译文好坏，除非读者问到。',
].join('\n')

export const ASK_KINDS = {
  explain: '这个词/短语在这里是什么意思？有什么用法、典故或背景？',
  intent: '作者这段想表达什么？它在本章论证里起什么作用？依赖哪些背景？',
}

/**
 * @param {object} input
 * @param {object} input.book
 * @param {object} input.chapter
 * @param {object} input.paragraph   原文段
 * @param {string|null} input.zh      现有译文
 * @param {Array<string>} input.previous  上文译文（≤ 2 段）
 * @param {string|null} input.bookIntro
 * @param {Array} input.glossary
 * @param {string} [input.selection]  读者选中的文字（原文或译文）
 * @param {string} [input.question]   读者的问题；没有就按 kind 取默认问题
 * @param {'explain'|'intent'|'custom'} input.kind
 * @param {'book'|'chapter'} [input.introOf]  问的是导读（模型写的中文），不是作者原文
 */
export function askPrompt({ book, chapter, paragraph, zh, previous, bookIntro, glossary, selection, question, kind, introOf }) {
  const parts = []
  parts.push(`书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}${book.language ? `　原文语言：${book.language}` : ''}`)
  if (bookIntro && introOf !== 'book') parts.push(`背景：${bookIntro.slice(0, 400)}`)
  parts.push(`章节：${chapter.title}`)
  if (previous && previous.length) parts.push('上文（译文）：\n' + previous.map(p => `> ${p}`).join('\n'))
  if (introOf) parts.push(`${introOf === 'book' ? '全书' : '本章'}导读（阅读室为读者写的中文导读，不是作者原文；回答时要落回作者原书在说什么）：\n${paragraph.text}`)
  else parts.push(`这一段原文：\n${paragraph.text}`)
  if (zh) parts.push(`这一段译文：\n${zh}`)
  const terms = relevantGlossary(glossary, [paragraph.text, selection, question].filter(Boolean).join('\n'), 80)
  if (terms.length) parts.push('术语表（涉及时沿用译法）：\n' + glossaryText(terms))
  if (selection && selection.trim()) parts.push(`读者选中的文字：「${selection.trim().slice(0, 600)}」`)
  const q = question && question.trim() ? question.trim().slice(0, 1000) : (ASK_KINDS[kind] ?? ASK_KINDS.intent)
  parts.push(`读者的问题：${q}`)
  return parts.join('\n\n')
}

/**
 * 导读也能追问：paraId 为 `intro:book`（全书导读，显示在第一章顶部）或 `intro:<章 id>`。
 * 返回 { of, chapter, text }；不是导读 id 返回 null；导读还没生成抛 E_NOT_FOUND。
 */
export function introTarget(book, trans, paraId) {
  if (typeof paraId !== 'string' || !paraId.startsWith('intro:')) return null
  const key = paraId.slice('intro:'.length)
  const of = key === 'book' ? 'book' : 'chapter'
  const chapter = of === 'book' ? book.chapters[0] : book.chapters.find(c => c.id === key)
  const text = of === 'book' ? trans.intro : trans.chapters?.[key]?.intro
  if (!chapter || !text) throw Object.assign(new Error('这段导读还没生成'), { code: 'E_NOT_FOUND' })
  return { of, chapter, text }
}

/**
 * 读完全书后的回想：用各章导读与每一份的回想摘要拼出全书论证脉络。
 * 不把全书正文喂进去（太长，也没必要）——读者要的是「这本书整体在论证什么」。
 */
export function bookRecallPrompt(book, { intro, chapters, sessions }) {
  const lines = []
  lines.push(`书：《${book.title}》${book.author ? `　作者：${book.author}` : ''}`)
  if (intro) lines.push(`全书导读：${intro}`)
  lines.push('各章（标题 · 本章导读）：')
  for (const c of chapters) lines.push(`- ${c.title}${c.intro ? `：${c.intro}` : ''}`)
  if (sessions.length) {
    lines.push('读者分次阅读时整理过的论证脉络（按阅读顺序）：')
    for (const s of sessions) lines.push(`- ${s}`)
  }
  lines.push(
    '读者刚读完这本书。请输出 JSON 对象：',
    '{"summary":"…","threads":["…","…"],"questions":["…","…","…"],"next":"…"}',
    'summary：250–400 字，按作者的论证顺序说这本书整体在论证什么、核心论点怎么一步步建立、关键限定条件；不评价。',
    'threads：3–5 条贯穿全书的线索或反复出现的概念，每条一句话。',
    'questions：3 个读后回想问题，要跨章节、靠全书内容才能答，不要是非题。',
    'next：一两句话，读完这本之后顺着读什么（作者的其他书、同主题经典或反方），只写你确切知道的。',
    '严格 JSON，不要围栏，不要解释。',
  )
  return lines.join('\n').slice(0, 30000)
}

// ── 回复解析 ─────────────────────────────────────────────

/** 从模型回复里抠出 JSON 对象：容忍 ``` 围栏、前后废话、尾逗号。 */
export function extractJson(text) {
  let s = String(text ?? '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('回复里没有 JSON 对象')
  s = s.slice(start, end + 1)
  try {
    return JSON.parse(s)
  } catch (first) {
    const repaired = s.replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(repaired)
    } catch {
      throw new Error(`JSON 解析失败：${first.message}`)
    }
  }
}

/**
 * @returns {{ items: Map<string, {zh: string, note?: string}>, glossary: Array<{term, zh}>, missing: string[] }}
 */
export function parseBatchReply(text, expectedIds) {
  const data = extractJson(text)
  const items = new Map()
  const expected = new Set(expectedIds)
  for (const item of Array.isArray(data.items) ? data.items : []) {
    if (!item || typeof item.id !== 'string' || !expected.has(item.id)) continue
    const zh = typeof item.zh === 'string' ? item.zh.trim() : ''
    if (!zh) continue
    const entry = { zh }
    if (typeof item.note === 'string' && item.note.trim()) entry.note = item.note.trim()
    items.set(item.id, entry)
  }
  const glossary = (Array.isArray(data.glossary) ? data.glossary : [])
    .filter(g => g && typeof g.term === 'string' && typeof g.zh === 'string' && g.term.trim() && g.zh.trim())
    .map(g => ({ term: g.term.trim(), zh: g.zh.trim() }))
  const missing = expectedIds.filter(id => !items.has(id))
  return { items, glossary, missing }
}

// ── 分批 ────────────────────────────────────────────────

/**
 * lead=true 时第一批压到很小（≤ 3 段 / 500 字）：读者刚翻到一章时，几秒内就能看到开头的译文，
 * 而不是等一整批十几段一起回来。
 */
export function buildBatches(paragraphs, { maxChars = MAX_BATCH_CHARS, maxParas = MAX_BATCH_PARAS, lead = false } = {}) {
  const batches = []
  let current = []
  let chars = 0
  for (const p of paragraphs) {
    const len = p.text.length
    const first = lead && batches.length === 0
    const limitChars = first ? Math.min(maxChars, LEAD_BATCH_CHARS) : maxChars
    const limitParas = first ? Math.min(maxParas, LEAD_BATCH_PARAS) : maxParas
    if (current.length > 0 && (chars + len > limitChars || current.length >= limitParas)) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(p)
    chars += len
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** 封面、版权、目录这类前置材料：第一次打开书时跳过，预译也不浪费在它们上 */
const FRONT_MATTER = /^(cover|title ?page|half ?title|copyright|contents|table of contents|dedication|also by.*|other books by.*|books by.*|by the same author|about the author|praise( for .*)?|epigraph|colophon|版权|版权信息|目录|扉页|封面|献词|第 \d+ 节)$/i
export function isFrontMatter(title) {
  return FRONT_MATTER.test(String(title ?? '').trim())
}
/** 第一个正文章节；全是前置材料就返回第一章 */
export function firstContentChapter(book) {
  return book.chapters.find(c => !isFrontMatter(c.title) && c.paragraphs.some(p => p.kind !== 'img')) ?? book.chapters[0] ?? null
}

/** 全书段落的线性序：[{chapter, paragraph, index}] */
export function linearize(book) {
  const rows = []
  for (const chapter of book.chapters) {
    for (const paragraph of chapter.paragraphs) rows.push({ chapter, paragraph, index: rows.length })
  }
  return rows
}

/**
 * 预译目标：从阅读位置起，往后 lookahead 的范围内所有段落。
 * unit=chapters：当前章剩余部分 + 后 count 章；unit=paragraphs：往后 count 段。
 */
export function lookaheadTargets(book, position, lookahead) {
  const rows = linearize(book)
  if (rows.length === 0) return []
  let start = 0
  if (position?.paraId) {
    const i = rows.findIndex(r => r.paragraph.id === position.paraId)
    if (i >= 0) start = i
  } else if (position?.chapterId) {
    const i = rows.findIndex(r => r.chapter.id === position.chapterId)
    if (i >= 0) start = i
  }
  const count = Math.max(0, Number(lookahead?.count ?? 1))
  if (lookahead?.unit === 'paragraphs') {
    return rows.slice(start, start + Math.max(1, count))
  }
  const chapterIndex = book.chapters.findIndex(c => c.id === rows[start].chapter.id)
  const lastChapter = Math.min(book.chapters.length - 1, chapterIndex + count)
  const allowed = new Set(book.chapters.slice(chapterIndex, lastChapter + 1).map(c => c.id))
  return rows.slice(start).filter(r => allowed.has(r.chapter.id))
}

/**
 * 从 start 行起切出一份：按原文字数攒到 targetChars；攒够后若离章末不远（≤ 30%），顺势读到章末。
 * 返回 rows 的子数组（不含 img 段）。
 */
export function sliceSession(rows, startIndex, targetChars) {
  const out = []
  let chars = 0
  let i = Math.max(0, startIndex)
  for (; i < rows.length; i++) {
    const r = rows[i]
    out.push(r)
    if (r.paragraph.kind !== 'img') chars += r.paragraph.text.length
    if (chars >= targetChars) break
  }
  if (i < rows.length - 1) {
    const chapterId = rows[i].chapter.id
    let extra = 0
    let j = i + 1
    for (; j < rows.length && rows[j].chapter.id === chapterId; j++) extra += rows[j].paragraph.text.length
    if (extra <= targetChars * 0.3) for (let k = i + 1; k < j; k++) out.push(rows[k])
  }
  return out
}

// ── 引擎 ────────────────────────────────────────────────

export class Translator {
  /**
   * @param {object} options
   * @param {object} options.ctx     cordis 上下文（需要 llm；sessionController 可选）
   * @param {import('./store.js').LibraryStore} options.store
   * @param {{ info: Function, warn: Function }} [options.logger]
   */
  constructor({ ctx, store, logger }) {
    this.ctx = ctx
    this.store = store
    this.logger = logger ?? console
    /** bookId → { queue: Job[], running: Set<Job>, errors: [], attempts: Map<key, n> } */
    this.books = new Map()
    this.disposed = false
  }

  dispose() {
    this.disposed = true
    for (const entry of this.books.values()) {
      entry.queue.length = 0
      for (const job of entry.running) job.abort?.abort()
    }
  }

  entry(bookId) {
    let e = this.books.get(bookId)
    if (!e) {
      e = { queue: [], running: new Set(), errors: [], attempts: new Map(), retrying: 0 }
      this.books.set(bookId, e)
    }
    return e
  }

  // ── 模型 ──

  /** 解析要用的 provider/model：设置优先，其次宿主当前默认，再次第一个可用模型。 */
  async resolveModel(settings) {
    if (settings.provider && settings.model) {
      return { provider: settings.provider, model: settings.model, reasoningEffort: settings.reasoningEffort || undefined }
    }
    let service = null
    try { service = this.ctx.get('sessionController', false) } catch { service = null }
    if (service && typeof service.modelCatalog === 'function') {
      try {
        const catalog = await service.modelCatalog()
        if (catalog?.default?.provider && catalog?.default?.model) {
          return {
            provider: catalog.default.provider,
            model: catalog.default.model,
            reasoningEffort: settings.reasoningEffort || undefined,
          }
        }
      } catch (error) {
        this.logger.warn(`[reading-room] 读宿主模型目录失败：${error?.message ?? error}`)
      }
    }
    const llm = this.ctx.llm
    const providers = typeof llm?.listProviders === 'function' ? llm.listProviders() : []
    for (const p of providers) {
      const id = typeof p === 'string' ? p : p?.id ?? p?.provider
      if (!id) continue
      try {
        const models = await llm.listModels(id)
        const first = models?.[0]
        const model = typeof first === 'string' ? first : first?.id ?? first?.model
        if (model) return { provider: id, model, reasoningEffort: undefined }
      } catch { /* 下一个 */ }
    }
    throw Object.assign(new Error('宿主没有可用的模型：先在 DSH 设置里配置一个模型'), { code: 'E_NO_MODEL' })
  }

  /** 模型目录（给设置页选模型用） */
  async modelCatalog() {
    let service = null
    try { service = this.ctx.get('sessionController', false) } catch { service = null }
    if (!service || typeof service.modelCatalog !== 'function') return { available: false, groups: [], default: null }
    try {
      const raw = await service.modelCatalog()
      const groups = (raw?.groups ?? []).map(g => ({
        id: g.id,
        name: g.name || g.id,
        models: (g.models ?? []).map(m => ({ id: m.id, name: m.name || m.id })),
      })).filter(g => g.id && g.models.length > 0)
      return { available: true, groups, default: raw?.default ?? null }
    } catch (error) {
      return { available: false, groups: [], default: null, error: String(error?.message ?? error) }
    }
  }

  /**
   * 一次非流式等价的调用：拼完整请求，吃完 text-delta，返回全文。
   * finish 为 error/aborted 时抛错（带宿主给的 failure 信息）。
   */
  async complete({ system, user, maxTokens = 8192, signal, model }) {
    const target = model
    const options = {
      provider: target.provider,
      model: target.model,
      ...(target.reasoningEffort ? { reasoningEffort: target.reasoningEffort } : {}),
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens,
      purpose: 'translation',
      ...(signal ? { signal } : {}),
    }
    let text = ''
    let finish = null
    for await (const chunk of this.ctx.llm.stream(options)) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish') finish = chunk.reason
    }
    if (finish && (finish.kind === 'error' || finish.kind === 'aborted')) {
      const failure = finish.failure
      const message = failure?.message ?? failure?.code ?? finish.kind
      throw Object.assign(new Error(`模型调用失败：${message}`), { code: 'E_LLM', retryable: finish.kind !== 'aborted' })
    }
    if (!text.trim()) throw Object.assign(new Error('模型没有返回文本'), { code: 'E_LLM_EMPTY', retryable: true })
    return text
  }

  // ── 任务 ──

  /** 当前位置向后保证译好；返回新排入的段落数。 */
  async loadBook(bookId) {
    const book = await this.store.book(bookId)
    book.settings = await this.store.bookSettings(bookId)
    return book
  }

  async ensureLookahead(bookId, position, settingsOverride) {
    const settings = settingsOverride ?? await this.store.settings()
    const book = await this.loadBook(bookId)
    const trans = await this.store.translations(bookId)
    const targets = lookaheadTargets(book, position, settings.lookahead)
    return this.enqueueParagraphs(bookId, book, trans, targets, settings)
  }

  async translateChapter(bookId, chapterId, settingsOverride, { force = false } = {}) {
    const settings = settingsOverride ?? await this.store.settings()
    const book = await this.loadBook(bookId)
    const chapter = book.chapters.find(c => c.id === chapterId)
    if (!chapter) throw Object.assign(new Error('没有这一章'), { code: 'E_NOT_FOUND' })
    if (force) await this.store.mergeTranslations(bookId, { removeParagraphs: chapter.paragraphs.map(p => p.id) })
    const trans = await this.store.translations(bookId)
    const rows = chapter.paragraphs.map(paragraph => ({ chapter, paragraph }))
    return this.enqueueParagraphs(bookId, book, trans, rows, settings)
  }

  async translateAll(bookId) {
    const settings = await this.store.settings()
    const book = await this.loadBook(bookId)
    const trans = await this.store.translations(bookId)
    return this.enqueueParagraphs(bookId, book, trans, linearize(book), settings)
  }

  /** 按指令重译指定段落（覆盖旧译文）。同步等待完成，返回新译文。 */
  async retranslate(bookId, paraIds, instruction) {
    const settings = await this.store.settings()
    const book = await this.loadBook(bookId)
    const trans = await this.store.translations(bookId)
    const rows = linearize(book).filter(r => paraIds.includes(r.paragraph.id) && r.paragraph.kind !== 'img')
    if (rows.length === 0) throw Object.assign(new Error('没有这些段落'), { code: 'E_NOT_FOUND' })
    const model = await this.resolveModel(settings)
    const results = {}
    for (const chapterRows of groupByChapter(rows)) {
      for (const batch of buildBatches(chapterRows.map(r => r.paragraph))) {
        const merged = await this.runBatch({ book, chapter: chapterRows[0].chapter, batch, trans, settings, model, extra: instruction })
        Object.assign(results, merged)
      }
    }
    return results
  }

  enqueueParagraphs(bookId, book, trans, rows, settings) {
    const e = this.entry(bookId)
    const queuedIds = new Set()
    for (const job of e.queue) for (const p of job.batch ?? []) queuedIds.add(p.id)
    for (const job of e.running) for (const p of job.batch ?? []) queuedIds.add(p.id)
    const pending = rows.filter(r => r.paragraph.kind !== 'img' && !trans.paragraphs[r.paragraph.id] && !queuedIds.has(r.paragraph.id))
    let added = 0
    const touchedChapters = new Set(rows.map(r => r.chapter.id))
    // 目录排在最前面：读者打开书第一眼看的是目录，一次请求就能译完
    const toc = tocPending(book, trans)
    if ((toc.items.length || toc.title) && !this.hasJob(e, 'toc') && (e.attempts.get('toc') ?? 0) < MAX_ATTEMPTS) {
      e.queue.unshift({ kind: 'toc', key: 'toc', book })
    }
    if (settings.intros && !trans.intro && !e.queue.some(j => j.kind === 'intro') && ![...e.running].some(j => j.kind === 'intro')) {
      e.queue.push({ kind: 'intro', key: 'intro', book })
    }
    let firstGroup = true
    for (const chapterRows of groupByChapter(pending)) {
      const chapter = chapterRows[0].chapter
      for (const batch of buildBatches(chapterRows.map(r => r.paragraph), { lead: firstGroup })) {
        firstGroup = false
        const key = `${chapter.id}:${batch[0].id}`
        if ((e.attempts.get(key) ?? 0) >= MAX_ATTEMPTS) continue
        e.queue.push({ kind: 'batch', key, book, chapter, batch })
        added += batch.length
      }
    }
    if (settings.intros) {
      for (const cid of touchedChapters) {
        if (trans.chapters[cid]?.intro) continue
        const key = `cintro:${cid}`
        if (e.queue.some(j => j.key === key) || [...e.running].some(j => j.key === key)) continue
        if ((e.attempts.get(key) ?? 0) >= MAX_ATTEMPTS) continue
        const chapter = book.chapters.find(c => c.id === cid)
        if (chapter) e.queue.push({ kind: 'chapter-intro', key, book, chapter })
      }
    }
    this.pump(bookId, settings)
    return added
  }

  hasJob(e, key) {
    return e.queue.some(j => j.key === key) || [...e.running].some(j => j.key === key)
  }

  pump(bookId, settings) {
    const e = this.entry(bookId)
    const limit = Math.max(1, Math.min(4, Number(settings.concurrency) || 2))
    while (!this.disposed && e.running.size < limit && e.queue.length > 0) {
      const job = e.queue.shift()
      e.running.add(job)
      job.abort = new AbortController()
      this.run(bookId, job, settings)
        .catch(error => {
          const attempts = (e.attempts.get(job.key) ?? 0) + 1
          e.attempts.set(job.key, attempts)
          e.errors.unshift({ key: job.key, kind: job.kind, message: String(error?.message ?? error), at: new Date().toISOString(), attempts })
          e.errors.length = Math.min(e.errors.length, 20)
          this.logger.warn(`[reading-room] ${job.kind} ${job.key} 失败（第 ${attempts} 次）：${error?.message ?? error}`)
          if (attempts < MAX_ATTEMPTS && error?.retryable !== false && !this.disposed) {
            // 退避后再排队：鉴权错、限流这类问题连着重试只会刷日志
            e.retrying += job.batch?.length ?? 1
            setTimeout(() => {
              e.retrying -= job.batch?.length ?? 1
              if (!this.disposed) { e.queue.push(job); this.pump(bookId, settings) }
            }, 3000 * attempts)
          }
        })
        .finally(() => {
          e.running.delete(job)
          this.pump(bookId, settings)
        })
    }
  }

  async run(bookId, job, settings) {
    const model = await this.resolveModel(settings)
    const trans = await this.store.translations(bookId)
    if (job.kind === 'batch') {
      await this.runBatch({ book: job.book, chapter: job.chapter, batch: job.batch, trans, settings, model, signal: job.abort.signal })
      return
    }
    if (job.kind === 'toc') {
      const { items, title } = tocPending(job.book, trans)
      if (!items.length && !title) return
      const text = await this.complete({ system: '你是一位熟悉世界各领域经典著作的中文编辑。', user: tocPrompt(job.book, items), maxTokens: 8192, model, signal: job.abort.signal })
      const reply = parseTocReply(text, items.map(i => i.id))
      const chapters = Object.fromEntries([...reply.items].map(([id, zh]) => [id, { title: zh }]))
      await this.store.mergeTranslations(bookId, { chapters, ...(title && reply.title ? { title: reply.title } : {}) })
      // 有缺漏就记一次失败：重试至多 MAX_ATTEMPTS 次，之后不再每次打开都排队
      const missing = reply.missing.length + (title && !reply.title ? 1 : 0)
      if (missing) throw new Error(`目录有 ${missing} 条没译出`)
      return
    }
    if (job.kind === 'intro') {
      const sample = job.book.chapters.slice(0, 3).flatMap(c => c.paragraphs).map(p => p.text).join('\n').slice(0, 1500)
      const text = await this.complete({ system: '你是一位熟悉世界各领域经典著作的中文编辑。', user: bookIntroPrompt(job.book, sample), maxTokens: 1024, model, signal: job.abort.signal })
      await this.store.mergeTranslations(bookId, { intro: text.trim() })
      return
    }
    if (job.kind === 'chapter-intro') {
      const sample = job.chapter.paragraphs.map(p => p.text).join('\n')
      const text = await this.complete({ system: '你是一位熟悉世界各领域经典著作的中文编辑。', user: chapterIntroPrompt(job.book, job.chapter, sample), maxTokens: 768, model, signal: job.abort.signal })
      await this.store.mergeTranslations(bookId, { chapters: { [job.chapter.id]: { intro: text.trim() } } })
    }
  }

  /** 译一批并落盘；返回 {paraId: {zh, note}}。缺漏的段落抛错让上层重试。 */
  async runBatch({ book, chapter, batch, trans, settings, model, signal, extra }) {
    const firstIndex = chapter.paragraphs.findIndex(p => p.id === batch[0].id)
    const previous = chapter.paragraphs
      .slice(Math.max(0, firstIndex - 2), Math.max(0, firstIndex))
      .map(p => trans.paragraphs[p.id]?.zh)
      .filter(Boolean)
    const user = batchPrompt({ book, chapter, batch, glossary: trans.glossary, previous, bookIntro: trans.intro, extra, chapterZh: trans.chapters?.[chapter.id]?.title })
    const merged = mergeBookSettings(settings, book.settings)
    const text = await this.complete({ system: systemPrompt(merged), user, model, signal, maxTokens: Math.min(16384, 4096 + batch.reduce((n, p) => n + p.text.length, 0) * 3) })
    const parsed = parseBatchReply(text, batch.map(p => p.id))
    const { items, missing } = parsed
    // 模型提议的术语只新增，不覆盖已有译法（已有的可能是读者手改过的）
    const known = new Set((trans.glossary ?? []).map(g => String(g.term).toLowerCase()))
    const glossary = parsed.glossary.filter(g => !known.has(String(g.term).trim().toLowerCase()))
    const paragraphs = {}
    const at = new Date().toISOString()
    for (const [id, entry] of items) {
      paragraphs[id] = { ...entry, model: `${model.provider}/${model.model}`, at }
    }
    if (Object.keys(paragraphs).length > 0 || glossary.length > 0) {
      await this.store.mergeTranslations(book.id, { paragraphs, glossary })
    }
    if (missing.length > 0) {
      throw Object.assign(new Error(`模型漏译了 ${missing.length} 段（${missing.slice(0, 3).join(', ')}…）`), { code: 'E_PARTIAL', retryable: true })
    }
    return paragraphs
  }

  /** 一份读完后的回想（同步等待）。rows: [{chapter, paragraph}] */
  async recall(bookId, rows) {
    const settings = await this.store.settings()
    const book = await this.store.book(bookId)
    const trans = await this.store.translations(bookId)
    const model = await this.resolveModel(settings)
    const items = []
    let lastChapter = null
    for (const r of rows) {
      if (r.paragraph.kind === 'img') continue
      const title = r.chapter.id !== lastChapter ? r.chapter.title : ''
      lastChapter = r.chapter.id
      items.push({ id: r.paragraph.id, title, text: r.paragraph.text, zh: trans.paragraphs[r.paragraph.id]?.zh ?? null })
    }
    if (items.length === 0) throw Object.assign(new Error('这一份没有内容'), { code: 'E_BAD_REQUEST' })
    const text = await this.complete({ system: '你是一位带读经典著作的中文导师，只根据给定文本说话。', user: recallPrompt(book, items), model, maxTokens: 2048 })
    const data = extractJson(text)
    return {
      summary: typeof data.summary === 'string' ? data.summary.trim() : '',
      questions: (Array.isArray(data.questions) ? data.questions : []).filter(q => typeof q === 'string' && q.trim()).slice(0, 5),
      terms: (Array.isArray(data.terms) ? data.terms : []).filter(t => t && typeof t.term === 'string').map(t => ({ term: t.term, zh: t.zh ?? '', note: t.note ?? '' })).slice(0, 8),
    }
  }

  /**
   * 行内追问（同步等待）。返回 { answer, model }。
   * @param {{ paraId: string, selection?: string, question?: string, kind?: string }} input
   */
  async ask(bookId, { paraId, selection = '', question = '', kind = 'custom' }) {
    const settings = await this.store.settings()
    const book = await this.store.book(bookId)
    const trans = await this.store.translations(bookId)
    const intro = introTarget(book, trans, paraId)
    if (intro) {
      const model = await this.resolveModel(settings)
      const user = askPrompt({ book, chapter: intro.chapter, paragraph: { id: paraId, text: intro.text }, zh: null, previous: [], bookIntro: trans.intro, glossary: trans.glossary, selection, question, kind, introOf: intro.of })
      const text = await this.complete({ system: ASK_SYSTEM, user, model, maxTokens: 1536 })
      return { answer: text.trim(), model: `${model.provider}/${model.model}` }
    }
    let chapter = null
    let index = -1
    for (const c of book.chapters) {
      const i = c.paragraphs.findIndex(p => p.id === paraId)
      if (i >= 0) { chapter = c; index = i; break }
    }
    if (!chapter) throw Object.assign(new Error('没有这一段'), { code: 'E_NOT_FOUND' })
    const paragraph = chapter.paragraphs[index]
    if (paragraph.kind === 'img') throw Object.assign(new Error('图片没法追问'), { code: 'E_BAD_REQUEST' })
    const previous = chapter.paragraphs.slice(Math.max(0, index - 2), index).map(p => trans.paragraphs[p.id]?.zh).filter(Boolean)
    const model = await this.resolveModel(settings)
    const user = askPrompt({ book, chapter, paragraph, zh: trans.paragraphs[paraId]?.zh ?? null, previous, bookIntro: trans.intro, glossary: trans.glossary, selection, question, kind })
    const text = await this.complete({ system: ASK_SYSTEM, user, model, maxTokens: 1536 })
    return { answer: text.trim(), model: `${model.provider}/${model.model}` }
  }

  /**
   * 整理术语表的一块：从模型提议的条目（读者自己固定的不算）里取 [offset, offset+limit)，
   * 返回模型建议删掉的条目。只给建议，删不删由读者在界面上确认。
   */
  async reviewGlossary(bookId, { offset = 0, limit = GLOSSARY_REVIEW_CHUNK } = {}) {
    const settings = await this.store.settings()
    const book = await this.store.book(bookId)
    const trans = await this.store.translations(bookId)
    const pool = (trans.glossary ?? []).filter(g => g.by !== 'reader')
    const items = pool.slice(offset, offset + limit)
    if (items.length === 0) return { drop: [], total: pool.length }
    const model = await this.resolveModel(settings)
    const text = await this.complete({ system: '你是一位熟悉世界各领域经典著作的中文编辑。', user: glossaryReviewPrompt(book, items), model, maxTokens: 16384 })
    const wanted = new Set((extractJson(text).drop ?? []).map(t => String(t).trim().toLowerCase()))
    return { drop: items.filter(g => wanted.has(g.term.toLowerCase())).map(g => ({ term: g.term, zh: g.zh })), total: pool.length }
  }

  /** 全书回想（同步等待），结果存进 trans.bookRecall */
  async recallBook(bookId) {
    const settings = await this.store.settings()
    const book = await this.store.book(bookId)
    const trans = await this.store.translations(bookId)
    const state = (await this.store.state(bookId)) ?? {}
    const model = await this.resolveModel(settings)
    const chapters = book.chapters.map(c => ({ title: c.title, intro: trans.chapters[c.id]?.intro ?? '' }))
    const sessions = (state.sessions ?? []).map(sn => sn.recall?.summary).filter(Boolean)
    const text = await this.complete({ system: '你是一位带读经典著作的中文导师，只根据给定材料和你确切知道的事实说话。', user: bookRecallPrompt(book, { intro: trans.intro, chapters, sessions }), model, maxTokens: 2048 })
    const data = extractJson(text)
    const recall = {
      summary: typeof data.summary === 'string' ? data.summary.trim() : '',
      threads: (Array.isArray(data.threads) ? data.threads : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 6),
      questions: (Array.isArray(data.questions) ? data.questions : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 5),
      next: typeof data.next === 'string' ? data.next.trim() : '',
      at: new Date().toISOString(),
    }
    await this.store.mergeTranslations(bookId, { bookRecall: recall })
    return recall
  }

  status(bookId) {
    const e = this.books.get(bookId)
    if (!e) return { queued: 0, running: 0, errors: [] }
    const count = jobs => jobs.reduce((n, j) => n + (j.batch?.length ?? 1), 0)
    return {
      queued: count(e.queue) + e.retrying,
      running: count([...e.running]),
      jobs: { queued: e.queue.length, running: e.running.size },
      toc: this.hasJob(e, 'toc'),
      errors: e.errors.slice(0, 5),
    }
  }

  cancel(bookId) {
    const e = this.books.get(bookId)
    if (!e) return 0
    const n = e.queue.length
    e.queue.length = 0
    for (const job of e.running) job.abort?.abort()
    return n
  }
}

function groupByChapter(rows) {
  const groups = []
  let current = null
  for (const row of rows) {
    if (!current || current[0].chapter.id !== row.chapter.id) {
      current = []
      groups.push(current)
    }
    current.push(row)
  }
  return groups
}
