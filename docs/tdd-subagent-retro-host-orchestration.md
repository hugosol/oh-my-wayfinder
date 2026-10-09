# TDD 执行后的宿主驱动后台 Retro

## 1. 目标与实现边界

`/spec-to-code` 在每次 TDD 执行结束后，加载**未修改的上游 retro skill**，在原 TDD 子代理会话中运行独立复盘轮。宿主接收正文、附加真实身份信息，并写入 `.scratch/<feature>/retro/`。

复盘是附加信息，不参与实现票验收。TDD 队列保持串行，retro 与后续 TDD 并行；正常失败的执行和父 session 重新派发的独立 retry，各自触发一次复盘。父 session 在所有 TDD 及 retry 结束后等待全部 retro 终态，再最终汇总。复盘失败不阻塞 TDD，也不要求复盘全部成功才能结束工作流。

本次实现位于：

- [扩展入口](../extensions/spec-to-code.ts)：阶段切换、原生 task 事件关联、最终收尾工具与停止守卫。
- [retro-workflow.ts](../extensions/spec-to-code/retro-workflow.ts)：执行实例、内存调度、原实现结果隔离及文件交付。
- [retro-host.ts](../extensions/spec-to-code/retro-host.ts)：OMP 代理发现、真实会话身份采集、技能构建与受监控续跑。
- [回归测试](../extensions/spec-to-code/retro-workflow.test.ts)：并行、失败、retry、重复结果、取消与文件交付边界。

TDD agent 定义与上游 retro 文件不需要新增收尾指令。当前接口依据 OMP 18.8.6；宿主导出及续跑契约应在升级后重新验证。

## 2. 执行模型

```text
时间 →
Ticket A / attempt 1：TDD 失败 ── Retro A1 ─────────结束
Ticket A / retry：              TDD 成功 ── Retro A2 ──结束
Ticket B：                                TDD ── Retro B1 ──结束
                                                           ↓
                                            spec_to_code_finish → 最终汇总
```

**复盘单位是执行实例，不是 ticket。** 新的 task 调用产生新的 `run_id` 和来源会话；OMP 在同一次 task 内部进行的 provider 自动重试不是新的执行实例。

父 session 继续负责读取票、依赖排序、判断实现报告以及既有的失败重试策略。扩展不新增自动 TDD 重试策略，也不自动重试 retro。retry 必须重新派发独立 task，而不是向正用于复盘的旧会话发送新的实现指令。

## 3. 触发与事件关联

Phase 2 启动前，宿主记录父会话身份、工作区、实际票据文件名集合以及原 TDD `AgentDefinition`。TDD 定义必须声明 `blocking: true`，保证原生 task 返回的是已经结束的实现结果。

每次 task 需要明确填写：

```text
agent: tdd
name: implementation 中的完整票据文件名（含 .md）
task: 该票完整内容
```

支持原生 flat 形状及单项 `tasks[]` 形状。失败后的 retry 复用票据名称，但使用新的工具调用与执行身份。

扩展在所属父会话的 `tool_call` 中登记执行实例，拒绝多票合并、未知票名和重叠 TDD 派发。`tool_result` 中收取原生 `SingleResult`，先保存独立副本，再启动后台 retro。关联同时核对父 session ID 和 agent ID，避免将共享父会话的 advisor 或其他子代理当成工作流派票。

这里不依赖一个不存在的 `subagent_end` API。OMP 的 `task:subagent:lifecycle` 是生命周期通知，但它不携带完整实现结果，也不能单独作为本功能的结果保存屏障。retro 续跑产生的生命周期通知不会触发新的复盘；重复的同一工具结果也不会重复派发。

## 4. 不修改 retro 的技能适配

上游 retro 分析指定 session 的主要来源，并按严重度展示环境改进建议。它没有固定输出路径或元数据格式，但调用方可以负责保存其结果，因而**不必改造 retro 为文件生成器**。

宿主使用 `buildSkillPromptMessage(skill, { args }, "autoload")` 读取原始技能正文，并追加本次调用要求：

- 明确 feature、ticket、执行实例、原 agent 与 session；只复盘该次 TDD 历史。
- 基于实际对话和工具结果，区分事实、推断与未验证项；无法恢复的细节必须注明。
- 只返回 Markdown 建议正文，不执行改进建议、不继续实现、不自行写文件。
- 文档路径、身份元数据和文件写入由宿主负责。

retro 要求加载 `writing-for-agents`，OMP 没有同名 Skill 工具。宿主同时展开原写作指导，并明确它已加载，完成该宿主的调用适配。缺少任一技能时，只将本次 retro 标记为未交付，不阻止 TDD。

不要只给子代理发送字面量 `/retro`：受监控 task 提示使用 `runCommands: false`，技能展开必须先在宿主完成。也不要把 retro 放入 TDD 的首轮 `autoloadSkills`；实现与复盘是两个不同的轮次。

技能仍由模型执行。宿主控制触发、来源选择、正文加载和交付检查，但不能保证每条分析都正确；非空文件也不是建议质量的证明。

## 5. 原会话续跑与结果隔离

宿主从注册表取得原子代理，并通过 `AgentLifecycleManager.ensureLive(id)` 复用或恢复原会话，核对本地 session ID 后调用 `runSubagentFollowUpTurn`。未知、已释放、被强杀或无法恢复的会话不能默默替换成新代理。

- 正常结束的 keep-alive 会话可在 idle 或允许恢复的 parked 状态续跑。
- `keepAlive: false`、强杀或不可恢复的会话只记录未交付原因。
- 隔离 task 的工作区可能已删除，当前适配明确将其 retro 标记为未交付；本次不实现 worktree 复盘。
- 每轮受监控 retro 的运行上限是 5 分钟，取消或超时以失败终态收尾。

