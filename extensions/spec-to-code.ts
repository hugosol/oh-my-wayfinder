/**
 * Spec-to-Code Extension: Autonomous two-phase workflow.
 *
 * Phase 1: /to-tickets  → generate ticket files from spec
 * Phase 2: serial TDD attempts with independent background retro and final draining
 *
 * Usage: /spec-to-code <slug>
 *   Spec at:  .scratch/<slug>/spec.md
 *   Tickets: .scratch/<slug>/implementation/*.md
 *
 * While phase 1 owns the session, the `ask` tool is auto-answered with a canned
 * "think it through yourself" reply instead of blocking on the dialog, and every
 * automatic intervention (an ask answer or an auto reply) burns one of a small,
 * fixed budget so a stuck phase can never loop forever. Outside the workflow the
 * native `ask` tool is delegated to unchanged.
 *
 * When `jev.enabled` is on in `config.json` (beside the config module) and a native
 * Jev judge is credentialed, `agent_end` asks Jev which canned reply to send. Round 1
 * only offers "请你仔细思考后回答这些问题" / "请生成文件", so the first automatic reply is
 * never a bare "请继续"; from round 2 on "请继续" is offered too. From round 2 on, a
 * ticket already on disk ends phase 1 immediately without another judge call, so a
 * published set is never re-nagged; the judge is only consulted while no ticket has
 * landed. Any failure in that chain falls back to the pre-Jev canned sequence.
 *
 * This module is the composition root: planning state lives in `workflow-session.ts`,
 * execution/retro state and persistence in `retro-workflow.ts`, host continuation in `retro-host.ts`,
 * the turn decision in `turn-policy.ts`, the judge port in `jev-judge.ts`, config
 * resolution in `config.ts`, and host access in `host-integration.ts`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { loadSpecToCodeConfig } from "./spec-to-code/config";
import { activateSkill, hasSkill, hasTddAgent } from "./spec-to-code/host-integration";
import { createJudgeDecider } from "./spec-to-code/jev-judge";
import {
	lastAssistantStopReason,
	lastAssistantText,
	planTurn,
	type TurnPorts,
} from "./spec-to-code/turn-policy";
import { createWorkflowSession, MAX_AUTO_ACTIONS } from "./spec-to-code/workflow-session";
import { createRetroWorkflow, tddTicket, tddResult } from "./spec-to-code/retro-host";
import type { RetroWorkflow } from "./spec-to-code/retro-workflow";

// ============================================================================
// Constants
// ============================================================================

/** Canned `ask` answer (one per question, so singular). */
const ASK_REPLY = "请你仔细思考后回答这个问题";
/** Model-facing description for the re-registered ask tool; mirrors the native prompt. */
const ASK_DESCRIPTION = `Ask user for clarification/input during task execution.

<conditions>
- Multiple approaches with significantly different tradeoffs user should weigh.
</conditions>

<instruction>
- recommended: <index> marks the default option (0-indexed); " (Recommended)" is added automatically.
- Use questions for related questions, not one at a time.
- Set multi: true on a question to allow multiple selections.
- Short option labels; explanatory tradeoffs in description, not labels.
- A custom input (Other) can be a clarifying question, not an answer (e.g. "what do you mean?", "explain X", "why?"). If so, answer it in response text first, then call ask again for the still-open question(s).
</instruction>

<caution>
- Provide 2-5 concise, distinct options.
</caution>

<critical>
- Default to action. Resolve ambiguity via repo conventions, existing patterns, reasonable defaults. Exhaust existing sources (code, configs, docs, history) before asking. Ask only when options have materially different tradeoffs the user must decide.
- If multiple choices acceptable: pick most conservative/standard option; proceed; state choice.
- Do NOT include "Other"; UI automatically adds "Other (type your own)" to every question.
</critical>`;

// ============================================================================
// Helpers
// ============================================================================

async function hasTicketFiles(slug: string): Promise<boolean> {
	const dir = `.scratch/${slug}/implementation`;
	try {
		const entries = await fs.readdir(dir);
		for (const entry of entries) {
			if (!entry.endsWith(".md")) continue;
			const stat = await fs.stat(path.join(dir, entry));
			if (stat.isFile() && stat.size > 0) return true;
		}
		return false;
	} catch {
		return false;
	}
}

