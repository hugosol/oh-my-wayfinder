import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { TddWorkFlow, type ExecutionRecord } from "../implementation-node/tdd-execution";
import { TicketIntegration, type TicketIntegrationSnapshot } from "../integration-node/ticket-integration";
import { HyperGit, type TicketWorktree } from "./git";
import type { HyperHost, HyperRole } from "./subagent-host";

export interface TicketPlan {
	ticket: string;
	blockedBy: string[];
}
export interface Report {
	path: string;
	result: SingleResult;
	head: string;
}
interface TicketState extends TicketPlan {
	status: "ready" | "running" | "integrating" | "integrated" | "failed";
	worktree?: TicketWorktree;
	report?: Report;
	integration?: TicketIntegration;
	error?: string;
}
export type HyperAction = "status" | "plan" | "dispatch" | "collect" | "finish";

/** One implementation attempt of one ticket, recorded for the audit ledger. */
interface ExecutionAttempt {
	ticket: string;
	id: string;
	report?: string;
	error?: string;
}
export interface HyperInput {
	action: HyperAction;
	plan?: TicketPlan[];
	tickets?: string[];
}

/** Checkpoint format version; a mismatch means the saved pause is not ours to load. */
const CHECKPOINT_VERSION = 1;

/** A checkpoint only ever counts once fully written: a partial file must never look like a pause. */
async function atomicWrite(file: string, content: string): Promise<void> {
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		await fs.writeFile(temporary, content, "utf8");
		await fs.rename(temporary, file);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}

/** Read one checkpoint; a missing or foreign file is a precise failure, never a silent restart. */
async function readCheckpoint(file: string): Promise<Checkpoint> {
	let text: string;
	try {
		text = await fs.readFile(file, "utf8");
	} catch (error) {
		throw new Error(`找不到暂停检查点：${file}（${error instanceof Error ? error.message : String(error)}）`);
	}
	let state: Checkpoint;
	try {
		state = JSON.parse(text) as Checkpoint;
	} catch (error) {
		throw new Error(`暂停检查点无法解析：${file}（${error instanceof Error ? error.message : String(error)}）`);
	}
	if (state?.version !== CHECKPOINT_VERSION) throw new Error(`暂停检查点版本不受支持：${file}`);
	return state;
}

/**
 * Only state-machine variables: what the workflow needs to keep scheduling
 * after a restart, and nothing that can be re-derived from the environment.
 * No child session is revived; every drained attempt is already terminal.
 */
interface Checkpoint {
	version: typeof CHECKPOINT_VERSION;
	pauseId: string;
	pausedAt: string;
	slug: string;
	root: string;
	branch: string;
	baseline: string;
	temporaryDir: string;
	maxParallelTickets: number;
	ownerSessionId: string;
	ownerAgentId: string;
	planned: boolean;
	reports: string[];
	attempts: ExecutionAttempt[];
	retro: { tickets: string[]; records: ExecutionRecord[] };
	tickets: (Omit<TicketState, "integration"> & { integration?: TicketIntegrationSnapshot })[];
}

/** Completion is an execution outcome, not a main-agent judgment of report quality. */
function succeeded(result: SingleResult): boolean {
	return result.exitCode === 0 && !result.error && !result.aborted && !result.truncated;
}

/** Scheduling only: children own acceptance; Git serializes the shared merge workspace. */
export class HyperWorkflow {
	readonly tickets = new Map<string, TicketState>();
	readonly #running = new Map<string, Promise<void>>();
	readonly #integrating = new Map<string, Promise<void>>();
	#checkPending = false;
	#collection?: Promise<object>;
	#wakeCollection?: () => void;
	readonly #reports: string[] = [];
	readonly #attempts: ExecutionAttempt[] = [];
	/** The orchestration call holding the mutex, if any; a pause must let it finish admitting work. */
	#busyJob?: Promise<object>;
	#finished = false;
	#planned = false;
	#paused = false;
	#pausing = false;
	#pause?: Promise<object>;
	#pauseId?: string;
	#checkpoint?: string;

