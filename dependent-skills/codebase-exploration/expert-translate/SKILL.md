---
name: expert-translate
description: 按 AI 专家分类的双语对照翻译。输入带 URL 时自动匹配专家,其他输入打印专家列表供选择。译文可生成长图。
disable-model-invocation: true
---

# expert-translate — AI 专家翻译

按沉浸式翻译的 AI 专家体系翻译:输入带 URL 时按站点自动匹配专家;否则打印专家列表由用户选择。译文以母语级流畅为第一目标,输出原文+译文左右双栏对照。

## 调用流程

1. **判定输入来源** — 输入含 URL 或文件路径?是 → 步骤 2;否 → 步骤 3。
   完成:已确定走自动匹配还是用户选择。
2. **URL 匹配专家** — 取 URL 的域名查《URL 专家表》。唯一命中 → 读取 `prompts/` 中与该行专家 id 同名的文件(如命中 github 行 → 读取 `prompts/github.md`);未命中或命中多个 → 步骤 3。
   完成:领域增量已加载,或已转入用户选择。
3. **用户选择专家** — 读取 `experts.md`,把 16 个专家和"通用"选项打印给用户,等其回复。选"通用"→ 不加载领域文件;选专家 → 读取 `prompts/` 中与该行 id 同名的文件(如选科技类翻译大师 → 读取 `prompts/tech.md`)。
   完成:用户已选择,领域增量已加载(或明确为通用)。
4. **翻译** — 按《翻译规则》和已加载的领域增量翻译全部输入,左右双栏对照输出。
   完成:输入的每个段落都有译文,原文译文一一对应;每处有言外之意或文化背景的段落都附了译注。
5. **生成长图(可选)** — 用户要求把译文生成长图时,读取同目录 `long-image.md`,按其版式与渲染参数生成 PNG 到当前目录。
   完成:长图已生成并通过该文件中的完成标准。

## 翻译规则

- **双语对照**:左右双栏——原文在左栏、译文在右栏,段落边界与原文一致,同一段落左右对齐;输出载体不支持双栏时退化为逐段上下对照(原文在上、译文在下)。
- **术语**:术语以英文名词为主——首次出现写"英文术语(中文注释)",后续提及直接用英文名词;人名、机构名、产品名、代码、标识符、URL、文件名保留原文。
- **机翻腔**:译文要读起来像中文母语者写的——短句为主,动词驱动,主语明确;定语不堆叠在名词前;优先主动语态;优先具体动词("进行分析"写"分析")。
- **长句拆解**:英文长句按意群拆成多个中文短句,主谓宾先行,修饰成分后置或独立成句,原文逻辑关系不变。
- **忠实度**:优先流畅,允许意译和重组句子;不增删信息——数字、日期、否定、程度词必须准确。
- **译注**:加少量译注,仅限歧义处——直译会让中文读者看不出言外之意或缺背景时,紧跟相关译文加〔译注:…〕。典型场景:文化调侃与反讽("If only!" 实为反讽)、人物/作品背景缺口(Seth Godin 是谁、被与他比较为何带调侃意味)。只补原文隐含的信息,不添加原文没有的事实;全篇不超过 5 处。用户明确要求纯对照时省略。
- **段落结构**:段落数、段落边界与原文一致;原文的列表、引用、标题层级在译文中保留结构。

## URL 专家表

| 域名包含 | 专家 |
|---|---|
| github.com | github |
| reddit.com, old.reddit.com, m.reddit.com, reddit.app.link | reddit |
| twitter.com, x.com | twitter |
| techcrunch.com, theverge.com, wired.com, arstechnica.com, cnet.com, engadget.com, zdnet.com, tomshardware.com, techradar.com, techspot.com, techdirt.com, theregister.com, gizmodo.com, mashable.com, pcmag.com, digitaltrends.com, stackoverflow.com, news.ycombinator.com, hn.algolia.com | tech |
| cnn.com, bbc.com, nytimes.com, theguardian.com, reuters.com, apnews.com, wsj.com, bloomberg.com, ft.com, cnbc.com, economist.com, forbes.com, politico.com, vox.com, washingtonpost.com, time.com, newsweek.com, npr.org, scmp.com, aljazeera.com | news |
| bloomberg.com, wsj.com, ft.com, cnbc.com, finance.yahoo.com, marketwatch.com, investopedia.com | financial |
| coindesk.com, cointelegraph.com, cryptoslate.com, decrypt.co, theblockcrypto.com, bitcoinmagazine.com, ethereum.org, coinmarketcap.com, coingecko.com, opensea.io, metamask.io, uniswap.org, binance.com, crypto.com | web3 |
| ign.com, gamespot.com, kotaku.com, polygon.com, eurogamer.net, pcgamer.com, rockpapershotgun.com, gameinformer.com, gamesradar.com, destructoid.com, vg247.com, metacritic.com, steamcommunity.com, nexusmods.com | game |
| wattpad.com, fanfiction.net, royalroad.com, webnovel.com, wuxiaworld.com, novelupdates.com, qidian.com, 17k.com, babelnovel.com | fiction |
| archiveofourown.org, isnull.info, i.aois.top, xn--iao3-lw4b.ws | ao3 |
| billboard.com, rollingstone.com, nme.com, pitchfork.com, stereogum.com, genius.com, allmusic.com, spotify.com, xxlmag.com, thefader.com | music |
| mayoclinic.org, webmd.com, medicinenet.com, ncbi.nlm.nih.gov | medical |
| law.com, abajournal.com, law360.com, jurist.org, law.cornell.edu, findlaw.com, justia.com, nolo.com, lawyers.com | legal |
| designmilk.com, dezeen.com, archdaily.com, yankodesign.com, core77.com, designboom.com, artsy.net, artnet.com, artforum.com, artnews.com | design |
| gutenberg.org, app.immersivetranslate.com/ebook | ebook |
| bilingual-mix 无站点(中→英风格,仅列表选择) | bilingual-mix |

域名同时出现在多个专家的(如 bloomberg.com 属 news 和 financial)→ 命中多个,按步骤 3 交用户选择。
