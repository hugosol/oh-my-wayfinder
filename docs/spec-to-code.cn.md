# `/spec-to-code`：从 spec 到代码

[English](./spec-to-code.md) · [仓库 README](../README.cn.md)

`/spec-to-code` 是本仓库为 [Oh My Pi](https://github.com/can1357/oh-my-pi)（OMP）提供的自动化扩展：一条命令把准备好的 spec 切成实现票，并用串行 TDD 子代理逐票执行。它是可选项，且仅支持 OMP——通用 Markdown skills 不依赖它，只复制 skills 也不会安装它。

fork 改动的内容与位置由[上游对比蓝图](./upstream-differences.cn.md)维护；本页负责安装、运行与结果解读，具体行为以[扩展源码](#源码索引)为准。

## 运行前准备

两个输入都位于 `.scratch/<slug>/`：

- `spec.md`——由 `/to-spec` 发布的 spec。
- `contract.md`——由 `/to-contract` 写出的已批准契约。切票以契约为输入；没有契约时 Phase 1 会停下并要求先运行 `/to-contract`（[to-tickets skill](../skills/to-tickets/SKILL.md)）。

### 安装

从本仓库复制以下产物，保持相对布局；同一入口还注册独立的[并行命令 `/hyper-auto-coding`](./hyper-auto-coding.cn.md)：

```text
<extension root>/
  entry.ts              # 共享扩展入口，注册两个命令
  implementation-node/  # 共用 TDD 执行记录与 retro 生命周期
  integration-node/     # 单票合并、集成测试与冲突续跑
  spec-to-code/          # 共用 Phase 1 与配置模块
  hyper-auto-coding/     # 并行命令配套模块，入口以相对路径导入
  agents/
    tdd.md               # blocking 的 `tdd` task agent，自动加载 `tdd` skill，自带模型声明
```

`implementation-node/tdd-execution.ts` 的主体是 `TddWorkFlow`：以 TDD 执行尝试为主，独立 retro 是后续附加动作；TDD 派发仍由现有工作流负责。`integration-node/ticket-integration.ts` 拥有每票合并尝试、集成报告及可续跑集成会话的状态。`hyper-auto-coding/workflow.ts` 负责 ticket 调度、集成与报告发布；可选的验收范围由普通 ticket 承载，不再有独立最终验证流程。`agent-tools.ts` 定义供主代理调用的工作流工具。

更新已有安装时，替换原有布局，并将按文件配置的扩展入口改为 `entry.ts`；只加载一个入口，避免重复注册工具和命令。

自带的 `tdd.md` 在 frontmatter 中固定了 `deepseek/deepseek-flash:high`；模型配置不同时，请修改安装后的副本。

按 OMP 的常规方式加载入口：

- 自动发现：`<cwd>/.omp/extensions/`（项目）或 agent 目录下的 `extensions/`（默认 `~/.omp/agent/extensions/`）。
- 显式配置：把根目录加入 `~/.omp/agent/config.yml`（用户）或 `<cwd>/.omp/config.yml`（项目；`.omp/settings.json` 亦可）的 `extensions:`，或以 `omp -e <path>` 启动。

`agents/tdd.md` 需要放在 OMP 能发现 task agent 的位置：作为**目录形式**扩展根的 `agents/` 兄弟目录（`config.yml` 条目或 `omp -e <dir>`），或放入 `<cwd>/.omp/agents/`（项目）／`~/.omp/agent/agents/`（用户）。只以文件形式加载入口时，没有可扫描的 `agents/` 兄弟目录。

### 依赖

- 需要 `to-tickets` 与 `tdd` 两个 skill（本仓库的改造版，随[快速开始](../README.cn.md)中的覆盖步骤安装）以及 `tdd` agent。命令启动前自动检查，缺什么就报什么，无需人工确认。
- 复盘加载已安装、未修改的上游 `retro` 与 `writing-for-agents` skill；两者不在启动检查范围内：缺任一个时，该次执行的复盘报告为未交付，TDD 继续执行。

### 配置（可选）

`extensions/spec-to-code/config.json` 只在扩展加载时读取一次，修改后需重新加载扩展：

```json
{ "jev": { "enabled": false }, "hyperAutoCoding": { "maxParallelTickets": 4 } }
```

`hyperAutoCoding.maxParallelTickets` 只用于并行命令，不改变本命令的串行行为。

开启 `jev.enabled: true`，且宿主 `judge` 角色能解析出原生 judge 模型（例如 TypeSafe Jev 的 `typesafe/jev-latest`）时，由 judge 选择每条自动回复。第一轮只提供「请你仔细思考后回答这些问题」／「请生成文件」，因此第一条自动回复绝不可能是空泛的「请继续」；「请继续」从第二轮起加入。没有可用 judge 或 judge 调用失败时，回退到固定序列。

## 运行

```text
/spec-to-code <slug>
```

这是唯一的手动步骤；运行由启动它的 session 驱动。之后两个阶段全自动：Phase 1 用 `to-tickets` 切票，Phase 2 逐票执行。

Phase 1——切票：

- 扩展携带 spec 与 contract 路径激活 `to-tickets`，票据写入 `.scratch/<slug>/implementation/`；
- 期间每次 `ask` 都被自动代答为「请你仔细思考后回答这个问题」，不再等待人工输入（不在运行中时，`ask` 行为不变）；
- 每次回合结束发送一条自动回复：默认走固定序列（先「请你仔细思考后回答这些问题」，之后「请生成文件」），Jev 模式下由 judge 选择；
- 自动干预有上限：`ask` 代答与自动回复各消耗一次，单次运行共 15 次；用尽时若票据尚未落盘，运行停止并把控制权交还给你，若票据已落盘则直接进入 Phase 2；
- `.scratch/<slug>/implementation/` 出现非空票据文件时 Phase 1 立即结束（Jev 模式下从第 2 轮起，该检查先于 judge 判断）。回合异常结束（aborted／error）或用尽预算时会停止，而不是空转。

Phase 2——串行 TDD：

- 按依赖边排序票据；同一时刻只有一个 `task(agent="tdd")`，每票等待上一票完成；
- 如果工作流重试失败票据，retry 是一次独立的新 TDD 执行，并有自己的复盘；本功能不额外提供自动重试策略；
- 每次执行（含失败）结束后，宿主在原 TDD 会话启动后台复盘；后续 TDD 不等待复盘，你也不需要等；
- 全部执行与 retry 结束后，运行调用 `spec_to_code_finish` 等待所有复盘到达成功或失败终态并返回汇总；在此之前不会收尾。

## 复盘写在哪里

每次执行都有独立复盘：在**原 TDD 会话**中基于该会话历史运行（不增加工作区快照或 worktree 编排），返回 Markdown 正文，由宿主保存执行记录和成功交付的复盘正文：

```text
.scratch/<slug>/retro/<ticket-file>/<run-id>.json
.scratch/<slug>/retro/<ticket-file>/<run-id>.md
```

- JSON——执行记录：本次 TDD 结果、独立的 retro 状态与错误、身份信息与路径。从执行开始时写入，因此即使复盘未交付，TDD 结果也会保留。
- Markdown——已交付的复盘正文及来源会话、执行信息，方便追溯到被复盘的工作；只有复盘交付成功时才有正文。

如何解读：

- `tdd_status` 表示执行结果；票据是否验收以各次 TDD 报告为准，而不是运行汇总。
- 实现结果与复盘结果相互独立：复盘交付不等于验收通过，复盘失败也不改变实现结果。
- 收尾汇总列出每次执行的两个状态与文件路径，以及从未派发的票据。

## 自动化不等于正确性保证

自动化推进会话并记录执行结果，但不会独立证明实现正确。

- 自动回复不是对 agent 提问的回答：固定回复要求 agent 自行思考或生成文件，judge 也只是在同一小组回复中选择。
- 切票是否合理、是否验收、复盘结论是否成立，都由你复核；运行本身不以它们为门禁。运行结束会报告已尝试、未执行与已交付的工作，不代表工作正确。
- 复盘只提建议：复盘被要求不执行建议，不修改代码、配置、skill 或代理指令，也不自行写文件。
- `/spec-to-code` 不会运行 code review；串行流程只调用 `to-tickets`、`tdd`、`retro` 与 `writing-for-agents`。

## 实际限制

- 有界限的自动回复：单次运行最多 15 次自动干预；在票据落盘前用尽预算时，运行停止并交还控制权。
- 没有恢复队列：调度状态保存在内存中，JSON/Markdown 文件只是审计记录。进程崩溃后遗留的 pending/running 记录只代表最后观察到的状态，不会自动续跑。
- 取消：切换或关闭所属 session 会取消其后台复盘，取消后不会自动恢复。
- 复盘可能未交付：缺少 `retro` 或 `writing-for-agents` skill、原会话不可用、隔离执行、正文为空或截断、文档写入失败，都会产生未交付复盘并给出警告；执行记录写入失败同样会被报告。
- 复盘失败是终态：不阻塞 TDD、不改变实现结果、不自动重试，也不阻塞最终汇总。
- 同一时间只允许一次运行：已有运行进行中时，新的 `/spec-to-code` 会被拒绝。
- 后台复盘暂不限制并发。

上述行为详见 [`tdd-execution.ts`](../extensions/implementation-node/tdd-execution.ts) 与 [`retro-host.ts`](../extensions/implementation-node/retro-host.ts)。

## 源码索引

- 入口与安装布局：[`extensions/entry.ts`](../extensions/entry.ts)
- 回复、预算与停止条件：[`turn-policy.ts`](../extensions/spec-to-code/turn-policy.ts)、[`workflow-session.ts`](../extensions/spec-to-code/workflow-session.ts)
- judge 链：[`jev-judge.ts`](../extensions/spec-to-code/jev-judge.ts)
- skill 激活与依赖预检：[`skill-activation.ts`](../extensions/spec-to-code/skill-activation.ts)
- TDD agent：[`extensions/agents/tdd.md`](../extensions/agents/tdd.md)
- 复盘行为、身份与输出文件：[`retro-host.ts`](../extensions/implementation-node/retro-host.ts)、[`tdd-execution.ts`](../extensions/implementation-node/tdd-execution.ts)
- 配置：[`config.json`](../extensions/spec-to-code/config.json)、[`config.ts`](../extensions/spec-to-code/config.ts)
- 使用的 skill：[to-tickets](../skills/to-tickets/SKILL.md)、[tdd](../skills/tdd/SKILL.md)；上游 `retro` 与 `writing-for-agents` 原样使用。
- fork 差异：[上游对比蓝图](./upstream-differences.cn.md)。
