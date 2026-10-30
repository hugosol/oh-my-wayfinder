import {
	buildSkillPromptMessage,
	createAgentSession,
	type AgentSession,
	discoverSkills,
	readSessionHeaderId,
	runSubagentFollowUpTurn,
	SessionManager,
	type ExtensionAPI,
	type ExtensionContext,
	type SingleResult,
} from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { AgentLifecycleManager } from "@oh-my-pi/pi-coding-agent/registry/agent-lifecycle";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TddWorkFlow, type ExecutionIdentity, type RetroPorts } from "./tdd-execution";

/**
 * Reopen the original transcript, not a fork, without touching its former cwd.
 * SDK follow-up has no cwd override: its warm reviver captures spawn-time cwd
 * (task/executor.ts), while cold revival first stats the header cwd
 * (task/persisted-revive.ts). Moving only a live manager would fix neither.
 * Park awaits disposal/JSONL flush; moveTo with the existing session directory
 * rewrites the header in place, preserving session id, file and history provenance.
 * Our narrow reviver also survives another park without resurrecting spawn tools
 * or extensions. Only yield is available: this turn analyzes replayed history,
 * never the current checkout, and cannot execute the implementation's write tools.
 */
export async function prepareRetroSession(
	identity: { agent_id: string; session_id: string | null; session_file: string | null; workspace: string },
	parent: AgentSession,
): Promise<AgentSession> {
	const registry = AgentRegistry.global();
	const lifecycle = AgentLifecycleManager.global();
	const ref = registry.get(identity.agent_id);
	if (!ref || !identity.session_file || !identity.session_id || ref.sessionFile !== identity.session_file) {
		throw new Error("原 TDD 会话记录缺失或已替换，拒绝在替代会话中复盘。");
	}
	if (ref.session?.isStreaming) throw new Error("原 TDD 会话仍在运行，不能切换为复盘。");
	await lifecycle.park(identity.agent_id);
	if (ref.session) throw new Error("原 TDD 会话未能安全停放，不能迁移复盘工作目录。");
	const workspace = path.resolve(identity.workspace);
	const manager = await SessionManager.open(identity.session_file, undefined, undefined, {
		suppressBreadcrumb: true,
		throwIfMissing: true,
	});
	try {
		if (manager.getSessionId() !== identity.session_id) throw new Error("原 TDD 会话身份已改变。");
		if (!manager.getEntries().some(entry => entry.type === "message")) {
			throw new Error("原 TDD 会话没有对话历史，拒绝生成替代复盘。");
		}
		await manager.moveTo(workspace, path.dirname(identity.session_file));
	} finally {
		await manager.close();
	}
	const recorded = await SessionManager.peekSessionInit(identity.session_file);
	if (!recorded?.init || recorded.init.isolated) throw new Error("原 TDD 会话无法安全恢复复盘。");
	const init = recorded.init;
	const sessionFile = identity.session_file;
	lifecycle.adopt(identity.agent_id, {
		idleTtlMs: 0,
		async revive(expectedAgentRef) {
			const reopened = await SessionManager.open(sessionFile, undefined, undefined, {
				suppressBreadcrumb: true,
				throwIfMissing: true,
			});
			try {
				if (reopened.getSessionId() !== identity.session_id) throw new Error("原 TDD 会话身份已改变。");
				const { session } = await createAgentSession({
					cwd: workspace,
					sessionManager: reopened,
					agentId: identity.agent_id,
					agentDisplayName: ref.displayName,
					agentName: init.agent ?? "tdd",
					parentAgentId: ref.parentId,
					parentTaskPrefix: identity.agent_id,
					taskDepth: 1,
					bindProcessState: false,
					expectedAgentRef,
					authStorage: parent.modelRegistry.authStorage,
					modelRegistry: parent.modelRegistry,
					settings: parent.settings.overlay(),
					modelPattern: init.resolvedModel,
					systemPrompt: () => [...init.systemPrompt],
					toolNames: ["yield"],
					restrictToolNames: true,
					requireYieldTool: true,
					spawns: "",
					hasUI: false,
					enableLsp: false,
					enableIrc: false,
					enableMCP: false,
					disableExtensionDiscovery: true,
					preloadedExtensionPaths: [],
					preloadedCustomToolPaths: [],
					skills: [],
					contextFiles: [],
					promptTemplates: [],
					slashCommands: [],
					workspaceTree: { rootPath: workspace, rendered: "", truncated: false, totalLines: 0, agentsMdFiles: [] },
				});
				await initializeExtensions(session, {
					reportSendError: (_action, error) => { throw error; },
					reportRuntimeError: error => { throw error.error; },
					filterActiveTools: names => names.filter(name => name === "yield"),
				});
				return session;
			} catch (error) {
				await reopened.close();
				throw error;
			}
		},
	}, ref);
	return lifecycle.ensureLive(identity.agent_id);
}