	private constructor(
		readonly slug: string,
		readonly git: HyperGit,
		readonly host: HyperHost,
		readonly maxParallelTickets: number,
		readonly ownerSessionId: string,
		readonly ownerAgentId: string,
		readonly temporaryDir: string,
		readonly baseline: string,
		readonly retro: TddWorkFlow,
	) {}

	static async create(
		slug: string,
		git: HyperGit,
		host: HyperHost,
		maxParallelTickets: number,
		sessionId: string,
		agentId: string,
		sessionFile: string | null,
	): Promise<HyperWorkflow> {
		const baseline = await git.commitTickets();
		const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "hyper-auto-coding-"));
		const entries = await fs.readdir(path.join(git.root, ".scratch", slug, "implementation"), { withFileTypes: true });
		const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
		const retro = new TddWorkFlow(slug, git.root, sessionId, agentId, sessionFile, new Set(names), host.retro, {
			maxConcurrent: maxParallelTickets,
			storageRoot: path.join(temporaryDir, "retro"),
		});
		const workflow = new HyperWorkflow(
			slug, git, host, maxParallelTickets, sessionId, agentId, temporaryDir, baseline, retro,
		);
		for (const ticket of names) workflow.tickets.set(ticket, { ticket, blockedBy: [], status: "ready" });
		return workflow;
	}

	/**
	 * Load a completed pause written by an earlier process. The integration
	 * checkout and every recorded worktree already exist, so nothing is created,
	 * committed, or re-validated, and no child session is revived: every drained
	 * attempt is terminal, and only the state machine comes back. The restored
	 * workflow starts paused, exactly as the checkpoint left it.
	 */
	static async restore(
		checkpoint: string,
		host: HyperHost,
		sessionId: string,
		agentId: string,
		sessionFile: string | null,
	): Promise<HyperWorkflow> {
		const state = await readCheckpoint(checkpoint);
		if (state.ownerSessionId !== sessionId || state.ownerAgentId !== agentId) {
			throw new Error(
				`暂停检查点属于会话 ${state.ownerSessionId}/${state.ownerAgentId}，不能由此会话恢复：${checkpoint}`,
			);
		}
		const worktrees: [string, TicketWorktree][] = [];
		for (const ticket of state.tickets) if (ticket.worktree) worktrees.push([ticket.ticket, ticket.worktree]);
		const git = HyperGit.adopt(state.root, state.branch, state.slug, worktrees);
		const retro = new TddWorkFlow(state.slug, state.root, sessionId, agentId, sessionFile,
			new Set(state.retro.tickets), host.retro, {
				maxConcurrent: state.maxParallelTickets,
				storageRoot: path.join(state.temporaryDir, "retro"),
			});
		retro.restore(state.retro.records);
		const workflow = new HyperWorkflow(state.slug, git, host, state.maxParallelTickets, sessionId, agentId,
			state.temporaryDir, state.baseline, retro);
		workflow.#planned = state.planned;
		workflow.#paused = true;
		workflow.#checkpoint = checkpoint;
		workflow.#pauseId = state.pauseId;
		workflow.#reports.push(...state.reports);
		workflow.#attempts.push(...state.attempts);
		for (const { integration, ...ticket } of state.tickets) {
			workflow.tickets.set(ticket.ticket, {
				...ticket,
				integration: integration && TicketIntegration.restore(git, host, workflow.#references(),
					(role, result, head) => workflow.#save(role, result, head),
					() => workflow.#requestCheck(), integration),
			});
		}
		return workflow;
	}

	owns(sessionId: string, agentId: string): boolean {
		return this.ownerSessionId === sessionId && this.ownerAgentId === agentId;
	}
	get finished(): boolean {
		return this.#finished;
	}
	/** True once a pause finished draining and persisted its checkpoint. */
	get paused(): boolean {
		return this.#paused;
	}
	/** True while a pause is draining; new attempts are already refused in this window. */
	get pausing(): boolean {
		return this.#pausing;
	}

	/**
	 * Where this session's pause is persisted: a deterministic file outside the
	 * repository, so a restarted session finds it without any repository state.
	 */
	static checkpointPath(sessionId: string): string {
		const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 16);
		const readable = sessionId.replace(/[^A-Za-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "session";
		return path.join(os.tmpdir(), `hyper-auto-coding-pause-${readable}-${digest}.json`);
	}

	status(): object {
		return {
			mode: this.#pausing ? "pausing" : this.#paused ? "paused" : "running",
			planned: this.#planned,
			paused: this.#paused,
			pausing: this.#pausing,
			checkpoint: this.#checkpoint ?? HyperWorkflow.checkpointPath(this.ownerSessionId),
			branch: this.git.branch,
			baseline: this.baseline,
			temporaryDir: this.temporaryDir,
			maxParallelTickets: this.maxParallelTickets,
			active: [...this.#running.keys()],
			integrating: [...this.#integrating.keys()],
			ready: this.#planned
				? [...this.tickets.values()].filter((ticket) => this.#ready(ticket)).map((ticket) => ticket.ticket)
				: [],
			tickets: [...this.tickets.values()].map(({ report, integration, ...ticket }) => ({
				...ticket,
				...integration?.snapshot,
				report: report?.path,
				reportSuccessful: report && succeeded(report.result),
			})),
			finished: this.#finished,
			lastReport: this.#reports[this.#reports.length - 1],
		};
	}

	async execute(input: HyperInput): Promise<object> {
		if (input.action === "status") return this.status();
		if (this.#finished) throw new Error("Hyper-Auto-Coding 已完成。");
		if (input.action === "collect") return this.#collect();
		if (this.#busyJob) throw new Error("另一个编排操作仍在执行。");
		const job = (async (): Promise<object> => {
			if (this.#pausing || this.#paused)
				throw new Error(
					`Hyper-Auto-Coding ${this.#pausing ? "正在暂停" : "已暂停"}；暂停期间只有 status 与 collect 可用，请先恢复再 plan、dispatch 或 finish。`,
				);
			switch (input.action) {
				case "plan": this.#plan(input.plan ?? []); break;
				case "dispatch": await this.#dispatch(input.tickets ?? []); break;
				case "finish": return await this.#finish();
				default: throw new Error(`未知编排操作：${String(input.action)}`);
			}
			return this.status();
		})();
		this.#busyJob = job;
		try {
			return await job;
		} finally {
			this.#busyJob = undefined;
		}
	}

	/**
	 * Close admission synchronously, drain every already-admitted implementation,
	 * integration and retro, then persist the paused state. Resolves with the
	 * paused status. A checkpoint that cannot be written never claims a pause:
	 * the run stays usable and the pause can be retried.
	 */
	pause(): Promise<object> {
		if (this.#finished) return Promise.reject(new Error("Hyper-Auto-Coding 已完成，不能暂停。"));
		if (this.#paused) return Promise.reject(new Error("Hyper-Auto-Coding 已经处于暂停状态。"));
		if (this.#pause) return this.#pause;
		// The gate closes before the first await: nothing may be admitted after this line.
		this.#pausing = true;
		const pauseId = randomUUID();
		const job = (async (): Promise<object> => {
			try {
				await this.#drainInflight();
				// A finish admitted before this pause ended the run: there is nothing left to checkpoint.
				if (this.#finished) throw new Error("Hyper-Auto-Coding 已完成，不能暂停。");
				const state: Checkpoint = {
					version: CHECKPOINT_VERSION,
					pauseId,
					pausedAt: new Date().toISOString(),
					slug: this.slug,
					root: this.git.root,
					branch: this.git.branch,
					baseline: this.baseline,
					temporaryDir: this.temporaryDir,
					maxParallelTickets: this.maxParallelTickets,
					ownerSessionId: this.ownerSessionId,
					ownerAgentId: this.ownerAgentId,
					planned: this.#planned,
					reports: [...this.#reports],
					attempts: this.#attempts,
					retro: { tickets: [...this.retro.tickets], records: [...this.retro.records] },
					tickets: [...this.tickets.values()].map(({ integration, ...ticket }) => ({
						...ticket,
						integration: integration?.snapshot,
					})),
				};
				const file = this.#checkpoint ?? HyperWorkflow.checkpointPath(this.ownerSessionId);
				await atomicWrite(file, `${JSON.stringify(state, null, 2)}\n`);
				this.#checkpoint = file;
				this.#pauseId = pauseId;
				this.#paused = true;
				this.#pausing = false;
				this.#requestCheck();
				return this.status();
			} catch (error) {
				this.#pause = undefined;
				this.#pausing = false;
				this.#requestCheck();
				throw error;
			}
		})();
		this.#pause = job;
		return job;
	}

	/**
	 * Consume the saved checkpoint, reopen admission and wake one collect. A
	 * resume in this live object and a restore in another process read the same
	 * file; deleting it is what keeps an active run from being rolled back.
	 */
	async resume(): Promise<object> {
		if (this.#finished) throw new Error("Hyper-Auto-Coding 已完成，不能恢复。");
		if (this.#pausing) throw new Error("暂停尚未完成；请等待 pause 返回后再恢复。");
		if (!this.#paused) throw new Error("Hyper-Auto-Coding 未处于暂停状态。");
		const file = this.#checkpoint ?? HyperWorkflow.checkpointPath(this.ownerSessionId);
		const state = await readCheckpoint(file);
		if (state.pauseId !== this.#pauseId) throw new Error(`暂停检查点与当前暂停不匹配：${file}`);
		// Consume the file before unlocking; a failed removal leaves the run resumable.
		await fs.rm(file);
		this.#paused = false;
		this.#pausing = false;
		this.#pause = undefined;
		this.#pauseId = undefined;
		this.#checkpoint = undefined;
		this.#requestCheck();
		return this.status();
	}

	#plan(plan: TicketPlan[]): void {
		if (this.#planned) throw new Error("执行依赖图已经登记，不能在执行期间替换。");
		if (plan.length !== this.tickets.size || new Set(plan.map((item) => item.ticket)).size !== plan.length)
			throw new Error("Phase 2 依赖图必须包含当前所有票据，每票一次。");
		const graph = new Map(plan.map((item) => [item.ticket, item.blockedBy]));
		for (const item of plan) {
			this.#ticket(item.ticket);
			for (const blocker of item.blockedBy) if (!graph.has(blocker)) throw new Error(`未知依赖票据：${blocker}`);
		}
		const visited = new Set<string>(), visiting = new Set<string>();
		const visit = (name: string): void => {
			if (visiting.has(name)) throw new Error(`票据依赖有环：${name}`);
			if (visited.has(name)) return;
			visiting.add(name);
			for (const blocker of graph.get(name)!) visit(blocker);
			visiting.delete(name);
			visited.add(name);
		};
		for (const name of graph.keys()) visit(name);
		for (const item of plan) this.#ticket(item.ticket).blockedBy = [...item.blockedBy];
		this.#planned = true;
	}
	#ticket(name: string): TicketState {
		const ticket = this.tickets.get(name);
		if (!ticket) throw new Error(`未知票据：${name}`);
		return ticket;
	}
	#ready(ticket: TicketState): boolean {
		return ticket.status === "ready" && ticket.blockedBy.every((name) => !!this.#ticket(name).integration?.snapshot.mergedHead);
	}
	#references(): string {
		return `集成分支：${this.git.branch}\nspec：${path.join(this.git.root, ".scratch", this.slug, "spec.md")}\ncontract：${path.join(this.git.root, ".scratch", this.slug, "contract.md")}`;
	}

	async #dispatch(names: string[]): Promise<void> {
		if (!this.#planned) throw new Error("先读取票据并登记 Phase 2 依赖图。");
		if (!names.length || new Set(names).size !== names.length) throw new Error("dispatch 必须提供不重复的票据名称。");
		if (this.#running.size + names.length > this.maxParallelTickets) throw new Error("已达到实现并发上限。");
		for (const name of names) if (!this.#ready(this.#ticket(name))) throw new Error(`票据尚不可执行：${name}`);
		for (const name of names) {
			// A pause closes admission between two tickets, including while the previous worktree is created.
			if (this.#pausing || this.#paused) break;
			const ticket = this.#ticket(name);
			const worktree = await this.git.createTicket(name);
			ticket.worktree = worktree;
			if (this.#pausing || this.#paused) break;
			const id = randomUUID();
			const previous = ticket.report?.path;
			const previousError = ticket.error;
			ticket.report = undefined;
			ticket.error = undefined;
			ticket.status = "running";
			const attempt: ExecutionAttempt = { ticket: name, id };
			this.#attempts.push(attempt);
			await this.retro.begin(id, name);
			const task = `${previousError ? `上次执行未被工作流接收，原因如下：\n${previousError}\n请先处理上述原因，再完成本票交付；保留已有工作，不要重复已完成且无需重跑的工作。\n\n` : ""}在当前 worktree 实现唯一票据：${path.join(worktree.cwd, ".scratch", this.slug, "implementation", name)}。\n${this.#references()}\n${previous ? `接手此前实现进度，不丢弃已有修改。上次报告：${previous}` : "这是本票首次执行。"}\n遵守 tdd skill，自行负责本票验收并报告实际验证与未完成事项。完成后尽快提交本票实现，交出 worktree，由独立集成子代理接管。不要修改其他票据或工作流报告，不操作集成分支工作区，不自行合入集成分支，不调用 retro、不派发其他票据。不得 reset 丢弃既有工作。`;
			const job = (async () => {
				let result: SingleResult | undefined, failure: string | undefined;
				try {
					result = await this.host.run({ role: "implement", cwd: worktree.cwd, name: `${name}-${id}`, task });
					ticket.report = await this.#save("implement", result, await this.git.ticketHead(worktree));
					attempt.report = ticket.report.path;
					if (!succeeded(result)) throw new Error(`实现执行未正常完成：${ticket.report.path}`);
					await this.git.assertTicketClean(worktree);
					ticket.status = "integrating";
					this.#startIntegration(ticket);
				} catch (error) {
					failure = error instanceof Error ? error.message : String(error);
					attempt.error = failure;
					ticket.error = failure;
					ticket.status = "ready";
					await this.#saveError("implement", id, failure);
				} finally {
					await this.retro.settle(id, result, failure);
					this.#running.delete(name);
					this.#requestCheck();
				}
			})();
			this.#running.set(name, job);
		}
	}

	#requestCheck(): void {
		this.#checkPending = true;
		this.#wakeCollection?.();
	}

	#collect(): Promise<object> {
		if (this.#collection) return this.#collection;
		// A paused run is frozen: report the snapshot instead of waiting for work that cannot start.
		if (this.#paused) return Promise.resolve(this.status());
		if (!this.#checkPending && !this.#running.size && !this.#integrating.size && !this.#pausing)
			throw new Error("没有运行中的实现或集成；请派发 ready 票据或结束工作流。");
		const progress = this.#checkPending
			? Promise.resolve()
			: this.#pausing
				// Draining is progress of its own: wait for the pause instead of failing or spinning.
				? this.#pause!.then(() => undefined, () => undefined)
				: new Promise<void>((resolve) => {
					this.#wakeCollection = resolve;
				});
		this.#collection = progress.then(() => {
			// Consume before checking. Changes after this snapshot stay pending for the next collect.
			this.#checkPending = false;
			return this.status();
		}).finally(() => {
			this.#wakeCollection = undefined;
			this.#collection = undefined;
		});
		return this.#collection;
	}

	/**
	 * Wait for every already-admitted piece of work: the orchestration call that
	 * may still admit attempts, its implementations, the integrations they
	 * started, and every retro those implementations began.
	 */
	async #drainInflight(): Promise<void> {
		await this.#busyJob?.catch(() => undefined);
		while (this.#running.size || this.#integrating.size)
			await Promise.allSettled([...this.#running.values(), ...this.#integrating.values()]);
		await this.retro.drain();
	}

	#startIntegration(ticket: TicketState): void {
		const integration = new TicketIntegration(this.git, this.host, this.#references(),
			(role, result, head) => this.#save(role, result, head),
			() => this.#requestCheck());
		ticket.integration = integration;
		const job = integration.run(ticket.ticket, ticket.worktree!, ticket.report!.path).then(() => {
			ticket.status = "integrated";
		}).catch(async (error) => {
			ticket.status = "failed";
			ticket.error = error instanceof Error ? error.message : String(error);
			await this.#saveError("integrate", randomUUID(), ticket.error);
		}).finally(() => {
			this.#integrating.delete(ticket.ticket);
			this.#requestCheck();
		});
		this.#integrating.set(ticket.ticket, job);
	}

	#allIntegrated(): void {
		if (!this.#planned || !this.tickets.size || this.#running.size || this.#integrating.size ||
			[...this.tickets.values()].some((ticket) => ticket.status !== "integrated"))
			throw new Error("全部票据集成处理结束后才能结束工作流。");
	}
	async #saveError(role: HyperRole, id: string, message: string): Promise<void> {
		const file = path.join(this.temporaryDir, `${role}-${id}-error.md`);
		await fs.writeFile(file, message, "utf8");
		this.#reports.push(file);
	}
	async #save(role: HyperRole, result: SingleResult, head: string): Promise<Report> {
		const file = path.join(this.temporaryDir, `${role}-${randomUUID()}.md`);
		const metadata = { role, agent: result.agent, agent_id: result.id, head,
			exitCode: result.exitCode, error: result.error, aborted: result.aborted, truncated: result.truncated };
		await fs.writeFile(file, `# ${role}\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n${result.output}\n`, "utf8");
		this.#reports.push(file);
		return { path: file, result, head };
	}
	async #finish(): Promise<object> {
		this.#allIntegrated();
		await this.retro.finish();
		const files = await this.retro.publish(path.join(this.git.root, ".scratch", this.slug, "retro"));
		const directory = path.join(this.git.root, ".scratch", this.slug, "execution", path.basename(this.temporaryDir));
		await fs.mkdir(directory, { recursive: true });
		for (const source of this.#reports) {
			const target = path.join(directory, path.basename(source));
			const body = await fs.readFile(source, "utf8");
			await fs.writeFile(target, body.split(this.temporaryDir).join(directory), "utf8");
			files.push(target);
		}
		const ledger = path.join(directory, "workflow.json");
		const body = JSON.stringify({ branch: this.git.branch, baseline: this.baseline,
			attempts: this.#attempts, tickets: this.status(), executions: this.retro.records }, null, 2);
		const encodedTemporaryDir = JSON.stringify(this.temporaryDir).slice(1, -1);
		const encodedDirectory = JSON.stringify(directory).slice(1, -1);
		await fs.writeFile(ledger, body.split(encodedTemporaryDir).join(encodedDirectory));
		files.push(ledger);
		const commit = await this.git.commitFiles(
			files.map((file) => path.relative(this.git.root, file).split(path.sep).join("/")),
			`hyper-auto-coding: ${this.slug} execution reports`,
		);
		const retainedBranches = [...this.git.worktrees.values()].map((tree) => tree.branch);
		const warnings = await this.git.cleanup();
		try { await this.host.close(); }
		catch (error) { warnings.push(`宿主临时产物清理失败：${error instanceof Error ? error.message : String(error)}`); }
		this.#finished = true;
		// A finished run must not be restorable: drop the paused state it may still carry.
		const checkpoint = this.#checkpoint ?? HyperWorkflow.checkpointPath(this.ownerSessionId);
		this.#checkpoint = undefined;
		this.#pauseId = undefined;
		this.#pause = undefined;
		this.#paused = false;
		this.#pausing = false;
		try { await fs.rm(checkpoint, { force: true }); }
		catch (error) { warnings.push(`暂停检查点未能删除，可能被再次恢复：${checkpoint}；${error instanceof Error ? error.message : String(error)}`); }
		try { await fs.rm(this.temporaryDir, { recursive: true }); }
		catch (error) { warnings.push(`报告临时目录保留：${this.temporaryDir}；${error instanceof Error ? error.message : String(error)}`); }
		return { branch: this.git.branch, commit, reports: files, executions: this.retro.records, warnings, retainedBranches };
	}
}
