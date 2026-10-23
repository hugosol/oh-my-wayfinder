# `/hyper-auto-coding`：以集成分支为中心异步交付

[English](./hyper-auto-coding.md) · [串行工作流](./spec-to-code.cn.md) · [仓库 README](../README.cn.md)

`/hyper-auto-coding <slug>` 是 OMP 专用启动命令；`/hyper-auto-coding pause` 与 `/hyper-auto-coding resume` 是唯一可以挂起和继续工作流的控制方式，见[暂停与恢复](#暂停与恢复)。它原样复用 `/spec-to-code` Phase 1；Phase 2 在每票 branch/worktree 中并行实现，随后异步测试与修复，仅共享集成工作区中的短暂 Git 操作串行。旧命令仍然串行，不编排 Git worktree。

## 安装与准备

按[扩展安装指南](./spec-to-code.cn.md#安装)安装同一个 `extensions/entry.ts` 入口，并同时复制 `implementation-node/`、`integration-node/`、`spec-to-code/`、`hyper-auto-coding/` 和 `agents/`。这个入口注册两个命令，不要重复加载。

所需 skills：本仓库的 `to-tickets`、`tdd`，以及 blocking 的 `tdd` agent；不再要求 `code-review`。`retro` 和 `writing-for-agents` 沿用已安装的上游版本，缺少时只报告对应复盘未交付。实现使用安装后的 TDD agent 模型，辅助工作使用宿主 task agent 的模型设置。

开始前，用户必须：

1. 创建并检出本地集成分支，不能是 `main`/`master` 或 detached HEAD。
2. 将 `.scratch/<slug>/spec.md`、`contract.md` 及相关输入提交到该分支。
3. 保持工作区和暂存区干净，并提供可用的本地 Git 提交身份。

所有 Git 操作仅在本地发生，不 push、不创建 PR、不合入 main。不自动创建集成分支、stash 或提交无关修改。slug 是单个安全路径片段。

## 配置

与 Jev 共用 `extensions/spec-to-code/config.json`，扩展加载时读取一次：

```json
{
  "jev": { "enabled": false },
  "hyperAutoCoding": { "maxParallelTickets": 4 }
}
```

`maxParallelTickets` 是正整数，缺省为 4，只限制同时运行的票据实现，不限制集成子代理或 retro。修改后重新加载扩展。旧 `/spec-to-code` 保持串行。

## 执行顺序

### Phase 1：复用切票

原样沿用 `/to-tickets` 激活、自动回答、Jev、15 次自动干预预算和票据落盘触发机制。不新增整套票据完整性门禁；已有非空票据按原规则结束 Phase 1。随后把 `implementation/` 中的票据与 `<slug>/contract.md`（Phase 1 填入的“Delivering work”映射）一起提交；若仍留有其他已跟踪或未跟踪改动，则拒绝进入 Phase 2，因为之后的每次合入都要求集成分支完全干净。

### Phase 2：实现与后台集成

主代理读取已发布票据并登记执行依赖图，不重新切票。主代理只负责流程流转，不阅读报告判断验收证据是否充分，也不逐票调用 accept/confirm。子代理自行负责验收，正常退出按成功处理；不根据报告正文猜测成功或失败。

- 首次执行从当前集成分支创建票据 branch 和系统临时目录中的 worktree。
- 每票由全新 TDD 子代理实现、自行验收并尽快提交，不额外等待同步集成 tip。实现结束后自动启动后台集成，不占用实现并发槽位。
- TDD 与集成是两个不同会话，先后接管同一个 worktree、同一个 branch，不并发修改代码；集成不创建额外 worktree。
- 首次真正合入集成分支即放行下游，不等集成测试或修复完成。`active` 列出实现，`integrating` 独立列出后台集成。
- 实现执行失败可由新实现者复用原 branch/worktree 重试，已有进度保留；不会续跑已进入 retro 的 TDD 会话。

### 双向 merge 的短临界区

每次尝试按 FIFO 排队，锁覆盖：

1. 尝试开发分支 merge 到集成分支。
2. 如果冲突，先 abort 本次集成工作区的 merge，恢复干净现场。
3. 首次尝试无论成功还是冲突，都将锁内确定的集成提交 merge 回原开发分支；后续尝试仅在冲突时做这一步。逆向 merge 可把待解决冲突留在开发 worktree。
4. 完成上述 Git 操作后释放锁，才由集成子代理处理代码。

不能把冲突留在集成工作区再释放锁。开发 worktree 创建也与该锁协调，避免读取未完成 merge 的现场。锁内不等待 agent、测试或修复。

### 同一个集成子代理完成闭环

首次尝试无论成功还是冲突，都启动一个新的集成子代理；它与原 TDD 会话不同。它在原开发 worktree 解决已有冲突，运行项目全局测试，直接修复问题并提交。全局测试仍属于单票集成。复杂脚本、跨票据检查或实机 smoke 等额外验收，需要时写入范围明确的普通 ticket，而不由工作流自动创建最终门禁。

随后尝试将结果合回集成分支：成功（包括没有新增提交）就结束；冲突则按上述临界区 abort、逆向同步，锁外续跑同一个集成子代理处理并提交，再次排队。后续成功不再触发完整集成验证，不强制每轮重跑全局测试。冲突处理由 agent 自行阅读代码判断，不增加主代理审批或固定重试次数上限。

集成分支 HEAD 前进不是失败条件：干净 merge 直接接受，不强制追赶新 HEAD 或重新验收。后台修复与冲突处理不暂停其他票据的领取或合入。仅在集成处理结束且全部结果已合入后，票据才是“已集成”；首次合入只表示“已合并”。

### 可选的验收 ticket

需要最终或跨票据验收时，可通过 `/to-tickets` 生成一张 ticket，并在 ticket 内容中明确范围、步骤和证据要求。该 ticket 是可选项，与其他 ticket 一样经过普通依赖调度、独立 worktree、执行、集成测试和合并。工作流不会另行创建验证者或修复者，也不评判 ticket 报告。

阻塞 ticket 首次成功合并后即可释放依赖，即使其集成测试或修复仍在进行。因此验收 ticket 可能基于稍早的代码运行；之后的干净合并不会触发重新验收。这是为并行开发接受的取舍，不是隐藏的交付门禁。

## 输入框上方的双层进度

组件只在命令通过启动检查并启动工作流后显示；普通对话默认隐藏。Phase 1 显示准备票据。Phase 2 共用一条进度条：实心块 `█` 表示已成功集成，超出该部分的浅色块 `░` 表示 TDD 已结束但尚未集成，`·` 表示剩余部分，不在组件下方额外添加空白行。同时分别显示 `TDD ended 已结束数/总数` 和 `integrated 已集成数/总数`。

总数按本轮唯一 implementation ticket 计算，包括发布为普通实现票的可选验收票。执行数按每票最新一次 TDD 尝试计算，成功和失败结束均计入，不等待 retro；重试开始时撤回该票的执行计数，结束后恢复，总数不变。实心块要求票据到达 `integrated`，首次 merge 不计。后台状态变化自动刷新，不需要等待主代理下一次调用工具。

暂停时保留进度并标注状态；重新打开原会话后恢复显示，`resume` 从已有暂停检查点重算真实进度。不支持新会话接管或任意崩溃后的执行恢复。显示快照不能代替执行检查点。收尾后保留最终进度，直到再次启动工作流或切换会话；进度满格不跳过 retro 等原有收尾步骤。交互终端在输入框上方显示，RPC 的实际呈现由客户端决定。

## Retro 与报告提交

只有登记为某张票据实现执行的子代理触发 retro，包括首次实现、失败和重试；集成、冲突处理、辅助 agent 和 retro 自身不触发。

实现结束即在原 TDD 会话异步 retro，不等待 merge，每次执行一次。集成在另一个会话接管原 worktree；retro 只依据历史提建议，不修改代码或操作 Git。复盘结果独立于实现结果。

报告保存在工作区外、每次运行独立的系统临时目录（Windows `%TEMP%`，其他系统使用运行时 OS 临时目录），不逐次 merge 搬运。

所有 ticket 集成处理完成后，`finish`：

1. 等待所有 retro 成功或失败终态。
2. 发布报告与执行记录到集成工作区，并显式提交本次文件。
3. 安全移除已合并且干净的原票据 worktree，保留本地票据分支和集成分支。
4. 返回最终提交、报告位置、独立 retro 状态及清理警告。

最终文件：

```text
.scratch/<slug>/retro/<ticket-file>/<execution-id>.json
.scratch/<slug>/retro/<ticket-file>/<execution-id>.md
.scratch/<slug>/execution/<run-directory>/*.md
.scratch/<slug>/execution/<run-directory>/workflow.json
```

Markdown retro 只在交付成功时存在，失败记录仍然提交。实现、集成各轮、修复、验证报告及执行状态一并留存；发布后报告引用改为最终位置。不再生成主代理验收决定记录。

复制或提交失败时保留临时产物并报告错误，不重跑实现、不宣称全部成果已提交。worktree 有未提交修改、未合并或无法安全移除时保留并警告，不强制删除。

## 编排工具与边界

`hyper_auto_coding` 的动作只有 `plan`、`dispatch`、`collect`、`finish` 与只读 `status`。`dispatch` 启动实现后返回。实现结束或失败、首次合入放行依赖、集成结束或失败都会请求一次 `collect` 检查；两次调用之间发生的进展会保留到下次调用。`collect` 有待检查进展时立即返回最新状态，否则等待下次变化。连续通知合并为一次检查，检查开始后的新变化不会被结束时清除，而是留给下一次检查。并发 `collect` 共用一次检查，等待期间不持有编排互斥，不阻止 `dispatch`。主代理仍按原有逻辑处理返回状态和派发下游，不新增自动派发器。失败票据重新派发时，子代理任务提示最前面会原样包含上次拒绝原因，并要求先处理原因、保留已有工作，避免重复已完成且无需重跑的工作；上次实现报告仍作为接手上下文提供。集成和冲突续跑由宿主自动调度，不通过 native task 绕过工具派发。

状态含 `temporaryDir`、`active`、`integrating`、依赖放行后的 `ready`、每票首次 `mergedHead`、报告路径，以及暂停 `mode` 及其 `checkpoint` 路径。`finish` 返回交付摘要而不是状态快照。

同一扩展一次只承载一条工作流。按一次会话完成全部票据设计，不提供中断、取消或任意中断后的自动恢复机制；只有下方的显式 `pause`/`resume` 命令可以挂起并继续工作流。异常执行仍如实记录；正常退出即成功的假设不增加报告内容验收逻辑。

## 暂停与恢复

工作流的挂起与继续只能通过命令完成：`/hyper-auto-coding pause` 与 `/hyper-auto-coding resume`。没有自然语言入口，`hyper_auto_coding` 工具也没有对应 action，主代理不能自行暂停或恢复。

### `pause`：停止新实现、自然排水并写入检查点

`pause` 作用于当前会话拥有的、尚未结束的 Phase 2 工作流；没有这样的工作流时直接报错。它立即给出受理提示，排水在后台进行，命令本身不会一直等待：

1. 立即停止该会话中新的实现尝试，失败票据的重试也不再受理；此后的 `dispatch` 不会再启动实现。
2. 已在途的工作不会被中止，而是跑到已知终态：正在执行的 TDD 实现及其 retro、后台集成与冲突续跑都会正常结束；已在运行的实现仍可启动属于它自己的后台集成子代理。
3. 全部在途工作结束后，工作流把状态机相关信息写入检查点并进入 **paused**，完成通知给出检查点路径。此时不会收尾：不发布报告、不移除 worktree、不做最终提交，即使所有票据都已集成且没有待完成 retro 也一样。

`pause` 以 paused 快照返回。排水尚未结束时再次执行会并入同一轮排水，而不是开启第二轮；工作流已处于 paused 或已结束时则直接拒绝。

`hyper_auto_coding` 的 `action=status` 用 `mode` 报告暂停状态：仍受理新实现时为 `running`，准入已关闭但工作仍在排水时为 `pausing`，检查点写入后为 `paused`；每次 status 都给出 `checkpoint` 路径，即使仍在 `running`、文件尚未产生也一样。`mode` 为 `pausing` 或 `paused` 期间，`plan`、`dispatch`、`finish` 都会被拒绝，只有 `status` 与 `collect` 可用；主代理应持续 `collect` 等已有实现、retro 与集成收尾，进入 paused 后结束本轮回复，等待用户恢复。暂停不中止任何工作，因此 `collect` 仍能观察到实现、retro 与集成走到正常终态。

### `resume`：解锁并继续

`resume` 把已暂停的工作流恢复为空闲且可调度的状态，适用于两种情况：

- 同一会话中 pause 刚刚完成时，直接解锁仍在内存中的工作流。
- 重新打开原会话并在其中执行 `/hyper-auto-coding resume`：读取检查点并恢复已暂停的工作流，不重跑 Phase 1、不重新切票，也不再次提交票据。

`resume` 不接受 slug：检查点按当前会话寻址。它只用于继续已暂停的工作流——工作流仍在运行或仍在排水，或当前会话既没有在内存中的暂停也没有可读取的检查点时，都会被拒绝，而不是启动任何新流程。`resume` 以 running 状态的快照返回，并删除检查点文件，因此已经恢复过的暂停无法再次恢复。恢复会立即把恢复后的快照交给会话，且下一次 `collect` 立即返回而不等待；此后照常继续：尚未登记依赖图时先 plan，否则派发剩余 ready 票据，并在全部票集成处理完成后调用 `finish`。恢复后的状态保留已集成依赖证据、执行/retro/报告账本与失败记录，`finish` 仍能产出与未暂停时一致的交付摘要。

### 前提与限制

- 检查点位于仓库之外的系统临时目录下，是按会话确定的 `hyper-auto-coding-pause-*.json` 文件（`HyperWorkflow.checkpointPath(sessionId)`），不会进入集成分支或任何提交。
- 它只是临时辅助文件而非持久存储：系统清理临时目录，或在排水完成前进程终止，都会导致无从恢复；`resume` 除读取该文件外不校验、不修复任何内容。
- 暂停以既有产物仍然可用为前提：票据 worktree 与分支、集成分支及其工作区、本次运行的报告临时目录。恢复既不复制也不修复环境，也不做额外 Git 校验。
- pause/resume 只处理主动暂停，不做任意中断恢复：宿主中途死亡的工作流不会被恢复，缺失产物不会被重建，检查点也不会跨会话或跨 slug 使用。
- 暂停不会中断正在执行的票据、其 retro 或集成，也不会自行改变 `finish` 后续发布的内容。

## 来源

- [批准决策及取舍](./adr/0004-asynchronous-ticket-integration.md)
- [共享命令入口与 Phase 1](../extensions/entry.ts)
- [编排工具和主代理指导](../extensions/hyper-auto-coding/agent-tools.ts)
- [工作流调度与报告发布](../extensions/hyper-auto-coding/workflow.ts)
- [单票集成状态、合并尝试与冲突续跑](../extensions/integration-node/ticket-integration.ts)
- [本地 Git 和 worktree](../extensions/hyper-auto-coding/git.ts)
- [新会话与原集成会话续跑](../extensions/hyper-auto-coding/subagent-host.ts)
- [原 TDD 会话 retro](../extensions/implementation-node/retro-host.ts)、[执行记录及终态等待](../extensions/implementation-node/tdd-execution.ts)
