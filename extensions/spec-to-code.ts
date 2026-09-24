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
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	discoverSkills,
	settings,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge, resolveJudge } from "@oh-my-pi/pi-coding-agent/judgment";

// ============================================================================
// State
// ============================================================================

let currentPhase: "idle" | "phase1" = "idle";
let currentSlug: string | undefined;
let firstReplySent = false;
/** Session that owns the running workflow; end events from other sessions must not drive it. */
let autoSessionId: string | undefined;
/** Automatic interventions spent by the running workflow: ask answers plus auto replies. */
let autoActionCount = 0;
/** `agent_end` rounds processed by the running workflow; drives the Jev option set and force round. */
let turnCount = 0;

// ============================================================================
// Constants
// ============================================================================

const SKILL_PROMPT_TYPE = "skill-prompt";
/** Jev option 1; also the first fallback follow-up when the judging chain is unavailable. */
const AUTO_REPLY = "请你仔细思考后回答这些问题";
/** Canned `ask` answer (one per question, so singular). */
const ASK_REPLY = "请你仔细思考后回答这个问题";
/** Jev option 2; also the fallback follow-up once one auto reply has been sent. */
const PUBLISH_REPLY = "请生成文件";
/** Jev option 3. */
const CONTINUE_REPLY = "请继续";
/** Round 1 omits "请继续" so the first automatic reply can never be a bare continuation. */
const JEV_OPTIONS_ROUND1 = [AUTO_REPLY, PUBLISH_REPLY] as const;
/** Round 2+ options; also the tie-break priority order (1 > 2 > 3). */
const JEV_OPTIONS = [AUTO_REPLY, PUBLISH_REPLY, CONTINUE_REPLY] as const;
/** Fixed question body handed to the judge; only `criteria` changes between rounds. */
const JEV_INSTRUCTIONS =
	"下面 state 是一个 coding agent 在把已批准的 spec/contract 拆成实现 ticket 时的最后一段回复。它的流程是：先自己思考、再向用户确认 ticket 粒度与依赖边、最后把 ticket 写入 .scratch/<slug>/implementation/。请判断：为了让流程自动推进，下一步应该自动回复 agent 哪一句？";
const JEV_CRITERIA: Record<string, string> = {
	[AUTO_REPLY]:
		"agent 在向用户提问、请求确认、或把决定权交给用户（例如问粒度是否合适、阻塞边是否正确）。此时应让它自己思考后继续，而不是等人类回答。",
	[PUBLISH_REPLY]:
		"agent 已给出完整 ticket 拆分方案（标题、依赖、交付内容），但尚未写入文件，或明确表示准备发布。此时应直接让它把 ticket 写入 .scratch/<slug>/implementation/。",
	[CONTINUE_REPLY]:
		"以上都不是：agent 只在正常推进、汇报进度或自然停下，既没向用户提问，也没准备发布。此时直接让它继续执行。",
};
/** Hard ceiling on automatic interventions per workflow; reached => stop and hand back to the user. */
const MAX_AUTO_ACTIONS = 15;
/** Default for `specToCode.jev.forcePhase2Round`: force phase 2 after this many agent_end rounds once tickets exist. */
const DEFAULT_FORCE_PHASE2_ROUND = 5;
/** Judge call timeout; on expiry the workflow falls back to the pre-Jev canned sequence. */
const JEV_TIMEOUT_MS = 5000;
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

interface SpecToCodeConfig {
	jevEnabled: boolean;
	forcePhase2Round: number;
}

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

function resetWorkflow(): void {
	currentPhase = "idle";
	currentSlug = undefined;
	firstReplySent = false;
	autoSessionId = undefined;
	autoActionCount = 0;
	turnCount = 0;
}

/** Spend one automatic intervention. False once the workflow budget is exhausted. */
function spendAutoAction(): boolean {
	if (autoActionCount >= MAX_AUTO_ACTIONS) return false;
	autoActionCount += 1;
	return true;
}

/** Stop reason of the newest assistant message in an agent_end payload. */
function lastAssistantStopReason(messages: readonly unknown[]): string | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (typeof message !== "object" || message === null) continue;
		if (!("role" in message) || message.role !== "assistant") continue;
		if (!("stopReason" in message)) return undefined;
		return typeof message.stopReason === "string" ? message.stopReason : undefined;
	}
	return undefined;
}

