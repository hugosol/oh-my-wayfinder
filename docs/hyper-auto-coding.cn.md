# `/hyper-auto-coding`：以集成分支为中心并行交付

[English](./hyper-auto-coding.md) · [串行工作流](./spec-to-code.cn.md) · [仓库 README](../README.cn.md)

`/hyper-auto-coding <slug>` 是 OMP 专用命令。它与 `/spec-to-code` 共用原有 Phase 1，但 Phase 2 在每票独立的 branch/worktree 中并行实现，再串行集成到用户准备好的本地集成分支。旧命令仍然串行执行，不编排 Git worktree。

## 安装与准备

按[扩展安装指南](./spec-to-code.cn.md#安装)安装同一个 `extensions/spec-to-code.ts` 入口，并同时复制 `spec-to-code/`、`hyper-auto-coding/` 和 `agents/`。这个入口注册两个命令；不要重复加载入口。

所需 skills：本仓库的 `to-tickets`、`tdd`、`code-review`，以及 blocking 的 `tdd` agent。`retro` 和 `writing-for-agents` 沿用已安装的上游版本；缺少它们时只报告对应复盘未交付。票据执行使用安装后的 TDD agent 模型；辅助工作使用宿主 task agent 的模型设置。

开始前，用户必须：

1. 创建并检出一条独立的本地集成分支，不能是 `main`/`master` 或 detached HEAD。
2. 将 `.scratch/<slug>/spec.md`、`contract.md` 及相关输入文档提交到该分支。
3. 保持工作区及暂存区干净，并提供可用的本地 Git 提交身份。

所有 Git 操作仅在本地发生：不 push，不创建 PR，不合入 main。不自动创建集成分支、stash 或提交无关修改。slug 是单个安全路径片段。

## 配置

与 Jev 开关共用 `extensions/spec-to-code/config.json`，扩展加载时读取一次：

```json
{
  "jev": { "enabled": false },
  "hyperAutoCoding": { "maxParallelTickets": 4 }
}
```

`maxParallelTickets` 是正整数，缺省为 4，只限制同时运行的票据实现，不限制 retro 或最终评审内部的两个子代理。旧 `/spec-to-code` 始终串行。修改配置后重新加载扩展。

## 执行顺序

### Phase 1：复用切票

原样沿用 `/spec-to-code` 的 `/to-tickets` 激活、自动回答、Jev、15 次自动干预预算和票据落盘触发机制。没有新增整套票据完整性门禁；已有非空票据即可按原规则结束 Phase 1。随后只提交 `implementation/` 中的票据，才开始 Phase 2。

### Phase 2：并行实现，串行集成

主代理读取已发布票据，并登记执行依赖图。这是 Phase 2 的调度输入，不重新切票。只有阻塞票据已经合并、且集成验证被主代理确认通过，下游票才能开始。

- 首次执行从集成分支当前最新提交创建独立本地票据分支和系统临时目录中的 worktree。
- 每票一个全新的 TDD subagent，持续补满实现槽位，不等待整批结束。
- 实现者完成前同步集成分支最新 tip、处理冲突、验证并提交本票实现。
- 主代理读取实现报告及证据，明确验收。正常退出不等于验收通过。
- 未完成时派发新的实现者，复用原票据 branch/worktree 和已有进度。不续跑已经进入 retro 的原实现会话，不新增重试次数策略。
- 集成由独立 subagent 处理同步与针对性验证，Git 合并和集成分支上的代码写入串行。不会创建额外的集成 worktree。
- 合并后的验证失败时，暂停后续 merge 和新 worktree 创建，其他已运行实现可继续。独立修复者在集成工作区修复、验证并提交，再由主代理确认；不默认回滚。

主会话只接收状态、报告路径和提交引用。复杂实现、集成、验证在独立会话执行，不继承主调度对话。

### 最终评审与修复

全部票据集成后，全新 reviewer 加载本仓库 `code-review`，以 Phase 1 票据提交后的固定 SHA 到当前 HEAD 为范围，显式提供 spec 和 contract。Standards / Spec 两轴保持独立并行及分开汇总。

主代理读取报告。需要修复时，全新 fixer 通过报告路径接手，在集成工作区自动 apply、验证并 commit，然后重新独立评审。常规修复不逐项询问用户；不修改需求或弱化验收，不应用的建议说明理由。不新增固定修复轮数限制。最后独立执行整体验证，主代理确认结果。

## Retro 与报告提交

只复盘被工作流登记为某张实现票执行的 subagent：首次实现、失败尝试、重试和接手续跑。集成、冲突处理、验证、reviewer、最终 fixer、辅助 agent 和 retro 自身不触发复盘；不是看到 `agent="tdd"` 就一律复盘。

每次实现执行结束即在原会话异步 retro，不等 merge；每次执行一次，不因重复完成事件再复盘。不同执行可有不同报告，不做跨报告语义去重。复盘只提建议，不执行建议、修改代码或操作 Git。

宿主把复盘和其他执行报告写到工作区外的系统临时目录：Windows `%TEMP%`；其他系统使用运行时的操作系统临时目录（通常由 `TMPDIR` 等环境变量决定，缺省 `/tmp`）。每次运行使用独立目录，不逐次 merge 搬运文档。

所有代码工作和整体验证完成后，`hyper_auto_coding` 的 `finish` 操作：

1. 等待所有 retro 成功或失败终态。
2. 发布报告与执行记录到集成工作区，并显式提交本次文件。
3. 安全移除已集成且干净的票据 worktree，保留本地票据分支和集成分支。
4. 返回最终提交、报告位置、独立 retro 状态及清理警告。

最终文件：

```text
.scratch/<slug>/retro/<ticket-file>/<execution-id>.json
.scratch/<slug>/retro/<ticket-file>/<execution-id>.md
.scratch/<slug>/execution/<run-directory>/*.md
.scratch/<slug>/execution/<run-directory>/workflow.json
```

Markdown retro 只在成功交付时存在；失败记录仍然提交。实现报告、评审、修复、验证及主代理决定一并留存。发布后的报告引用改为最终位置，临时目录清理后仍可追溯。

复制或提交失败时保留临时产物并报告错误，不重跑实现、不宣称全部成果已提交。worktree 有未提交修改、未合并或无法安全移除时保留并警告，不强制删除。

## 编排工具与边界

主代理通过 `hyper_auto_coding` 的 `plan`、`dispatch`、`collect`、`accept`、`integrate`、`confirm_integration`、`repair_integration`、`review`、`assess_review`、`fix`、`verify`、`accept_verification`、`finish` 操作推进流程；`status` 只读状态。状态快照带有 `temporaryDir`：`finish` 发布前，报告与执行记录暂存于该系统临时目录。该字段替代原来的 `temporary`，不提供兼容别名。`finish` 返回含最终提交与已发布报告路径的交付摘要，而非状态快照；最终发布位置见上文“最终文件”。不得另用 native task 为这些票据绕过工作流派发。每项验收决定必须有原因或证据；宿主约束并发、依赖、会话归属和提交版本，不独立证明自然语言验收结论正确。

同一扩展一次只承载一条工作流。此功能按一次会话完成全部票据设计，本次不提供中断、取消或自动恢复机制。

## 源码

- [共享命令入口与 Phase 1](../extensions/spec-to-code.ts)
- [编排工具和主代理指导](../extensions/hyper-auto-coding/extension.ts)
- [工作流状态及验收门禁](../extensions/hyper-auto-coding/workflow.ts)
- [本地 Git 和 worktree](../extensions/hyper-auto-coding/git.ts)
- [新会话宿主执行](../extensions/hyper-auto-coding/host.ts)
- [共享原会话 retro 调用](../extensions/spec-to-code/retro-host.ts)、[执行记录及终态等待](../extensions/spec-to-code/retro-workflow.ts)