/**
 * Capture the original definition and source paths once, before any ticket
 * dispatch: the blocking `tdd` agent a retro continuation must reuse, and the
 * discovered `retro` / `writing-for-agents` skills the analysis turn loads.
 *
 * Shared by the spec-to-code workflow and the hyper-auto-coding host, which
 * builds its own `TddWorkFlow` over these same callbacks.
 */
export async function createRetroPorts(pi: ExtensionAPI, ctx: ExtensionContext): Promise<RetroPorts> {
	const workspace = path.resolve(ctx.cwd);
	const { agents } = await discoverAgents(workspace);
	const agent = agents.find((candidate) => candidate.name === "tdd");
	if (!agent || agent.blocking !== true) throw new Error('Spec-to-Code requires a blocking agent named "tdd".');
	const originalAgent = structuredClone(agent);
	const { skills } = await discoverSkills();
	const retro = skills.find((skill) => skill.name === "retro");
	const writing = skills.find((skill) => skill.name === "writing-for-agents");

	return {
		async identify(result): Promise<ExecutionIdentity> {
			const ref = AgentRegistry.global().get(result.id);
			const sessionFile = ref?.sessionFile ?? null;
			const live = ref?.session;
			const sessionId =
				live?.sessionManager.getSessionId() ?? (sessionFile ? await readSessionHeaderId(sessionFile) : undefined);
			const recorded = !live && sessionFile ? await SessionManager.peekSessionInit(sessionFile) : undefined;
			return {
				agent: result.agent,
				agent_id: result.id,
				session_id: sessionId ?? null,
				session_file: sessionFile,
				execution_cwd: live?.sessionManager.getCwd() ?? recorded?.cwd ?? null,
			};
		},
		async analyze(record, result, signal) {
			if (!retro) throw new Error("retro skill 未安装；TDD 结果已保留，本次复盘未交付。");
			if (!writing) throw new Error("writing-for-agents skill 未安装；无法执行 retro 的写作指导步骤。");
			const writingPrompt = (
				await buildSkillPromptMessage(writing, { args: "本轮只生成复盘建议正文，由宿主保存文档。" }, "autoload")
			).message;
			if (result.isolated) throw new Error("隔离执行的原会话不可续跑，本次复盘未交付。");
			const parent = AgentRegistry.global().get(ctx.agent.id)?.session;
			if (!parent) throw new Error("父会话不可用，无法安全恢复原 TDD 会话。");
			if (!record.agent_id || !record.session_id || !record.session_file) {
				throw new Error("原 TDD 会话身份不完整，无法在原会话复盘。");
			}
			const live = await prepareRetroSession({
				agent_id: record.agent_id, session_id: record.session_id,
				session_file: record.session_file, workspace: record.workspace,
			}, parent);
			if (live.sessionManager.getSessionId() !== record.session_id) {
				throw new Error("原 TDD 会话身份已改变，拒绝在替代会话中复盘。");
			}
			const built = await buildSkillPromptMessage(
				retro,
				{
					args: `请复盘本次 ticket 的 TDD 执行对话历史，而不是父 session 或其他执行。\n${JSON.stringify({
						feature: record.feature,
						ticket: record.ticket,
						run_id: record.run_id,
						agent_id: record.agent_id,
						session_id: record.session_id,
						session_file: record.session_file,
					})}\nwriting-for-agents 的完整指导已由宿主加载在本消息中，等价完成该技能加载步骤；本宿主使用 read(skill://...)，没有 Skill 工具。\n按严重度返回 Markdown 复盘正文，基于原对话及工具结果区分事实、推断和未验证项；缺失的历史不得补造。只提出建议，不执行建议，不修改代码、检查配置、技能或代理指令，也不自行写文件。宿主负责附加身份信息并保存文档。TDD 实现轮已结束，本轮仅复盘，不继续实现或重跑验收。本轮已设置独立的单项完成契约，替代实现轮的 yield 参数；请调用 yield({key:1,data:"完整 Markdown 正文"})，失败时使用 yield({key:1,error:"原因"})。不要沿用 TDD 的 status/files/evidence 等对象，也不要用 JSON 对象包裹正文。`,
				},
				"autoload",
			);
			let completion: SingleResult;
			try {
				completion = await runSubagentFollowUpTurn({
					id: result.id,
					agent: originalAgent,
					message: `${writingPrompt}\n\n${built.message}`,
					modelRole: result.modelRole,
					// A dedicated one-item completion contract bypasses the original YieldTool schema.
					workPoolYieldItems: [{ id: "retro_markdown", index: 1 }],
					outputSchema: {
						type: "object",
						properties: { retro_markdown: { type: "string", minLength: 1 } },
						required: ["retro_markdown"],
						additionalProperties: false,
					},
					outputSchemaMode: "strict",
					outputSchemaSource: "caller",
					signal,
					parentToolCallId: `spec-to-code:retro:${record.run_id}`,
					eventBus: pi.events,
					// Bound final draining if a model/tool never produces a completion.
					maxRuntimeMs: 5 * 60 * 1000,
					// No artifactsDir: never replace the TDD implementation output artifact.
				});
			} finally {
				const current = AgentRegistry.global().get(result.id)?.session;
				if (current) await current.setWorkPoolYieldItems([]);
			}
			if (completion.exitCode !== 0 || completion.aborted || completion.error) return completion;
			const data = completion.structuredOutput?.data;
			if (!data || typeof data !== "object" || !("retro_markdown" in data) || typeof data.retro_markdown !== "string") {
				throw new Error("Retro 未按独立完成契约交付 Markdown 正文。");
			}
			return { ...completion, output: data.retro_markdown };
		},
		warn(message) {
			pi.logger.warn(message);
			ctx.ui.notify(message, "warning");
		},
	};
}