/** Text of the newest assistant message carrying non-empty text, or undefined when none does. */
function lastAssistantText(messages: readonly unknown[]): string | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (typeof message !== "object" || message === null) continue;
		if (!("role" in message) || message.role !== "assistant") continue;
		if (!("content" in message) || !Array.isArray(message.content)) continue;
		const texts: string[] = [];
		for (const part of message.content) {
			if (typeof part !== "object" || part === null) continue;
			if (!("type" in part) || part.type !== "text") continue;
			if (!("text" in part) || typeof part.text !== "string") continue;
			texts.push(part.text);
		}
		const text = texts.join("\n").trim();
		if (text) return text;
	}
	return undefined;
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
// Jev judging chain (opt-in via specToCode.jev.enabled)
// ============================================================================

/** Strict argmax over `options`, preserving their order on ties (1 > 2 > 3). */
export function pickJevOption(probabilities: Record<string, number>, options: readonly string[]): string {
	let chosen = options[0] ?? "";
	for (const option of options) {
		if ((probabilities[option] ?? 0) > (probabilities[chosen] ?? 0)) chosen = option;
	}
	return chosen;
}

/** Phase 2 starts when tickets exist and Jev says continue, or once the force round is exceeded. */
export function shouldEnterPhase2(
	tickets: boolean,
	decision: string,
	turnCount: number,
	forcePhase2Round: number,
): boolean {
	if (!tickets) return false;
	if (decision === CONTINUE_REPLY) return true;
	return turnCount > forcePhase2Round;
}

/**
 * Ask OMP's judge role chain (TypeSafe Jev first) which canned reply to send.
 * Returns undefined when the chain is off, has no native judge, or fails — the
 * caller then runs the pre-Jev canned sequence.
 */
