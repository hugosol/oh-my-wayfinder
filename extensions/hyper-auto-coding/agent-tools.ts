import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { HyperWorkflow } from "./workflow";

export function registerHyperTools(
	pi: ExtensionAPI,
	current: () => HyperWorkflow | undefined,
	settled: () => void,
): void {
	const z = pi.zod;
	const parameters = z.object({
		action: z.enum(["status", "plan", "dispatch", "collect", "finish"]),
		plan: z
			.array(z.object({ ticket: z.string(), blockedBy: z.array(z.string()) }))
			.optional()
			.describe("Dependency graph of published tickets; use complete filenames including .md"),
		tickets: z.array(z.string()).optional().describe("Ready ticket filenames to dispatch concurrently"),
	});
	pi.registerTool({
		name: "hyper_auto_coding",
		label: "Hyper-Auto-Coding",
		description:
			"Manage the local parallel ticket workflow. The main agent plans, dispatches, collects, and finishes; ticket contents define implementation or optional acceptance work, and the workflow does not create a separate overall-verification gate. A subagent that exits normally is a success. Integration starts automatically in the background as soon as an implementation finishes, never occupies an implementation slot, and the same integration subagent continues across conflict rounds. Dispatch returns immediately. Implementation completion or failure, first merge, and integration completion or failure request a collect check. Collect consumes retained progress immediately, otherwise waits for the next change; overlapping calls share one snapshot without blocking dispatch. Notifications coalesce, and changes after a snapshot remain pending for the next collect. Only this tool dispatches workflow agents, merges and publishes reports. Pause/resume are user commands only. When mode is pausing, do not dispatch, retry, plan or finish; collect until paused. When mode is paused, end the reply and wait for the user resume command. Never use native task for these tickets. finish waits for retrospectives, commits all reports and removes clean merged worktrees while retaining branches.",
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
				reason: "Hyper-Auto-Coding 正在暂停。不要派发或重试实现，不调用 finish；使用 action=collect 等待已有实现、retro 和集成收尾。mode=paused 后结束本轮回复，等待用户通过命令恢复。",
			};
		}
		return {
			decision: "block" as const,
			reason:
				"Hyper-Auto-Coding 尚未收尾。根据 hyper_auto_coding 状态继续 plan/dispatch/collect，集成会在实现正常结束后自动进行；所有 ticket 集成完成后调用 action=finish 等待 retro 并提交执行报告。验收范围由 ticket 内容定义，不调用额外的总体验收或修复阶段。不要直接结束，也不要因 retro 失败重跑实现。",
		};
	});
}

export function startHyperPhase2(pi: ExtensionAPI, workflow: HyperWorkflow): void {
	pi.sendUserMessage(
		`Hyper-Auto-Coding Phase 1 已按现有流程结束，票据已提交到本地集成分支 ${workflow.git.branch}。\n使用 hyper_auto_coding 工具完成后续工作，不直接调用 task 实现这些票据，不自行操作集成工作区。\n\n1. 读取 .scratch/${workflow.slug}/implementation/ 下的票据，分析真实依赖，通过 action=plan 登记完整文件名及 blockedBy（无依赖用 []）。这只是 Phase 2 的执行依赖图，不重新切票、不新增 Phase 1 门禁。需要验收时，将验收范围与步骤写入一张普通 ticket；该 ticket 可选，不由工作流自动创建。\n2. action=dispatch 派发 ready 票据，持续补满最多 ${workflow.maxParallelTickets} 个实现槽位；集成不占用实现槽位。每票独立 subagent/worktree，无需等待整批。\n3. action=collect 对已记录的进展立即检查并返回最新状态；无待检查进展时，等待实现结束或失败、首次合并释放下游、集成结束或失败。连续通知合并为一次检查，检查后的新变化保留到下一次 collect，不会因两次调用之间无人等待而丢失。并发 collect 共用一次检查，等待不占用编排互斥。返回后仍按原有逻辑处理结果，并依据 ready 与 active 补满实现槽位，不等后台集成结束。实现 subagent 正常结束即为成功，工作流随即在后台自动启动该票的集成。报告用于了解实现与集成证据，主代理不复核、不改判、不追加独立验收门禁。首次合并成功即解锁下游依赖；集成子代理运行项目全局测试，发生冲突时由同一子代理在同一会话中继续处理并提交。\n4. 全部票据集成后调用 action=finish。该动作等待票据实现执行的后台 retro 终态，把临时目录中的执行记录/报告统一提交到集成分支，并安全清理本次 worktree、保留本地 branch。输出返回的提交、报告路径、retro 未交付和清理警告。\n\nRetro 由宿主在每次票据实现结束后的原会话异步执行，含失败/接手续跑；每次执行仅一次。不为集成辅助 agent 或 retro 自身复盘，不自行调用 retro，不等待 retro 才 merge。所有 Git 操作仅限本地。`,
		{ deliverAs: "followUp" },
	);
}