interface AskAnswerQuestion {
	id?: string;
	question?: string;
	options?: readonly { label?: string }[];
	multi?: boolean;
}

/**
 * Build a native-shaped ask result whose answer is the canned custom input, so the
 * model sees a completed ask call instead of an error it might retry.
 */
function buildAskAnswer(questions: readonly AskAnswerQuestion[]): {
	content: { type: "text"; text: string }[];
	details: Record<string, unknown>;
} {
	const [first] = questions;

	if (questions.length <= 1) {
		return {
			content: [{ type: "text", text: `User provided custom input: ${ASK_REPLY}` }],
			details: {
				question: first?.question,
				options: (first?.options ?? [])
					.map(option => option.label)
					.filter((label): label is string => typeof label === "string"),
				multi: first?.multi === true,
				selectedOptions: [],
				customInput: ASK_REPLY,
			},
		};
	}

	const results = questions.map(question => ({
		id: question.id ?? "",
		question: question.question ?? "",
		options: (question.options ?? [])
			.map(option => option.label)
			.filter((label): label is string => typeof label === "string"),
		multi: question.multi === true,
		selectedOptions: [] as string[],
		customInput: ASK_REPLY,
	}));
	return {
		content: [
			{
				type: "text",
				text: `User answers:\n${results.map(result => `${result.id}: "${ASK_REPLY}"`).join("\n")}`,
			},
		],
		details: { results },
	};
}

// ============================================================================
// Phase 2: orchestrate TDD subagents
// ============================================================================

function startPhase2(pi: ExtensionAPI, slug: string): void {
	pi.sendUserMessage(
		`请读取 .scratch/${slug}/implementation/ 目录下的所有 ticket 文件。\n分析每个 ticket 的内容和依赖关系，按依赖顺序排列。\n\n对每个 ticket，使用 task 工具执行：\n  agent: "tdd"\n  name: ticket 的完整文件名（含 .md；retry 使用相同名称）\n  task: 包含 ticket 的完整内容和名称\n\n⚠️ 约束：\n- 每个 ticket 必须由一次独立的 task(agent="tdd") 调用执行\n- 绝不能将多个 ticket 合并到同一次 task 调用中\n- 必须等待每个 task 完成后，再开始下一个\n- 实现失败时按现有策略重新派发独立的 TDD task，保留相同票据 name；不要向失败的原 agent 发送实现续跑消息\n- 每次 TDD 结束（包含失败与 retry）后，宿主会在原会话启动后台 retro；无需等待 retro，也不要自行调用 retro 或等待其 agent\n- retro 失败不会影响 TDD；按依赖顺序继续执行下一票\n- 全部 TDD 及其 retry 结束后，必须调用 spec_to_code_finish 工具等待后台 retro 的成功或失败终态；只在队列结束时调用，不能在票与票之间调用\n- 收尾工具返回后，结合各次实现报告输出最终汇总：区分实现验收与复盘交付，列出失败、retry、未执行票据及文档路径；不因 retro 失败重跑实现`,
		{ deliverAs: "followUp" },
	);
}

// ============================================================================
// Extension entry point
// ============================================================================

