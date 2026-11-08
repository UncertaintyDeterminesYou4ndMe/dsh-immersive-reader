# dsh-immersive-reader · 阅读室

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）里用母语读原版书。

导入 EPUB / TXT / Markdown / HTML，或直接粘一个网页链接（像浏览器页面翻译一样抠正文），按章节由 dsh 里配好的模型精译：保留原文的论证、限定与语气，关键术语「中文（原文）」标注，
必要处附译注（一词多义取舍、历史与文化背景），每本书、每一章各有一段导读。阅读时默认只看译文，点一下段落就显示原文；
也可切到双语或原文模式。读到哪里，后台就从哪里往后预译（范围可设：往后 N 章或 N 段）。

表格会按表格还原：EPUB 里的 `<table>` 和 Markdown 表格解析成一个 `table` 段落（`rows` 保留结构，`text` 是 Markdown 表格），
模型逐格翻译并保持行列，阅读页渲染成真正的表格；重新导入同一本书时，译文按原文文本对回新的段落 id，不会错位。

导读式阅读：每天打开书按设定时长切出「今日份」（默认 30 分钟），份尾一张回想卡——模型按作者的论证顺序整理脉络、出三个回想问题、列本份关键概念；读完还想读就「再读一份」。
任一段落可「问 AI」：把原文、译文和你的问题直接丢进 dsh 的新会话，让 agent 讲背景、挑译文的毛病。每本书可单独设定译文风格与附加要求，并按新风格重译当前章。
EPUB 里的插图、图表按原位显示；表格按表格还原；脚注引用变成可点的 [n]，点开就在段落下方看注释（没译过的注释会当场译）。
行内追问：选中译文或原文里的一个词、一句话，弹出「划线 / 解释 / 追问」（全书导读、本章导读里选中同样可以解释、追问）——「解释」当场给出这个词在此处的含义、典故与背景；点开一段还有「这段在说什么」（作者意图与它在论证里的作用）和自由提问。答案记在段落下方，「目录」抽屉的「追问」页签汇总可跳转，不用离开阅读页，也不会打断 dsh 的会话。
导出 Markdown（「目录」→「本书」）：划线、笔记与追问合集，本章译文 / 双语，全书已译部分；文件写到书库 `exports/<书名>/`，也可一键复制。
读前读后：书架上每本书标出全书阅读时长与按每日份额要读几天；读到最后一章末尾有「全书到此」卡，可让模型按各章导读与你每一份的回想整理全书论证、贯穿线索、跨章回想问题与接着读什么。
翻到一章时第一批只译开头两三段，几秒内就有译文可读，后面的批次照常。第一次打开书直接落在第一个正文章节，封面、版权页、目录不翻译。
朗读：顶栏「朗读」用系统语音从当前位置逐段读译文（原文模式读原文），正在读的段落有标记并跟随滚动；点开一段也可「从这段朗读」。语速在设置里调。手机上长按选词同样会弹出「解释 / 追问」。
删书前会自动把划线、笔记与追问导出一份 Markdown 到 exports 目录。
全书搜索（原文与译文都搜）、划线与笔记（选中任意文字即可划线，也可整段；「目录」抽屉里有列表可跳转）、阅读统计（每本书累计分钟、天数、连续天数，书架与今日份卡上显示）。← / → 键翻章。

解决的问题：市面上一些译本译得生硬、与原文有出入；直接读原文又慢。让模型按「忠实 + 自然 + 一致 + 有背景」的要求逐段译，
读者在母语阅读体验里尽量贴近原作者。

## 安装

需要 dsh ≥ 0.2.0（Node ≥ 24.9）。

```sh
dsh plugin --profile web add github:UncertaintyDeterminesYou4ndMe/dsh-immersive-reader   # 从 GitHub
dsh plugin --profile web add /path/to/dsh-immersive-reader                              # 或本地目录
```

`client.js` 是已打好的浏览器产物，直接从 Git 源安装即可，不需要 bun。

重启 `dsh web`，左侧栏多一个「阅读室」图标。DSH-Android 同样走 dsh 的插件安装，界面是同一套。

官方桌面版（deepseek.com/harness/ 下载）独占自己的 profile：先打开过一次桌面版并完全退出，再用它自带的命令安装，或在应用内「插件」页添加：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add github:UncertaintyDeterminesYou4ndMe/dsh-immersive-reader
```

模型：默认跟随 dsh 当前默认模型（设置页可单独选），不需要也不读取任何 API key。

## 用法

1. 书架：导入文件（手机上直接选文件；桌面也可填绝对路径）。
2. 打开书：从上次位置继续。顶栏可切「译文 / 双语 / 原文」，「目录」抽屉里有章节、导读、术语表。
3. 译文模式下点段落：显示原文，并出现「重译」（可以写要求，如「更口语」）和「看译注」。
4. 设置：预译范围（章 / 段）、每份阅读时长、模型与思考强度、并发、译文风格、附加要求、是否写译注与导读、正文字体（宋 / 黑）、字号行高。「目录」抽屉的「本书」页签可设本书专属译风。

聊天里 agent 也能用：`reader_books`、`reader_import`、`reader_passage`（取某章原文与译文）、`reader_retranslate`、
`reader_glossary`、`reader_translate`。比如：「把《国家竞争优势》第 6 章第 12 段按更口语的方式重译」。

## 数据

全部落在 `$DSH_HOME/immersive-reader/`（默认 `~/.dsh/immersive-reader/`）：

```
settings.json
books/<id>/book.json    解析后的原文（章节 → 段落，id 稳定）
books/<id>/trans.json   译文、译注、术语表、导读
books/<id>/state.json   阅读位置与每日阅读份（含回想）
books/<id>/settings.json 本书译风覆盖
books/<id>/marks.json   划线与笔记
books/<id>/asks.json    行内追问（选中解释、这段在说什么、自由提问）
exports/<书名>/          导出的 Markdown
books/<id>/assets/      插图
books/<id>/source.epub  原始文件
```

可在 profile 的 `cordis.patch.yml` 里按 id 覆盖书库目录：

```yaml
- id: immersive-reader
  name: 'dsh-immersive-reader'
  config:
    libraryDir: /absolute/path
```

## 已知限制

- 网页导入只取文字（含表格），不下载图片；需要登录或靠脚本渲染的页面抠不到正文。

- 预译队列在内存里，重启 dsh 会丢掉未完成的任务；下次打开该章会重新排队。
- 不要同时用 Web 版和桌面版打开同一个书库：两个宿主各自翻译、各自写 trans.json，可能互相覆盖。

## 开发

```sh
npm install            # 只有 fflate 一个运行时依赖
node --test            # 解析器 + 翻译引擎（假模型）测试；依赖真实 EPUB 的用例读 test/fixtures/porter.epub（或 IR_TEST_EPUB），缺文件自动跳过
node build.mjs         # 用 bun 把 src/client/ 打成 client.js（产物提交进仓库，安装方不需要 bun）
```

结构：

```
index.js              宿主入口：inject webServer + llm；tools 就绪后注册 reader_* 工具
lib/store.js          书库落盘（整文件原子写）
lib/epub.js           EPUB → BookDoc（fflate 解包，自写 XML/HTML tokenizer）
lib/html-text.js      XHTML → 文本块
lib/text.js           TXT / Markdown → BookDoc（识别「第 N 章」「Chapter N」等）
lib/translate.js      提示词、分批、解析、预译队列（ctx.llm.stream）
lib/routes.js         /api/immersive-reader/**
lib/tools.js          agent 工具
src/client/           浏览器半（React，挂在 dsh 的 main + sidebar.panellist 两个 slot）
```

## 许可

MIT
