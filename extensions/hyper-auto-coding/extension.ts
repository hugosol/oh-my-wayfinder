import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { HyperWorkflow } from "./workflow";

export function registerHyperTools(
	pi: ExtensionAPI,
	current: () => HyperWorkflow | undefined,
	settled: () => void,
): void {
	const z = pi.zod;
	const parameters = z.object({
		action: z.enum([
			"status",
			"plan",
			"dispatch",
			"collect",
			"accept",
			"integrate",
			"confirm_integration",
			"repair_integration",
			"review",
			"assess_review",
			"fix",
			"verify",
			"accept_verification",
			"finish",
		]),
		plan: z
			.array(z.object({ ticket: z.string(), blockedBy: z.array(z.string()) }))
			.optional()
			.describe("Dependency graph of published tickets; use complete filenames including .md"),
		tickets: z.array(z.string()).optional().describe("Ready ticket filenames to dispatch concurrently"),
		ticket: z.string().optional().describe("Ticket being accepted or integrated"),
		accepted: z.boolean().optional().describe("Main agent acceptance decision after reading the referenced report"),
		reason: z.string().optional().describe("Actual acceptance evidence or unresolved work; required for all decisions"),
	});
	pi.registerTool({
		name: "hyper_auto_coding",
		label: "Hyper-Auto-Coding",
		description:
			"Manage the local parallel ticket workflow. The main agent reads reports and makes explicit acceptance decisions. Dispatch returns immediately; collect waits for an implementation report. Only this tool dispatches workflow agents, merges and publishes reports. Never use native task for these tickets. finish waits for retrospectives, commits all reports and removes clean merged worktrees while retaining branches.",
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
		if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id) || workflow.finished) return;
		return {
			decision: "block" as const,
			reason:
				"Hyper-Auto-Coding 尚未收尾。根据 hyper_auto_coding 状态继续派发、读取报告、验收、集成、评审修复及验证。完成后调用 action=finish 等待 retro 并提交文档。不要直接结束，也不要因 retro 失败重跑实现。",
		};
	});
}

export function startHyperPhase2(pi: ExtensionAPI, workflow: HyperWorkflow): void {
	pi.sendUserMessage(
		`Hyper-Auto-Coding Phase 1 已按现有流程结束，票据已提交到本地集成分支 ${workflow.git.branch}。\n使用 hyper_auto_coding 工具完成后续工作，不直接调用 task 实现这些票据，不自行操作集成工作区。\n\n1. 读取 .scratch/${workflow.slug}/implementation/ 下的票据，分析真实依赖，通过 action=plan 登记完整文件名及 blockedBy（无依赖用 []）。这只是 Phase 2 的执行依赖图，不重新切票、不新增 Phase 1 门禁。\n2. action=dispatch 派发 ready 票据，持续补满最多 ${workflow.maxParallelTickets} 个实现槽位。每票独立 subagent/worktree，无需等待整批。action=collect 等待下一份报告；实现结束不等于验收通过。\n3. read 读取返回的报告路径，逐项根据验收条件和实际证据作决定。action=accept 提供 ticket、accepted、reason。未完成时 accepted=false，继续 dispatch 同一票，由新 subagent 在原 branch/worktree 接手，不设置新重试次数策略、不续跑旧 agent。\n4. 验收通过用 action=integrate 合并并启动独立集成验证。读取集成报告后 action=confirm_integration 提供 ticket、accepted、reason。只有合并且验证确认通过才解锁下游。集成失败调用 repair_integration，由独立 subagent 在集成工作区修复、验证并 commit，随后再次确认；失败期间不启动新票据、不继续合并，其他 worktree 已运行的实现可继续。\n5. 全部票据集成后 action=review，独立 reviewer 加载本仓库双轴 code-review，不继承调度历史。read 报告并用 assess_review 给出 accepted、reason；有需修复的发现则 accepted=false 后 action=fix，独立 fixer 根据报告自动 apply、验证并 commit，然后重新 review。不要擅自修改 spec、contract 或弱化验收。对不成立或不适用的建议说明理由。不新增固定修复轮数限制。\n6. 评审及复核通过后 action=verify，独立 subagent 做整体验证；读取报告后 accept_verification 给出 accepted、reason。未通过则继续针对问题评审修复并重新验证，不宣布交付成功。\n7. action=finish 等待票据实现执行的后台 retro 终态，把临时目录中的执行记录/报告统一提交到集成分支，并安全清理本次 worktree、保留本地 branch。输出返回的提交、文档路径、retro 未交付和清理警告。\n\nRetro 由宿主在每次票据实现结束后的原会话异步执行，含失败/接手续跑；每次执行仅一次。不为集成、验证、reviewer、最终 fixer 或辅助 agent 复盘，不自行调用 retro，不等待 retro 才 merge。所有 Git 操作仅限本地。`,
		{ deliverAs: "followUp" },
	);
}
