/**
 * Spec-to-Code Extension: Autonomous two-phase workflow.
 *
 * Phase 1: /to-tickets  → generate ticket files from spec
 * Phase 2: /tdd          → develop based on ticket files
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
 * When `specToCode.jev.enabled` is on and a native Jev judge is credentialed, every
 * `agent_end` asks Jev which canned reply to send. Round 1 only offers
 * "请你仔细思考后回答这些问题" / "请生成文件", so the first automatic reply is never
 * a bare "请继续"; from round 2 on "请继续" is offered too. Once ticket files exist,
 * phase 2 starts when Jev picks "请继续", or after `specToCode.jev.forcePhase2Round`
 * rounds. Any failure in that chain falls back to the pre-Jev canned sequence.
 *
 * This module is the composition root: run state lives in `workflow-session.ts`,
 * the turn decision in `turn-policy.ts`, the judge port in `jev-judge.ts`, config
 * resolution in `config.ts`, and host access in `host-integration.ts`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	settings,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@oh-my-pi/pi-coding-agent";
import { readSpecToCodeConfig, type SpecToCodeConfig } from "./spec-to-code/config";
import { activateSkill, hasSkill, hasTddAgent } from "./spec-to-code/host-integration";
import { createJudgeDecider } from "./spec-to-code/jev-judge";
import {
	lastAssistantStopReason,
	lastAssistantText,
	planTurn,
	type TurnPorts,
} from "./spec-to-code/turn-policy";
import { createWorkflowSession, MAX_AUTO_ACTIONS } from "./spec-to-code/workflow-session";

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

async function startPhase2(pi: ExtensionAPI, slug: string): Promise<void> {
	pi.sendUserMessage(
		`请读取 .scratch/${slug}/implementation/ 目录下的所有 ticket 文件。\n分析每个 ticket 的内容和依赖关系，按依赖顺序排列。\n\n对每个 ticket，使用 task 工具执行：\n  agent: "tdd"\n  task: 包含 ticket 的完整内容和名称\n\n⚠️ 约束：\n- 每个 ticket 必须由一次独立的 task(agent="tdd") 调用执行\n- 绝不能将多个 ticket 合并到同一次 task 调用中\n- 必须等待每个 task 完成后，再开始下一个\n- 全部完成后，输出每个 ticket 的完成状态摘要`,
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

	// `specToCode: { jev: { enabled, forcePhase2Round } }` in config.yml / .omp/config.yml.
	// Unknown keys elsewhere in the layer are stripped by the schema, and project
	// settings win over global settings.
	const configSchema = z.object({
		specToCode: z
			.object({
				jev: z
					.object({
						enabled: z.boolean().optional(),
						forcePhase2Round: z.number().optional(),
					})
					.optional(),
			})
			.optional(),
	});
	const readConfig = (): SpecToCodeConfig => {
		try {
			const layers = [settings.getProjectSettings(), settings.getGlobalSettings()].map(layer => {
				const parsed = configSchema.safeParse(layer);
				return parsed.success ? parsed.data : undefined;
			});
			return readSpecToCodeConfig(layers);
		} catch {
			// Settings not initialized; fall through to the defaults.
			return readSpecToCodeConfig([]);
		}
	};

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

		const config = readConfig();
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
				forcePhase2Round: config.forcePhase2Round,
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
			await startPhase2(pi, plan.slug);
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
			if (session.isActive) {
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
