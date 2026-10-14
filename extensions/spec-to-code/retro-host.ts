import {
	buildSkillPromptMessage,
	discoverSkills,
	readSessionHeaderId,
	runSubagentFollowUpTurn,
	SessionManager,
	type ExtensionAPI,
	type ExtensionContext,
	type SingleResult,
} from "@oh-my-pi/pi-coding-agent";
import { AgentLifecycleManager } from "@oh-my-pi/pi-coding-agent/registry/agent-lifecycle";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { RetroWorkflow, type ExecutionIdentity } from "./retro-workflow";

/** Capture the original definition and source paths once, before any ticket dispatch. */
export async function createRetroWorkflow(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	feature: string,
): Promise<RetroWorkflow> {
	const workspace = path.resolve(ctx.cwd);
	const files = await fs.readdir(path.join(workspace, ".scratch", feature, "implementation"), { withFileTypes: true });
	const tickets = new Set(files.filter(file => file.isFile() && file.name.endsWith(".md")).map(file => file.name));
	const { agents } = await discoverAgents(workspace);
	const agent = agents.find(candidate => candidate.name === "tdd");
	if (!agent || agent.blocking !== true) throw new Error('Spec-to-Code requires a blocking agent named "tdd".');
	const originalAgent = structuredClone(agent);
	const { skills } = await discoverSkills();
	const retro = skills.find(skill => skill.name === "retro");
	const writing = skills.find(skill => skill.name === "writing-for-agents");

	return new RetroWorkflow(feature, workspace, ctx.sessionManager.getSessionId(), ctx.agent.id, ctx.sessionManager.getSessionFile() ?? null, tickets, {
		async identify(result): Promise<ExecutionIdentity> {
			const ref = AgentRegistry.global().get(result.id);
			const sessionFile = ref?.sessionFile ?? null;
			const live = ref?.session;
			const sessionId = live?.sessionManager.getSessionId()
				?? (sessionFile ? await readSessionHeaderId(sessionFile) : undefined);
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
			const writingPrompt = (await buildSkillPromptMessage(writing, { args: "本轮只生成复盘建议正文，由宿主保存文档。" }, "autoload")).message;
			if (result.isolated) throw new Error("隔离执行的原会话不可续跑，本次复盘未交付。");
			const live = await AgentLifecycleManager.global().ensureLive(result.id);
			if (live.sessionManager.getSessionId() !== record.session_id) {
				throw new Error("原 TDD 会话身份已改变，拒绝在替代会话中复盘。");
			}
			const built = await buildSkillPromptMessage(retro, {
				args: `请复盘本次 ticket 的 TDD 执行对话历史，而不是父 session 或其他执行。\n${JSON.stringify({
					feature: record.feature, ticket: record.ticket, run_id: record.run_id,
					agent_id: record.agent_id, session_id: record.session_id, session_file: record.session_file,
				})}\nwriting-for-agents 的完整指导已由宿主加载在本消息中，等价完成该技能加载步骤；本宿主使用 read(skill://...)，没有 Skill 工具。\n按严重度返回 Markdown 复盘正文，基于原对话及工具结果区分事实、推断和未验证项；缺失的历史不得补造。只提出建议，不执行建议，不修改代码、检查配置、技能或代理指令，也不自行写文件。宿主负责附加身份信息并保存文档。TDD 实现轮已结束，本轮仅复盘，不继续实现或重跑验收。本轮已设置独立的单项完成契约，替代实现轮的 yield 参数；请调用 yield({key:1,data:"完整 Markdown 正文"})，失败时使用 yield({key:1,error:"原因"})。不要沿用 TDD 的 status/files/evidence 等对象，也不要用 JSON 对象包裹正文。`,
			}, "autoload");
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
	});
}

/** Both native flat and one-item batch task shapes are supported. */
export function tddTicket(input: Record<string, unknown>): string | undefined {
	const items = Array.isArray(input.tasks) ? input.tasks as Record<string, unknown>[] : [input];
	if (!items.some(item => item.agent === "tdd")) return undefined;
	if (items.length !== 1) throw new Error("每次 task 只能执行一张 TDD ticket，不能与其他子代理合并派发。");
	const name = items[0].name;
	if (typeof name !== "string" || !name.trim()) throw new Error("TDD task.name 必须填写票据完整文件名（含 .md），retry 使用相同名称。");
	return name;
}

export function tddResult(details: unknown): SingleResult | undefined {
	if (!details || typeof details !== "object" || !("results" in details) || !Array.isArray(details.results)) return undefined;
	return details.results.find((result: SingleResult) => result.agent === "tdd");
}
