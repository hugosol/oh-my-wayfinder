import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";

export interface ExecutionIdentity {
	agent: string;
	agent_id: string;
	session_id: string | null;
	session_file: string | null;
	execution_cwd: string | null;
}

export interface ExecutionRecord extends Partial<ExecutionIdentity> {
	feature: string;
	ticket: string;
	run_id: string;
	parent_session_id: string;
	parent_session_file: string | null;
	workspace: string;
	tool_call_id: string;
	started_at: string;
	tdd_finished_at?: string;
	tdd_status: "running" | "completed" | "failed";
	tdd_result?: SingleResult;
	tdd_error?: string;
	retro_status: "pending" | "running" | "completed" | "failed";
	retro_finished_at?: string;
	retro_error?: string;
	retro_document?: string;
	persistence_error?: string;
}

export interface RetroPorts {
	identify(result: SingleResult): Promise<ExecutionIdentity>;
	analyze(record: Readonly<ExecutionRecord>, result: SingleResult, signal: AbortSignal): Promise<SingleResult>;
	warn(message: string): void;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function atomicWrite(file: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporary, content, "utf8");
		await fs.rename(temporary, file);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}

/** One process-local workflow. Files are audit records, never a restart queue. */
export class RetroWorkflow {
	readonly #calls = new Map<string, ExecutionRecord>();
	readonly #pending = new Set<Promise<void>>();
	readonly #abort = new AbortController();
	#activeCall?: string;
	#closing = false;
	#finish?: Promise<string>;

	constructor(
		readonly feature: string,
		readonly workspace: string,
		readonly ownerSessionId: string,
		readonly ownerAgentId: string,
		readonly parentSessionFile: string | null,
		readonly tickets: ReadonlySet<string>,
		readonly ports: RetroPorts,
	) {}

	owns(sessionId: string, agentId: string): boolean {
		return this.ownerSessionId === sessionId && this.ownerAgentId === agentId;
	}