原会话的 YieldTool 可能仍带有 TDD 调用方传入的输出 schema，仅给续跑传 `outputSchema` 并不能消除这个工具契约。本实现使用 OMP 的单项 `workPoolYieldItems` 为本轮安装独立的完成入口，要求提交 Markdown 字符串，并通过本轮的严格 schema 收取 `retro_markdown`。宿主提取正文后再落盘，不把 TDD 的 status/files/evidence JSON 包装当成 Markdown；本轮结束后清除单项契约。它只用于隔离本轮交付格式，不引入批量 workpool 调度。

TDD 首轮 `SingleResult` 在 retro 启动前单独保存。retro 不复用 TDD 的 `artifactsDir`，避免覆盖 `<agent-id>.md` 实现产物。注册表的最新轮次状态仍可能反映 retro，不能用它代替独立的实现记录。

“原会话”不等于所有原始 token 一直留在模型窗口里。上下文压缩仍适用；retro 应读取必要的历史来源并说明证据缺口。本次不添加工作区快照或跨票文件变化归因机制。

## 6. 状态保存与追溯

内存保存执行实例、当前 TDD 调用、后台 retro Promise 和取消信号。文件是追溯记录，**不是跨重启的任务队列**。

```text
.scratch/<feature>/retro/<ticket-file>/
  <run-id>.json    # 首轮实现结果、独立复盘状态、身份、时间和失败原因
  <run-id>.md      # 仅在复盘正文成功交付时生成
```

同一 ticket 的失败执行、retry 以及之后再次运行工作流，都获得独立文件，避免覆盖。宿主写入工作流工作区下的绝对路径，采用临时文件加重命名提交文件。

主要追溯字段：

| 字段 | 来源与含义 |
| --- | --- |
| `feature`、`ticket`、`run_id` | 工作流、票据与本次执行身份 |
| `agent` | 原生结果中的代理定义名称 |
| `agent_id` | 原生结果中的注册表句柄，不等于 session ID |
| `session_id` | `SessionManager.getSessionId()` 的本地会话身份；非活会话可从 session 文件头读取 |
| `session_file` | 原 TDD 会话历史路径；不可用时明确为 null |
| `parent_session_id`、`parent_session_file` | 派发工作流所属父会话 |
| `workspace` | 工作流工作区 |
| `execution_cwd` | 原子代理实际会话 cwd，不能用父工作区猜测 |
| `tool_call_id`、时间字段 | 工具调用关联与执行/复盘时间 |

不得使用 `AgentSession.sessionId` 的 provider 身份替代本地 session ID。Markdown 中的身份信息由宿主添加，不由模型猜测。

TDD 与 retro 状态分别记录：

```text
TDD：running → completed / failed
Retro：pending → running → completed / failed
```

TDD 状态表示工具执行的结果，不证明所有票据验收条件已满足；原始报告保留在 JSON 中。retro 成功表示正文已经交付，不证明实现正确。失败会记录原因；原会话不可恢复、正文为空/截断和写入失败均不得伪称文档已交付。JSON 写入失败也会通过告警和最终汇总明确报告。

OMP 的对话 JSONL 是独立的会话存储，不等于这些工作流记录。记录 session ID 和路径不能保证原历史永久保留；使用临时/无持久会话或清理原历史后，追溯能力仍受实际文件是否存在限制。

## 7. 最终收尾与取消

最终等待由注册工具 `spec_to_code_finish` 执行，而不是在 `session_stop` 中长时间 await。OMP 的普通扩展事件处理器有短超时；停止守卫只即时要求父代理继续处理尚未结束的 TDD，或在队列结束后调用收尾工具。

收尾工具等待已启动的全部 retro 得到终态，然后返回各次执行的实现状态、复盘状态、记录/文档路径及失败原因，并列出没有派发的票。父代理据此结合此前的 TDD 报告生成最终摘要。失败的 retro 已经是终态，不会使正常收尾要求它重试成功。

收尾后不再接受该工作流的新执行。切换或关闭所属 session 时取消后台 retro；不自动恢复。进程崩溃可能留下 running/pending 记录，它只表示最后已记录的状态，不能解释为重启后仍在运行。

本次不承诺跨重启恢复或 exactly-once。进程内按工具调用身份避免重复触发；文件提交和状态记录之间仍可能发生崩溃，且重启不会自动重跑或修复它们。

## 8. 验证

运行行为回归测试：

```bash
bun test extensions/spec-to-code/retro-workflow.test.ts
```

测试覆盖：前一次 retro 未结束时继续派发 retry 和下一票、最终等待全部复盘、TDD 串行边界、失败状态隔离、重复结果去重、原实现结果保留、来源元数据落盘、截断/缺失身份/写入失败以及取消收尾。

真实运行验证使用安装版 OMP 18.8.6 的 RPC 模式，在临时工作区执行两张依赖票。观察到两次 TDD 和两次原会话 retro 均完成、生成独立 JSON 与纯 Markdown 文档；下一票 TDD 启动早于前一票 retro 结束。来源 session ID 与实际会话头一致，原 TDD 执行器产物未被覆盖。最终通过 `spec_to_code_finish`（该宿主以 `write xd://spec_to_code_finish` 暴露扩展工具）等待约 146 秒，超过普通事件处理器的 30 秒预算；无扩展错误，最终汇总后进程正常退出。失败和 retry 的状态隔离由上述行为回归测试验证。

类型检查使用安装版 OMP 18.8.6 的声明和 Bun/Node 类型。普通仓库 checkout 没有安装这些开发依赖时，不能把缺少宿主声明的 LSP 报错解释成接口已经验证。
