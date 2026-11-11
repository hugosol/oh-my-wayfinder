import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { HyperWorkflow } from "./workflow";

export function registerHyperTools(
	pi: ExtensionAPI,
	current: () => HyperWorkflow | undefined,
	settled: () => void,
): void {
	const z = pi.zod;
	const parameters = z.object({
		action: z.enum(["status", "plan", "dispatch", "retry_integration", "collect", "finish"]),
		plan: z
			.array(z.object({ ticket: z.string(), blockedBy: z.array(z.string()), repositories: z.array(z.string()).optional() }))
			.optional()
			.describe("Dependency graph of published tickets; use complete filenames including .md and repositories IDs from status. Multi-repository runs require each ticket's declared repositories."),
		tickets: z.array(z.string()).optional().describe("Ready ticket filenames to dispatch concurrently, or exactly one failed integration ticket for retry_integration"),
	});
	pi.registerTool({
		name: "hyper_auto_coding",
		label: "Hyper-Auto-Coding",
		description:
			"Manage one local parallel workflow across its registered repositories with a shared ticket slot limit. Each ticket owns one worktree per declared repository; one implementation agent and then one integration agent handle that whole set. A ticket releases dependents only after all its repositories first merge (unchanged repositories require no empty commit). The main agent plans, dispatches, collects, and finishes; ticket contents define implementation or optional acceptance work, and the workflow does not create a separate overall-verification gate. A subagent that exits normally is a success. Integration starts automatically in the background as soon as an implementation finishes, never occupies an implementation slot, and the same integration subagent continues across conflict rounds. retry_integration takes exactly one ticket whose implementation succeeded but integration failed; it starts a fresh integration agent on the original worktrees, preserving merge history, allowing repairs and automatic merges without rerunning TDD. Success criteria are unchanged. Dispatch and retry_integration return immediately. Implementation completion or failure, first merge, and integration completion or failure request a collect check. Collect consumes retained progress immediately, otherwise waits for the next change; overlapping calls share one snapshot without blocking dispatch. Notifications coalesce, and changes after a snapshot remain pending for the next collect. Only this tool dispatches workflow agents, merges and publishes reports. Pause/resume are user commands only. When mode is pausing, do not dispatch, retry, plan or finish; collect until paused. When mode is paused, end the reply and wait for the user resume command. Never use native task for these tickets. Each integrated ticket releases scheduling immediately and starts detached cleanup that waits only for its own retrospective, then sequentially resumes the original implementation (TDD + retro) session and original integration session to remove ticket-owned rebuildable artifacts, including ticket-owned external target directories, before safe worktree removal. Cleanup is best-effort contextual work, without an artifact registry or historical scan; shared resources, source work and delivery reports are retained. Each failure warns and skips that step, continues later cleanup steps and never changes integration success. Both pause and finish drain detached cleanup before releasing original sessions; pause writes its checkpoint only after that drain. finish also waits for all retrospectives, commits delivery reports, retries worktree cleanup, and safely deletes this run's merged ticket branches only when their worktrees are gone; the integration branch is retained. Cleanup outcomes are recorded separately, and cleanup or cleanup-report publication failures are warnings, not delivery failures.",
		parameters,
		approval: "write",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const workflow = current();
			if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id)) {
				return {
					content: [{ type: "text" as const, text: "当前会话没有可编排的 Hyper-Auto-Coding 工作流。" }],
					isError: true,
				};
			}
			try {
				const result = await workflow.execute(parameters.parse(params));
				if (workflow.finished) settled();
				return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], details: result };
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(workflow.status(), null, 2)}`,
						},
					],
					isError: true,
				};
			}
		},
	});
	pi.on("session_stop", (_event, ctx) => {
		const workflow = current();
		if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id) || workflow.finished || workflow.paused) return;
		if (workflow.pausing) {
			return {
				decision: "block" as const,
				reason: "Hyper-Auto-Coding 正在暂停。不要派发或重试实现，不调用 finish；使用 action=collect 等待已有实现、retro、集成和后台票据清理收尾。mode=paused 后结束本轮回复，等待用户通过命令恢复。",
			};
		}
		return {
			decision: "block" as const,
			reason:
				"Hyper-Auto-Coding 尚未收尾。根据 hyper_auto_coding 状态继续 plan/dispatch/retry_integration/collect，集成会在实现正常结束后自动进行；所有 ticket 集成完成后调用 action=finish 等待 retro 和后台票据清理结束后释放原会话，并提交执行报告。验收范围由 ticket 内容定义，不调用额外的总体验收或修复阶段。不要直接结束，也不要因 retro 失败重跑实现。",
		};
	});
}

export function startHyperPhase2(pi: ExtensionAPI, workflow: HyperWorkflow): void {
	pi.sendUserMessage(
		`Hyper-Auto-Coding Phase 1 已按现有流程结束，票据已提交到协调仓本地集成分支 ${workflow.git.branch}。\n本轮仓库：${JSON.stringify([...workflow.repositories].map(([id, git]) => ({ id, root: git.root, branch: git.branch })))}。\n使用 hyper_auto_coding 工具完成后续工作，不直接调用 task 实现这些票据，不自行操作集成工作区。\n\n1. 读取协调仓 ${workflow.git.root}/.scratch/${workflow.slug}/implementation/ 下的票据，分析真实依赖，通过 action=plan 登记完整文件名、blockedBy（无依赖用 []）及票据 **Repositories:** 声明的 repositories ID 数组。多仓运行每票必须明确仓库；开发票一个，跨仓联调／验收票多个。这只是 Phase 2 的执行依赖图，不重新切票、不新增 Phase 1 门禁，也不自动追加验收票；执行 Phase 1 已发布的验收工作。\n2. action=dispatch 派发 ready 票据，持续补满最多 ${workflow.maxParallelTickets} 个实现槽位；集成不占用实现槽位。每票一个实现 subagent，首次派发时从各参与仓最新集成 HEAD 创建一组独立 worktree；一票只占一个槽位，无需等待整批。\n3. action=collect 对已记录的进展立即检查并返回最新状态；无待检查进展时，等待实现结束或失败、首次合并释放下游、集成结束或失败。连续通知合并为一次检查，检查后的新变化保留到下一次 collect，不会因两次调用之间无人等待而丢失。并发 collect 共用一次检查，等待不占用编排互斥。返回后仍按原有逻辑处理结果，并依据 ready 与 active 补满实现槽位，不等后台集成结束。实现 subagent 正常结束即为成功，工作流随即在后台自动启动该票的集成。报告用于了解实现与集成证据，主代理不复核、不改判、不追加独立验收门禁。票据所有参与仓首次合入成功后即解锁下游依赖，无修改的仓不制造空提交；一个集成子代理接管整组原 worktree，分别运行各仓全局检查并完成票据要求的跨仓回归。发生冲突时由同一子代理在同一会话中继续处理并提交，后续干净合入不自动重跑完整验收。\n集成失败（failed）且实现已成功时，可用 action=retry_integration、tickets=[单个票据文件名] 重新启动完整集成；复用原 worktree，新建集成代理，允许修复和自动合并，不重跑 TDD、不要求手动 merge。通过 status/collect 收集结果，成功标准与普通集成一致。TDD 失败仍使用 dispatch。\n4. 全部票据集成后调用 action=finish。该动作等待后台 retro 终态及后台票据清理结束后才释放原会话，把临时目录中的执行记录/报告统一提交到协调仓集成分支，并按仓安全清理本轮 worktree 和已合入且无工作树的票据 branch，保留各仓集成分支。每票 integrated 后立即释放调度；后台清理只等该票 retro，然后顺序续跑原实现（TDD + retro）会话、原集成会话，清理该票专属可重建产物（含 worktree 外专属 target），再安全移除 worktree。只依赖原会话上下文，不建立产物登记表、不扫描历史；每步失败仅警告并跳过，继续后续步骤，不改变集成结果。pause 同样等待后台清理后才释放会话、写检查点。输出返回的提交、报告路径、retro 未交付和清理警告。\n\nRetro 由宿主在每次票据实现结束后的原会话异步执行，含失败/接手续跑；每次执行仅一次。不为集成辅助 agent 或 retro 自身复盘，不自行调用 retro，不等待 retro 才 merge。所有 Git 操作仅限本地。`,
		{ deliverAs: "followUp" },
	);
}
