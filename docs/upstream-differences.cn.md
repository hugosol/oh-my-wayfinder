# 上游对比蓝图

[English](./upstream-differences.md) · [返回 README](../README.cn.md)

这份蓝图回答两个问题：**本仓库相对上游改变了什么？分散在不同 skill 和 mapping op 中的改动，怎样组成一个完整设计？**

它不是调用教程，也不重新定义执行规则。选择下一步用 [Ask Matt](../skills/ask-matt/SKILL.md)；准确执行某项机制时，以对应 skill 及其引用的协议为准。这里的“上游”指本仓库保存的快照，而不是持续变化的上游 HEAD；快照与更新方法见[维护指南](./maintenance.cn.md)。

## 1. 文档语义与职责边界

### 每个载体承载什么？

| 载体 | 回答的问题 | 边界与权威入口 |
|---|---|---|
| Map | 我们要去哪里，已确认结果在哪里，哪些问题尚未明确或在范围外？ | 低分辨率导航，不复制详细政策；[Wayfinder](../skills/wayfinder/SKILL.md#the-map) 定义地图，具体索引结构以该 skill 为准。 |
| Decision ticket | 本票要解决什么，探索到哪里，下一步怎样继续？ | 保存问题、紧凑讨论、候选与拒绝理由、证据限制及恢复点；不作为跨票政策权威。见 [Local ticket handoff](../skills/wayfinder/SKILL.md#local-ticket-handoff)。 |
| Lighthouse | 当前已经决定什么，为什么，在什么条件下成立，对其他问题有什么约束？ | 已确认政策的唯一权威；来源票可以尚未完成。偏好可解释理由，但不自动成为保证。见 [Lighthouse](../skills/lighthouse/SKILL.md)。 |
| Spec | 这项工作为什么存在，要解决什么问题，形成什么方案？ | 保留需求与已确定的实现决策；新的测试 seam 审批移交契约。见 [To-spec](../skills/to-spec/SKILL.md)。 |
| Contract | 承诺什么，在哪个 seam 观察，采用什么验收方式？ | 已批准的决策制品，不是实现状态台账；设计已批准不等于能力已交付。见 [To-contract](../skills/to-contract/SKILL.md)。 |
| Implementation ticket | 本次实现交付哪些承诺，承担哪些覆盖责任？ | 从契约分配工作与验收要求，供执行者使用；不把决策票当作生产交付票。见 [To-tickets](../skills/to-tickets/SKILL.md)。 |
| Retro 记录 | 这次执行暴露了什么环境或工作方式问题？ | OMP 扩展保存独立复盘与执行状态，建议不自动执行，也不是验收证明。位置与使用限制见[扩展指南](./spec-to-code.cn.md)。 |

Decision ticket 可以引用其他票的 Lighthouse，也可以接收经确认、归本票负责的 gap 问题。它不承担的是**跨票政策的复制和权威传递**，不是禁止一切跨票联系。

### 新增 skill 的分工

- **Lighthouse**：把已确认选择及批准修订发布为权威决策文档。
- **Backtracer**：从本次发布结果或具体冲突出发，定向回溯相关前提，报告 gap 与矛盾，并交接经确认的缺口问题。
- **Traverse**：汇集整张地图、票据与 Lighthouse，检查完整决策树，而不是只检查本次变化。
- **To-contract**：把规格转成已批准的承诺、测试 seam 与验收安排。

新增 skill 为手写源码，没有对应的 mapping op。以下流程把它们与改造的上游 skill 一起解释。

## 2. 流程变更：规格 → 契约 → 实现票 → 验证

**上游基线：** To-spec 选择并确认测试 seam，再将规格交给 To-tickets；TDD 负责测试先行实现。

**本仓库变化：** seam 审批从 To-spec 移到新增的 To-contract；切票必须基于已批准契约，执行侧接收明确的交付与覆盖责任。

```text
Spec：需求与方案
  → Contract：承诺、观察 seam 与验收安排
  → Implementation tickets：交付分配与测试归属
  → TDD：能够发现违约行为的测试与验证证据
```

这是一条责任交接链，不是四个互不相关的 skill 调整：

- To-spec 不再重新决定 seam；对话中已确定的 seam 可作为事实记录。
- To-contract 明确承诺与观察方式。它不是把 spec 换一种格式再写一遍。
- To-tickets 明确 `Delivers`／enabling 工作及拆分承诺的测试归属，减少切票时遗漏或重复覆盖。
- TDD 优先使用实现票携带的验收要求、覆盖责任和已批准 seam；必要细节缺失时才追溯上游，不例行重建整个 contract。
- 测试设计围绕独立的期望与具体可发生的违约行为；测试名称或 coverage ID 只提供追溯，不能替代证明。完成报告区分已有证据与未验证事项。

### 实现追溯

| 归属 | 主要 op 或源码 |
|---|---|
| seam 职责迁移 | [To-spec mapping](../deltas/mappings/to-spec.md)：[seam-handoff](../deltas/mappings/to-spec.md#seam-handoff)、[testing-decisions](../deltas/mappings/to-spec.md#testing-decisions) |
| 契约与批准 | 新增 [To-contract](../skills/to-contract/SKILL.md) |
| 契约输入与切票责任 | [To-tickets mapping](../deltas/mappings/to-tickets.md)：[contract-input](../deltas/mappings/to-tickets.md#contract-input)、[contract-gate](../deltas/mappings/to-tickets.md#contract-gate)、[delivers](../deltas/mappings/to-tickets.md#delivers)、[coverage-quiz](../deltas/mappings/to-tickets.md#coverage-quiz)、[template-delivers-local](../deltas/mappings/to-tickets.md#template-delivers-local)、[template-delivers-issue](../deltas/mappings/to-tickets.md#template-delivers-issue) |
| 执行输入与 seam 沿用 | [TDD mapping](../deltas/mappings/tdd.md)：[ticket-brief](../deltas/mappings/tdd.md#ticket-brief)、[seam-approval](../deltas/mappings/tdd.md#seam-approval)、[ask-when-unapproved](../deltas/mappings/tdd.md#ask-when-unapproved) |
| 测试设计与证据 | 同一 mapping：[tests-mocking-pointer](../deltas/mappings/tdd.md#tests-mocking-pointer)、[loop-rules](../deltas/mappings/tdd.md#loop-rules)、[completion](../deltas/mappings/tdd.md#completion)、[acceptance-section](../deltas/mappings/tdd.md#acceptance-section)、[red-flag-wording](../deltas/mappings/tdd.md#red-flag-wording)、[external-interaction-note](../deltas/mappings/tdd.md#external-interaction-note)、[behavior-under-test-real](../deltas/mappings/tdd.md#behavior-under-test-real)、[deterministic-doubles](../deltas/mappings/tdd.md#deterministic-doubles) |
| 路由衔接 | [Ask Matt mapping](../deltas/mappings/ask-matt.md)：[contract-gate](../deltas/mappings/ask-matt.md#contract-gate)、[contract-context](../deltas/mappings/ask-matt.md#contract-context) |

完整规则分别由上述 skills，以及 TDD 的 [tests.md](../skills/tdd/tests.md)／[mocking.md](../skills/tdd/mocking.md) 承载。

## 3. 流程变更：Grilling 暂停、保存、切换与恢复

**上游基线：** 工作循环围绕选票、按类型解决、记录结案展开，没有本仓库的未完成票发布与恢复协议。

**本仓库变化：** 讨论可以在整票尚未解决时安全中断；当前恢复上下文与已确认政策分别保存，不靠追加整段历史来恢复。

暂停／切换与单纯保存进度并不相同：前者在完成交接后释放当前未完成票的认领，后者保留认领。暂停不代表原问题已解决，更不代表未答分支已获批准。恢复会结合期间新发布的相关结果，重新判断可继续的问题。

这个流程使用下一节的**发布与回溯闭环**，再完成恢复交接和认领处理；这里不另定义发布顺序或失败处理。

### 实现追溯

- 主要 op：[grilling-pause-trigger](../deltas/mappings/wayfinder.md#grilling-pause-trigger)、[grilling-pause](../deltas/mappings/wayfinder.md#grilling-pause)、[grilling-context-reuse](../deltas/mappings/wayfinder.md#grilling-context-reuse)、[grilling-frontier-refresh](../deltas/mappings/wayfinder.md#grilling-frontier-refresh)。
- 共享基础：[local-ticket-handoff](../deltas/mappings/wayfinder.md#local-ticket-handoff)。
- 权威规则：[Wayfinder Pause](../skills/wayfinder/SKILL.md#pause)、[Local ticket handoff](../skills/wayfinder/SKILL.md#local-ticket-handoff)。

## 4. 流程变更：Lighthouse + Backtracer 发布与回溯闭环

**上游基线：** 答案在票据解决时记录，map 的已决定结果索引围绕已关闭票展开。

**本仓库变化：** 结果发布与整票完成分离；已确认的部分结果可被索引、引用和回溯，即使来源票仍未完成。

```text
已确认结果 → Lighthouse 权威主题 → map 索引与跨票引用
                       ↓
             Backtracer 回溯相关前提
                       ↓
          用户判断发现 → gap 责任归属或冲突裁决
```

普通确认与已批准修订先留在对话，到暂停、保存、切换或整票完成等发布边界批量处理。修订更新原 Lighthouse 主题，其他票启动／恢复时读取权威，不由上游批量复制政策。

Backtracer 的范围是相关已发布主题，包含未完成票中的已发布部分，而非只读 resolved 票或每次扫描整张地图。已有 open 票覆盖一个问题，不意味着前提已满足，也不应因此重复建票。它负责诊断与经确认 gap 的问题交接，不替用户裁决冲突、改写政策或同步消费者副本。

### 实现追溯

- 发布权威与结果索引：[answer-recording](../deltas/mappings/wayfinder.md#answer-recording)、[local-ticket-handoff](../deltas/mappings/wayfinder.md#local-ticket-handoff)、[confirmed-result-index](../deltas/mappings/wayfinder.md#confirmed-result-index)、[partial-result-links](../deltas/mappings/wayfinder.md#partial-result-links)、[lighthouse-on-resolution](../deltas/mappings/wayfinder.md#lighthouse-on-resolution)。
- 回溯接入与修改边界：[backtracer-on-resolution](../deltas/mappings/wayfinder.md#backtracer-on-resolution)、[follow-up-ticket-handoffs](../deltas/mappings/wayfinder.md#follow-up-ticket-handoffs)、[map-invalidation-boundary](../deltas/mappings/wayfinder.md#map-invalidation-boundary)。
- 新增源码：[Lighthouse](../skills/lighthouse/SKILL.md)、[Backtracer](../skills/backtracer/SKILL.md)。
- 批次跟进由共享 [Gap follow-up](../skills/backtracer/GAP-FOLLOWUP.md) 定义，不在每个调用入口重写。

### 配套变化：问题级推进与跨票确认

用户可指定仍 blocked 的票中输入已经齐备的局部问题，但不会因此解锁整票。当前讨论若回答了另一张未完成票负责的问题，可确认决策内容与目标文件名，在发布边界写入其 Lighthouse，而不自动切票、认领或修改目标票的其他范围。已有认领仍需尊重；政策修订仍需明确裁决。

追溯：[user-named-question](../deltas/mappings/wayfinder.md#user-named-question)、[cross-ticket-confirmation](../deltas/mappings/wayfinder.md#cross-ticket-confirmation)、[cross-ticket-filename](../deltas/mappings/wayfinder.md#cross-ticket-filename)、[cross-ticket-claim-exception](../deltas/mappings/wayfinder.md#cross-ticket-claim-exception)，并复用 `grilling-frontier-refresh`。权威入口：[Cross-ticket confirmation](../skills/wayfinder/SKILL.md#cross-ticket-confirmation)。

## 5. 流程变更：Traverse 全局终审

上游地图解决后交给 To-spec；本仓库新增 Traverse，在所有票 resolved 后检查整张决策树的依赖覆盖、同级对称、层次完整与边界衔接。

它可以理解为与 Backtracer 互补的全局审阅，但不是只把同一次回溯扩大范围：Backtracer 从变化出发，Traverse 从完整地图出发。发现未答问题后仍需收口或返回规划，所有票 resolved 并不是设计完整的证明。

- 新增权威源码：[Traverse](../skills/traverse/SKILL.md)。
- 路由接入：[wayfinder-quality-loop](../deltas/mappings/ask-matt.md#wayfinder-quality-loop)。
- 复用协议：[Gap follow-up](../skills/backtracer/GAP-FOLLOWUP.md)。

## 6. 扩展能力：OMP 自动实现与复盘

`/spec-to-code` 是独立的 OMP 扩展，不是新增的通用 skill。它以准备好的 spec 与已批准 contract 为输入，自动切票，再按依赖顺序串行派发 TDD。

上游已有 Retro；本仓库增加的是**宿主自动触发和结果留存**：每次 TDD 执行，包括失败执行和独立 retry，都有单独复盘。实现结果与复盘结果分开，复盘建议不自动执行，运行结束也不等于全部验收完成。

这部分没有 mapping op：

- 扩展入口：[spec-to-code.ts](../extensions/spec-to-code.ts)。
- 复盘编排与原会话调用：[retro-workflow.ts](../extensions/spec-to-code/retro-workflow.ts)、[retro-host.ts](../extensions/spec-to-code/retro-host.ts)。代码是内部机制的权威来源。
- 路由介绍：[omp-automation](../deltas/mappings/ask-matt.md#omp-automation)。
- 安装、配置、输出目录与限制：[扩展使用指南](./spec-to-code.cn.md)。

新增独立命令 [`/hyper-auto-coding`](./hyper-auto-coding.cn.md)，借鉴上游 `implement-spec` 的依赖 frontier 与每票 worktree，但集成分支由用户预先创建并提交 spec/contract。它原样复用现有 Phase 1，提交票据后并行实现、串行合并验证；最终由独立 reviewer/fixer 评审、自动修复并提交。只有票据实现执行触发 retro，报告先在系统临时目录生成，收尾统一提交；成功后清理 worktree、保留 branch。不增加 Phase 1 门禁、重试次数策略或中断恢复。实现见 [`hyper-auto-coding/`](../extensions/hyper-auto-coding/)，配置与 Jev 共用现有文件，默认实现并发数 4。

其他 agent 用户可手动完成通用流程，不会仅靠复制 skills 获得 OMP 的自动调度。

## 7. 决策生命周期、适用范围与迁移影响

决策票解决规划问题，实现票交付生产行为。本地决策状态为 `open → claimed → resolved`，`Type` 表示处理方式；triage 仅用于实现票。`resolved` 可能记录已批准的范围外处置，不等于原问题已经有答案，也不等于下游依赖已满足。

| 变化 | 实现追溯 |
|---|---|
| 生命周期、类型与工作入口 | Wayfinder：[decision-ticket-lifecycle](../deltas/mappings/wayfinder.md#decision-ticket-lifecycle)、[processing-type-storage](../deltas/mappings/wayfinder.md#processing-type-storage)、[processing-type-read](../deltas/mappings/wayfinder.md#processing-type-read)、[recorded-type-work](../deltas/mappings/wayfinder.md#recorded-type-work)、[tracker-conventions](../deltas/mappings/wayfinder.md#tracker-conventions) |
| 结果而非结案状态满足前提 | [blocking-evidence](../deltas/mappings/wayfinder.md#blocking-evidence)、[out-of-scope-disposition](../deltas/mappings/wayfinder.md#out-of-scope-disposition) |
| 本地存储与字段配套 | [Setup mapping](../deltas/mappings/setup-matt-pocock-skills.md)：`local-conventions`、`local-decision-handoff`、`local-status-field`、`local-blocking`、`local-publish`、`local-map-and-child`、`local-frontier`、`local-resolve` |
| 实现票 triage 与配置表述 | 同一 mapping：`setup-choice-wording`、`triage-labels-bullet`、`section-b-defaults`、`triage-labels-body` |
| 实现票路径与路由 | To-tickets 的 [local-path](../deltas/mappings/to-tickets.md#local-path)，Ask Matt 的 [local-path](../deltas/mappings/ask-matt.md#local-path) |

扩展的 Wayfinder 暂停／发布／回溯循环目前只针对本地 Markdown tracker，GitHub／GitLab 配置没有接入这套扩展循环。

已有本地项目需要注意：实现票由 `.scratch/<feature>/issues/` 改为 `.scratch/<feature>/implementation/`，决策票使用独立 `decision/`。替换技能文件不会迁移票据或项目配置。重新运行 setup，检查并确认持久化配置更新；旧 triage 状态的决策票应按实际含义逐张核对，不机械转换成 `resolved`。

字段与存储规则见[本地 tracker 模板](../skills/setup-matt-pocock-skills/issue-tracker-local.md)，完成和依赖处置规则见 [Wayfinder](../skills/wayfinder/SKILL.md)。

## 8. 其他局部变更

| 变更 | 相对上游的差异 | 实现追溯 |
|---|---|---|
| 开场目标句 | Grilling 开始时用项目规范术语说明本票决定什么、怎样推进 Destination；不是新的独立流程 | [grilling-opening-brief](../deltas/mappings/wayfinder.md#grilling-opening-brief) |
| Prototype 交接 | 交回包含选定结果与 `VERDICT.md` 的 worktree，还原工作区；不在此处生成 spec／ticket | [Prototype mapping](../deltas/mappings/prototype.md)：`skill-hand-back-worktree`、`logic-hand-back-worktree`、`ui-hand-back-worktree`；模式与可迁入性表述为 `prototype-mode-heading`、`prototype-mode-choice`、`logic-mode-routing`、`logic-module-liftability`、`ui-mode-routing`；Wayfinder 的 [prototype-worktree-asset](../deltas/mappings/wayfinder.md#prototype-worktree-asset)，Ask Matt 的 `prototype-worktree-detour`／`prototype-worktree-standalone` 衔接 |
| Code review 默认目标 | 默认审阅相对 `HEAD` 的未提交改动，包含未跟踪文件并尊重 `.gitignore`；固定点仍可指定，spec 来源需明确 | [Code-review mapping](../deltas/mappings/code-review.md)：`default-target`、`intro-line`、`capture-review-target`、`spec-source`、`standards-prompt-target`、`spec-prompt-target`；Ask Matt 的 [review-default](../deltas/mappings/ask-matt.md#review-default) |
| 路由用词 | 避免用 Git 分支术语表达普通流程选择 | [Ask Matt mapping](../deltas/mappings/ask-matt.md)：`conversation-choice-wording`、`build-scope-choice-wording`、`phase-choice-wording` |

## 怎样使用这份蓝图维护项目？

一个流程可以跨多个 mapping，一个 op 也可能为多个流程提供共享基础。这里按整体变更组织，mapping 按独立可修改的行为组织；不要为了与章节一一对应而合并 op。

先找到相关流程，再沿 op 或手写 skill 链接定位权威源。Mapping 的实际 anchor、顺序依赖与编辑内容仍以源文件为准；新增或调整流程时同步更新这份中英文蓝图。修改与构建方式见[维护指南](./maintenance.cn.md)。