/** One process-local spec-to-code workflow over the published implementation tickets. */
export async function createRetroWorkflow(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	feature: string,
): Promise<TddWorkFlow> {
	const workspace = path.resolve(ctx.cwd);
	const files = await fs.readdir(path.join(workspace, ".scratch", feature, "implementation"), { withFileTypes: true });
	const tickets = new Set(files.filter((file) => file.isFile() && file.name.endsWith(".md")).map((file) => file.name));
	const ports = await createRetroPorts(pi, ctx);

	return new TddWorkFlow(
		feature,
		workspace,
		ctx.sessionManager.getSessionId(),
		ctx.agent.id,
		ctx.sessionManager.getSessionFile() ?? null,
		tickets,
		ports,
	);
}

/** Both native flat and one-item batch task shapes are supported. */
export function tddTicket(input: Record<string, unknown>): string | undefined {
	const items = Array.isArray(input.tasks) ? (input.tasks as Record<string, unknown>[]) : [input];
	if (!items.some((item) => item.agent === "tdd")) return undefined;
	if (items.length !== 1) throw new Error("每次 task 只能执行一张 TDD ticket，不能与其他子代理合并派发。");
	const name = items[0].name;
	if (typeof name !== "string" || !name.trim())
		throw new Error("TDD task.name 必须填写票据完整文件名（含 .md），retry 使用相同名称。");
	return name;
}

export function tddResult(details: unknown): SingleResult | undefined {
	if (!details || typeof details !== "object" || !("results" in details) || !Array.isArray(details.results))
		return undefined;
	return details.results.find((result: SingleResult) => result.agent === "tdd");
}