export default function specToCode(pi: ExtensionAPI): void {
	pi.setLabel("Spec-to-Code");

	const z = pi.zod;
	const session = createWorkflowSession();
	let retroWorkflow: RetroWorkflow | undefined;
	let phase2Starting = false;

	pi.on("tool_call", async (event, ctx) => {
		const workflow = retroWorkflow;
		if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id) || event.toolName !== "task") return;
		try {
			const ticket = tddTicket(event.input);
			if (ticket !== undefined) await workflow.begin(event.toolCallId, ticket);
		} catch (error) {
			return { block: true, reason: error instanceof Error ? error.message : String(error) };
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		const workflow = retroWorkflow;
		if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id) || event.toolName !== "task") return;
		await workflow.settle(event.toolCallId, tddResult(event.details), event.isError
			? event.content.filter(item => item.type === "text").map(item => item.text).join("\n")
			: undefined);
	});

	pi.registerTool({
		name: "spec_to_code_finish",
		label: "Finish Spec-to-Code",
		description: "After all Spec-to-Code TDD attempts and retries have ended, wait for their background retrospectives and return independent implementation/retro outcomes. Retro failures are terminal, not reasons to retry or block completion. Call before the final workflow summary; never between tickets.",
		parameters: z.object({}),
		approval: "read",
		async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
			const workflow = retroWorkflow;
			if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id)) {
				return { content: [{ type: "text" as const, text: "当前 session 没有待收尾的 Spec-to-Code Phase 2。" }], isError: true };
			}
			const cancel = () => { void workflow.cancel(); };
			signal?.addEventListener("abort", cancel, { once: true });
			try {
				if (signal?.aborted) await workflow.cancel();
				const summary = await workflow.finish();
				if (retroWorkflow === workflow) retroWorkflow = undefined;
				return { content: [{ type: "text" as const, text: summary }], details: { executions: workflow.records } };
			} catch (error) {
				return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
			} finally {
				signal?.removeEventListener("abort", cancel);
			}
		},
	});

	// Event handlers have a short host timeout; long draining belongs in a tool execution.
	pi.on("session_stop", (_event, ctx) => {
		if (!retroWorkflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id)) return;
		return { decision: "block" as const, reason: "Spec-to-Code 尚未收尾。若仍有可执行票据或 TDD retry，请继续串行派发，勿等待后台 retro。所有 TDD 结束后，调用 spec_to_code_finish 等待复盘终态，再输出最终汇总。retro 失败也可正常收尾，不要重试 retro。" };
	});

	const cancelWorkflow = async (_event: unknown, ctx: ExtensionContext) => {
		const workflow = retroWorkflow;
		if (!workflow?.owns(ctx.sessionManager.getSessionId(), ctx.agent.id)) return;
		await workflow.cancel();
		if (retroWorkflow === workflow) retroWorkflow = undefined;
	};
	pi.on("session_before_switch", cancelWorkflow);
	pi.on("session_shutdown", cancelWorkflow);

	// Config lives in `config.json` beside the config module (extensions/spec-to-code/).
	// Read once at extension load: editing it requires an extension reload / omp restart.
	const { config, error: configError } = loadSpecToCodeConfig();
	let configErrorShown = false;
	pi.on("session_start", (_event, ctx) => {
		if (configError === undefined || configErrorShown) return;
		configErrorShown = true;
		ctx.ui.notify(configError, "warning");
	});

	// `ask` blocks inside tool execution, so `agent_end` cannot fire while its dialog
	// waits. Re-registering the tool is the only in-process way to answer it: while this
	// workflow owns the session the canned answer returns immediately, and everywhere
	// else the native tool runs unchanged through ctx.invokeTool.
	const askParameters = z.object({
		questions: z
			.array(
				z.object({
					id: z.string().describe("question id"),
					question: z.string().describe("question text"),
					header: z.string().optional().describe("optional short display chip for rich ask dialogs"),
					options: z
						.array(
							z.object({
								label: z.string().describe("display label"),
								description: z.string().optional().describe("optional explanatory text displayed below the label"),
								preview: z.string().optional().describe("optional rich preview content for interactive ask dialogs"),
							}),
						)
						.describe("available options"),
					multi: z.boolean().optional().describe("allow multiple selections"),
					recommended: z.number().optional().describe("recommended option index"),
				}),
			)
			.min(1)
			.describe("questions to ask"),
	});

	pi.registerTool({
		name: "ask",
		label: "Ask",
		description: ASK_DESCRIPTION,
		parameters: askParameters,
		approval: "read",
		loadMode: "discoverable",
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const delegate = async () => {
				if (ctx.invokeTool) {
					return await ctx.invokeTool({ ...params }, { signal, onUpdate });
				}
				return {
					content: [{ type: "text" as const, text: "ask is unavailable: this session has no interactive prompt." }],
					isError: true,
				};
			};

			if (!session.isActive || !session.owns(ctx.sessionManager.getSessionId())) {
				return await delegate();
			}

			if (!session.spendIntervention()) {
				const slug = session.slug;
				session.reset();
				ctx.ui.notify(
					`Spec-to-Code 自动模式已停止：达到 ${MAX_AUTO_ACTIONS} 次自动干预上限（${slug ?? "未知"}）。`,
					"warning",
				);
				return await delegate();
			}

			const parsed = askParameters.safeParse(params);
			return buildAskAnswer(parsed.success ? parsed.data.questions : []);
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!session.isActive || session.slug === undefined) return;
		const slug = session.slug;
		// End events fire for child sessions too; only the owning session may drive the workflow.
		if (!session.owns(ctx.sessionManager.getSessionId())) return;
		// OMP already scheduled a continuation (auto-retry, empty-stop recovery, ...); don't stack another.
		if (event.willContinue) return;

		const round = session.advanceRound();
		const ports: TurnPorts = {
			decide: createJudgeDecider(pi, ctx, config),
			hasTickets: hasTicketFiles,
		};
		const plan = await planTurn(
			slug,
			{
				stopReason: lastAssistantStopReason(event.messages),
				lastReply: lastAssistantText(event.messages),
				round,
				firstReplySent: session.firstReplySent,
				canSpend: session.canSpend,
			},
			ports,
		);

		if (plan.type === "reply") {
			if (session.spendIntervention()) {
				if (plan.fallback) session.markReplied();
				pi.sendUserMessage(plan.text, { deliverAs: "followUp" });
				return;
			}
			// The budget raced away between planning and applying; fall through to the budget stop.
		} else if (plan.type === "phase2") {
			session.reset();
			phase2Starting = true;
			try {
				retroWorkflow = await createRetroWorkflow(pi, ctx, plan.slug);
				startPhase2(pi, plan.slug);
			} catch (error) {
				ctx.ui.notify(`Spec-to-Code 无法启动 Phase 2：${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
				phase2Starting = false;
			}
			return;
		}

		session.reset();
		if (plan.type === "stop" && (plan.reason === "aborted" || plan.reason === "error")) {
			ctx.ui.notify(`Spec-to-Code 自动模式已停止：agent 以 ${plan.reason} 结束（${slug}）。`, "warning");
			return;
		}
		ctx.ui.notify(
			`Spec-to-Code 自动模式已停止：达到 ${MAX_AUTO_ACTIONS} 次自动干预上限，仍未检测到 .scratch/${slug}/implementation 下的票据。`,
			"warning",
		);
	});

	pi.registerCommand("spec-to-code", {
		description: "Autonomous Spec → Tickets → Code workflow",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			if (session.isActive || retroWorkflow || phase2Starting) {
				ctx.ui.notify("已有 Spec-to-Code 工作流在运行，等待其结束或停止后再启动。", "error");
				return;
			}

			const slug = args.trim();

			if (!slug) {
				ctx.ui.notify("用法: /spec-to-code <slug>", "error");
				return;
			}

			const spec = `.scratch/${slug}/spec.md`;
			const contract = `.scratch/${slug}/contract.md`;
			try {
				await Bun.file(spec).text();
			} catch {
				ctx.ui.notify(`spec 文件不存在: ${spec}`, "error");
				return;
			}

			const hasToTickets = await hasSkill("to-tickets");
			const hasTddSkill = await hasSkill("tdd");
			const tddAgentExists = hasTddSkill && (await hasTddAgent(ctx.cwd));

			if (!hasToTickets || !tddAgentExists) {
				const missing = [
					!hasToTickets && "to-tickets (skill)",
					!hasTddSkill && "tdd (skill)",
					hasTddSkill && !tddAgentExists && "tdd (agent)",
				]
					.filter(Boolean)
					.join(", ");
				ctx.ui.notify(`缺少: ${missing}。请检查安装。`, "error");
				return;
			}

			session.begin(slug, ctx.sessionManager.getSessionId());
			const success = await activateSkill(
				pi,
				"to-tickets",
				`请分析以下spec，生成独立的 ticket 文件。\nspec 路径：${spec}\ncontract 路径：${contract}`,
			);

			if (!success) {
				session.reset();
				ctx.ui.notify("无法激活 to-tickets 技能", "error");
			}
		},
	});
}