export async function decideAutoReply(
	pi: ExtensionAPI,
	lastReply: string,
	round: number,
	ctx: ExtensionContext,
	config: SpecToCodeConfig,
): Promise<string | undefined> {
	if (!config.jevEnabled) return undefined;
	try {
		if (!hasNativeJudge(settings, ctx.modelRegistry)) return undefined;
		const judge = resolveJudge({
			settings,
			registry: ctx.modelRegistry,
			sessionModel: ctx.model,
			sessionId: ctx.sessionManager.getSessionId(),
		});
		const options = round <= 1 ? JEV_OPTIONS_ROUND1 : JEV_OPTIONS;
		const criteria: Record<string, string> = {};
		for (const option of options) criteria[option] = JEV_CRITERIA[option] ?? "";
		const { answers } = await judge.judge(
			{
				state: lastReply,
				questions: {
					next_reply: {
						type: "choice" as const,
						instructions: JEV_INSTRUCTIONS,
						criteria,
					},
				},
			},
			{ signal: AbortSignal.timeout(JEV_TIMEOUT_MS) },
		);
		const answer = answers.next_reply;
		if (answer.type !== "choice") return undefined;
		const chosen = pickJevOption(answer.probabilities, options);
		pi.logger.debug("spec-to-code: jev auto-reply decision", {
			round,
			choice: chosen,
			confidence: answer.confidence,
			probabilities: answer.probabilities,
		});
		return chosen;
	} catch (error) {
		pi.logger.debug("spec-to-code: jev decision failed; using fallback", {
			error: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

async function hasTddAgent(): Promise<boolean> {
	// OMP auto-discovers agents from extension roots, project .omp/agents/, and ~/.omp/agent/agents/.
	// Check the extension's own agents/ directory (resolved relative to this module) plus standard locations.
	const extDir = path.dirname(fileURLToPath(import.meta.url));
	const locations = [
		path.join(extDir, "agents", "tdd.md"),
		".omp/agents/tdd.md",
		path.join(os.homedir(), ".omp/agent/agents/tdd.md"),
	];
	for (const loc of locations) {
		try {
			await fs.access(loc);
			return true;
		} catch {
			// keep looking
		}
	}
	return false;
}

/**
 * Build a skill-prompt message body matching OMP's internal format.
 * Skill body (without YAML frontmatter) + metadata footer.
 */
async function buildSkillMessage(skillFilePath: string, userArgs: string): Promise<string> {
	const content = await Bun.file(skillFilePath).text();
	const body = content.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
	const metaLines = [`Skill: ${skillFilePath}`];
	if (userArgs) metaLines.push(`User: ${userArgs}`);
	return `${body}\n\n---\n\n${metaLines.join("\n")}`;
}

async function activateSkill(
	pi: ExtensionAPI,
	skillName: string,
	userArgs: string,
): Promise<boolean> {
	const { skills } = await discoverSkills();
	const skill = skills.find(s => s.name === skillName);
	if (!skill) return false;

	const message = await buildSkillMessage(skill.filePath, userArgs);

	pi.sendMessage(
		{
			customType: SKILL_PROMPT_TYPE,
			content: message,
			display: false,
			details: { name: skill.name, path: skill.filePath, args: userArgs || undefined },
			attribution: "user",
		},
		{ triggerTurn: true },
	);

	return true;
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
		let layers: unknown[] = [];
		try {
			layers = [settings.getProjectSettings(), settings.getGlobalSettings()];
		} catch {
			// Settings not initialized; fall through to the defaults.
		}
		let jevEnabled = false;
		let forcePhase2Round = DEFAULT_FORCE_PHASE2_ROUND;
		let enabledFound = false;
		let forceFound = false;
		for (const layer of layers) {
			const parsed = configSchema.safeParse(layer);
			if (!parsed.success) continue;
			const jev = parsed.data.specToCode?.jev;
			if (!jev) continue;
			if (!enabledFound && typeof jev.enabled === "boolean") {
				jevEnabled = jev.enabled;
				enabledFound = true;
			}
			if (!forceFound && typeof jev.forcePhase2Round === "number" && jev.forcePhase2Round > 0) {
				forcePhase2Round = Math.floor(jev.forcePhase2Round);
				forceFound = true;
			}
		}
		return { jevEnabled, forcePhase2Round };
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

			if (
				currentPhase !== "phase1" ||
				autoSessionId === undefined ||
				ctx.sessionManager.getSessionId() !== autoSessionId
			) {
				return await delegate();
			}

			if (!spendAutoAction()) {
				const slug = currentSlug;
				resetWorkflow();
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
		if (currentPhase !== "phase1" || currentSlug === undefined) return;
		const slug = currentSlug;
		// End events fire for child sessions too; only the owning session may drive the workflow.
		if (autoSessionId === undefined || ctx.sessionManager.getSessionId() !== autoSessionId) return;
		// OMP already scheduled a continuation (auto-retry, empty-stop recovery, ...); don't stack another.
		if (event.willContinue) return;

		const stopReason = lastAssistantStopReason(event.messages);
		if (stopReason === "aborted" || stopReason === "error") {
			resetWorkflow();
			ctx.ui.notify(`Spec-to-Code 自动模式已停止：agent 以 ${stopReason} 结束（${slug}）。`, "warning");
			return;
		}

		turnCount += 1;
		const config = readConfig();
		const lastReply = lastAssistantText(event.messages);
		const decision = lastReply
			? await decideAutoReply(pi, lastReply, turnCount, ctx, config)
			: undefined;

		if (decision === undefined) {
			// Pre-Jev path: tickets end the phase immediately, otherwise nudge the agent.
			if (await hasTicketFiles(slug)) {
				resetWorkflow();
				await startPhase2(pi, slug);
				return;
			}

			if (!spendAutoAction()) {
				resetWorkflow();
				ctx.ui.notify(
					`Spec-to-Code 自动模式已停止：达到 ${MAX_AUTO_ACTIONS} 次自动干预上限，仍未检测到 .scratch/${slug}/implementation 下的票据。`,
					"warning",
				);
				return;
			}

			pi.sendUserMessage(firstReplySent ? PUBLISH_REPLY : AUTO_REPLY, { deliverAs: "followUp" });
			firstReplySent = true;
			return;
		}

		const tickets = await hasTicketFiles(slug);
		if (shouldEnterPhase2(tickets, decision, turnCount, config.forcePhase2Round)) {
			resetWorkflow();
			await startPhase2(pi, slug);
			return;
		}

		if (!spendAutoAction()) {
			resetWorkflow();
			if (tickets) {
				// Budget spent but tickets are ready: don't throw the work away.
				await startPhase2(pi, slug);
				return;
			}
			ctx.ui.notify(
				`Spec-to-Code 自动模式已停止：达到 ${MAX_AUTO_ACTIONS} 次自动干预上限，仍未检测到 .scratch/${slug}/implementation 下的票据。`,
				"warning",
			);
			return;
		}

		pi.sendUserMessage(decision, { deliverAs: "followUp" });
	});

	pi.registerCommand("spec-to-code", {
		description: "Autonomous Spec → Tickets → Code workflow",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			if (currentPhase !== "idle") {
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

			const { skills } = await discoverSkills();
			const hasToTickets = skills.some(s => s.name === "to-tickets");
			const hasTddSkill = skills.some(s => s.name === "tdd");
			const tddAgentExists = hasTddSkill && (await hasTddAgent());

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

			currentPhase = "phase1";
			currentSlug = slug;
			firstReplySent = false;
			autoSessionId = ctx.sessionManager.getSessionId();
			autoActionCount = 0;
			turnCount = 0;
			const success = await activateSkill(
				pi,
				"to-tickets",
				`请分析以下spec，生成独立的 ticket 文件。\nspec 路径：${spec}\ncontract 路径：${contract}`,
			);

			if (!success) {
				resetWorkflow();
				ctx.ui.notify("无法激活 to-tickets 技能", "error");
			}
		},
	});
}