	get records(): readonly ExecutionRecord[] {
		return [...this.#calls.values()].map(record => structuredClone(record));
	}

	/** Reserve synchronously before disk I/O so concurrent tool calls cannot both start TDD. */
	async begin(toolCallId: string, ticket: string): Promise<void> {
		if (this.#calls.has(toolCallId)) return;
		if (this.#closing) throw new Error("Spec-to-Code 已进入收尾，不能再派发 TDD。");
		if (!this.tickets.has(ticket)) throw new Error(`task.name 必须是 implementation 目录中的完整票据文件名：${ticket}`);
		if (this.#activeCall) throw new Error("TDD 必须串行：请等待当前 task 返回后再派发下一次执行。");
		this.#activeCall = toolCallId;
		const record: ExecutionRecord = {
			feature: this.feature,
			ticket,
			run_id: randomUUID(),
			parent_session_id: this.ownerSessionId,
			parent_session_file: this.parentSessionFile,
			workspace: this.workspace,
			tool_call_id: toolCallId,
			started_at: new Date().toISOString(),
			tdd_status: "running",
			retro_status: "pending",
		};
		this.#calls.set(toolCallId, record);
		await this.#persist(record);
	}

	/** Save the implementation result before the same agent starts its independent retro turn. */
	async settle(toolCallId: string, result: SingleResult | undefined, error?: string): Promise<void> {
		const record = this.#calls.get(toolCallId);
		if (!record || record.tdd_status !== "running") return;
		record.tdd_finished_at = new Date().toISOString();
		record.tdd_status = result && result.exitCode === 0 && !result.aborted && !result.error && error === undefined ? "completed" : "failed";
		record.tdd_result = result ? structuredClone(result) : undefined;
		if (result) {
			record.agent = result.agent;
			record.agent_id = result.id;
		}
		record.tdd_error = error ?? result?.error;
		if (this.#activeCall === toolCallId) this.#activeCall = undefined;
		await this.#persist(record);

		// Track the whole background operation (including identity lookup) before yielding control.
		const job = this.#retro(record, result).catch(async failure => {
			record.retro_status = "failed";
			record.retro_error = errorText(failure);
			record.retro_finished_at = new Date().toISOString();
			this.ports.warn(`Retro 未交付：${record.ticket} / ${record.run_id}：${record.retro_error}`);
			await this.#persist(record);
		});
		this.#pending.add(job);
		void job.finally(() => this.#pending.delete(job));
	}

	async #retro(record: ExecutionRecord, result: SingleResult | undefined): Promise<void> {
		if (!result) throw new Error(record.tdd_error ?? "TDD 未返回可追溯的子代理结果，无法在原会话复盘。");
		Object.assign(record, await this.ports.identify(result));
		await this.#persist(record);
		if (!record.session_id) throw new Error("原 TDD session_id 不可用，不能生成可追溯复盘。");
		this.#abort.signal.throwIfAborted();
		record.retro_status = "running";
		await this.#persist(record);
		const retro = await this.ports.analyze(structuredClone(record), result, this.#abort.signal);
		if (retro.exitCode !== 0 || retro.aborted || retro.error) {
			throw new Error(retro.error || retro.stderr || "Retro 执行失败。");
		}
		if (retro.truncated) throw new Error("Retro 输出被截断，未作为完整文档交付。");
		if (!retro.output.trim()) throw new Error("Retro 未返回复盘正文。");
		this.#abort.signal.throwIfAborted();
		const document = this.#file(record, "md");
		const metadata = {
			feature: record.feature, ticket: record.ticket, run_id: record.run_id,
			agent: record.agent, agent_id: record.agent_id,
			session_id: record.session_id, session_file: record.session_file,
			parent_session_id: record.parent_session_id, parent_session_file: record.parent_session_file,
			workspace: record.workspace, execution_cwd: record.execution_cwd,
			tdd_status: record.tdd_status, started_at: record.started_at,
			tdd_finished_at: record.tdd_finished_at, retro_finished_at: new Date().toISOString(),
		};
		await atomicWrite(document, `# Retro — ${record.ticket}\n\n## Provenance\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n## Retrospective\n\n${retro.output.trim()}\n`);
		record.retro_document = document;
		record.retro_status = "completed";
		record.retro_finished_at = metadata.retro_finished_at;
		await this.#persist(record);
	}

	#file(record: ExecutionRecord, extension: string): string {
		return path.join(this.workspace, ".scratch", this.feature, "retro", record.ticket, `${record.run_id}.${extension}`);
	}

	async #persist(record: ExecutionRecord): Promise<void> {
		try {
			await atomicWrite(this.#file(record, "json"), `${JSON.stringify(record, null, 2)}\n`);
		} catch (error) {
			record.persistence_error = errorText(error);
			this.ports.warn(`执行记录写入失败：${record.ticket} / ${record.run_id}：${record.persistence_error}`);
		}
	}

	/** A failed retro is terminal too. No restart recovery and no automatic retro retries. */
	finish(): Promise<string> {
		if (this.#activeCall) return Promise.reject(new Error("TDD 尚未结束，不能开始最终汇总。"));
		if (this.#finish) return this.#finish;
		this.#closing = true;
		this.#finish = (async () => {
			await Promise.all([...this.#pending]);
			return this.summary();
		})();
		return this.#finish;
	}

	async cancel(): Promise<void> {
		this.#closing = true;
		this.#abort.abort(new Error("主 session 已退出或切换；后台 retro 已取消，不会自动恢复。"));
		await Promise.all([...this.#pending]);
	}

	summary(): string {
		const rows = this.records.map(record => ({
			ticket: record.ticket, run_id: record.run_id, agent_id: record.agent_id,
			session_id: record.session_id, tdd_status: record.tdd_status,
			tdd_error: record.tdd_error, execution_record: this.#file(record, "json"),
			retro_status: record.retro_status, retro_document: record.retro_document,
			retro_error: record.retro_error, persistence_error: record.persistence_error,
		}));
		const attempted = new Set(rows.map(row => row.ticket));
		const unattempted = [...this.tickets].filter(ticket => !attempted.has(ticket));
		return `Spec-to-Code ${this.feature}：所有已派发 TDD 与后台 retro 已收尾。TDD 状态表示执行结果，票据验收结论以各次 TDD 报告为准。\n${JSON.stringify({ executions: rows, unattempted_tickets: unattempted }, null, 2)}`;
	}
}
