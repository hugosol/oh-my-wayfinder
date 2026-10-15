import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { RetroWorkflow } from "../spec-to-code/execution-attempts";
import { HyperGit, type TicketWorktree } from "./git";
import type { HyperHost, HyperRole } from "./subagent-host";

export interface TicketPlan {
	ticket: string;
	blockedBy: string[];
}
interface Report {
	path: string;
	result: SingleResult;
	head: string;
}
interface TicketState extends TicketPlan {
	status: "ready" | "running" | "integrating" | "integrated" | "failed";
	worktree?: TicketWorktree;
	report?: Report;
	/** First successful merge releases dependencies independently of integration settlement. */
	mergedHead?: string;
	integrationReport?: string;
	integrationAgentId?: string;
	error?: string;
}
export type HyperAction = "status" | "plan" | "dispatch" | "collect" | "verify" | "fix" | "finish";

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

/** Completion is an execution outcome, not a main-agent judgment of report quality. */
function succeeded(result: SingleResult): boolean {
	return result.exitCode === 0 && !result.error && !result.aborted && !result.truncated;
}

/** Scheduling only: children own acceptance; Git serializes the shared merge workspace. */
export class HyperWorkflow {
	readonly tickets = new Map<string, TicketState>();
	readonly #running = new Map<string, Promise<void>>();
	readonly #integrating = new Map<string, Promise<void>>();
	readonly #progressWaiters = new Set<() => void>();
	readonly #reports: string[] = [];
	readonly #attempts: ExecutionAttempt[] = [];
	#busy = false;
	#verification?: Report;
	#verified = false;
	#finished = false;
	#planned = false;

	private constructor(
		readonly slug: string,
		readonly git: HyperGit,
		readonly host: HyperHost,
		readonly maxParallelTickets: number,
		readonly ownerSessionId: string,
		readonly ownerAgentId: string,
		readonly temporaryDir: string,
		readonly baseline: string,
		readonly retro: RetroWorkflow,
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
		const retro = new RetroWorkflow(slug, git.root, sessionId, agentId, sessionFile, new Set(names), host.retro, {
			maxConcurrent: maxParallelTickets,
			storageRoot: path.join(temporaryDir, "retro"),
		});
		const workflow = new HyperWorkflow(
			slug, git, host, maxParallelTickets, sessionId, agentId, temporaryDir, baseline, retro,
		);
		for (const ticket of names) workflow.tickets.set(ticket, { ticket, blockedBy: [], status: "ready" });
		return workflow;
	}

	owns(sessionId: string, agentId: string): boolean {
		return this.ownerSessionId === sessionId && this.ownerAgentId === agentId;
	}
	get finished(): boolean {
		return this.#finished;
	}

	status(): object {
		return {
			branch: this.git.branch,
			baseline: this.baseline,
			temporaryDir: this.temporaryDir,
			maxParallelTickets: this.maxParallelTickets,
			active: [...this.#running.keys()],
			integrating: [...this.#integrating.keys()],
			ready: this.#planned
				? [...this.tickets.values()].filter((ticket) => this.#ready(ticket)).map((ticket) => ticket.ticket)
				: [],
			tickets: [...this.tickets.values()].map(({ report, ...ticket }) => ({
				...ticket,
				report: report?.path,
				reportSuccessful: report && succeeded(report.result),
			})),
			verification: this.#verification?.path,
			verified: this.#verified,
			finished: this.#finished,
			lastReport: this.#reports[this.#reports.length - 1],
		};
	}

	async execute(input: HyperInput): Promise<object> {
		if (input.action === "status") return this.status();
		if (this.#finished) throw new Error("Hyper-Auto-Coding 已完成。");
		if (this.#busy) throw new Error("另一个编排操作仍在执行。");
		this.#busy = true;
		try {
			switch (input.action) {
				case "plan": this.#plan(input.plan ?? []); break;
				case "dispatch": await this.#dispatch(input.tickets ?? []); break;
				case "collect": await this.#collect(); break;
				case "verify": await this.#verify(); break;
				case "fix": await this.#fix(); break;
				case "finish": return await this.#finish();
				default: throw new Error(`未知编排操作：${String(input.action)}`);
			}
			return this.status();
		} finally {
			this.#busy = false;
		}
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
		return ticket.status === "ready" && ticket.blockedBy.every((name) => !!this.#ticket(name).mergedHead);
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
			const ticket = this.#ticket(name);
			const worktree = await this.git.createTicket(name);
			ticket.worktree = worktree;
			const id = randomUUID();
			const previous = ticket.report?.path;
			ticket.report = undefined;
			ticket.error = undefined;
			ticket.status = "running";
			const attempt: ExecutionAttempt = { ticket: name, id };
			this.#attempts.push(attempt);
			await this.retro.begin(id, name);
			const task = `在当前 worktree 实现唯一票据：${path.join(worktree.cwd, ".scratch", this.slug, "implementation", name)}。\n${this.#references()}\n${previous ? `接手此前实现进度，不丢弃已有修改。上次报告：${previous}` : "这是本票首次执行。"}\n遵守 tdd skill，自行负责本票验收并报告实际验证与未完成事项。完成后尽快提交本票实现，交出 worktree，由独立集成子代理接管。不要修改其他票据或工作流报告，不操作集成分支工作区，不自行合入集成分支，不调用 retro、不派发其他票据。不得 reset 丢弃既有工作。`;
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
				}
			})();
			this.#running.set(name, job);
		}
	}

	async #collect(): Promise<void> {
		const pending = [...this.#running.values(), ...this.#integrating.values()];
		if (!pending.length) throw new Error("没有运行中的实现或集成；请派发 ready 票据或进入最终验证。");
		let wake!: () => void;
		const progress = new Promise<void>((resolve) => {
			wake = resolve;
			this.#progressWaiters.add(wake);
		});
		try {
			await Promise.race([...pending, progress]);
		} finally {
			this.#progressWaiters.delete(wake);
		}
	}

	#startIntegration(ticket: TicketState): void {
		const job = this.#integrate(ticket).catch(async (error) => {
			ticket.status = "failed";
			ticket.error = error instanceof Error ? error.message : String(error);
			await this.#saveError("integrate", randomUUID(), ticket.error);
		}).finally(() => this.#integrating.delete(ticket.ticket));
		this.#integrating.set(ticket.ticket, job);
	}

	async #integrate(ticket: TicketState): Promise<void> {
		const worktree = ticket.worktree!;
		const first = await this.git.mergeTicket(worktree, true);
		if (first.merged) {
			ticket.mergedHead = first.head;
			for (const wake of this.#progressWaiters) wake();
		}
		const name = `integrate-${ticket.ticket}-${randomUUID()}`;
		const request = {
			role: "integrate" as const,
			cwd: worktree.cwd,
			name,
			task: `接管本票原开发 worktree 和 branch，TDD 会话已结束，不复用它。票据：${ticket.ticket}。实现报告：${ticket.report!.path}。\n${this.#references()}\n首次合入${first.merged ? "已成功" : "有冲突，集成工作区已 abort"}，宿主已将集成提交 ${first.head} merge 回当前开发分支。${first.conflicts ? "当前 worktree 有待解决冲突，请自行阅读代码判断并解决。" : "检查当前同步结果。"}\n本轮自行完成集成验收：只要求运行项目全局测试，通过前直接修复问题。复杂脚本、实机 smoke 与跨票据整体验收留给最后独立门禁。解决冲突及修复均提交到当前开发分支，保持工作区干净。不得操作集成工作区、切换分支、新建 worktree、reset 丢弃工作或调用 retro。不要直接合入集成分支；返回后宿主排队合并。如再次冲突，会在此同一会话继续，不另派 fixer。`,
		};
		let result = await this.host.run(request);
		ticket.integrationAgentId = result.id;
		while (true) {
			const report = await this.#save("integrate", result, await this.git.ticketHead(worktree));
			ticket.integrationReport = report.path;
			if (!succeeded(result)) throw new Error(`集成执行未正常完成：${report.path}`);
			await this.git.assertTicketClean(worktree);
			const merge = await this.git.mergeTicket(worktree, false);
			if (merge.merged) {
				ticket.mergedHead ??= merge.head;
				ticket.status = "integrated";
				return;
			}
			result = await this.host.resume({
				...request,
				id: ticket.integrationAgentId,
				task: `本票回合并发生冲突，集成工作区已 abort。宿主已将集成提交 ${merge.head} merge 回此原开发 worktree。${merge.conflicts ? "请解决当前 Git 冲突。" : "逆向同步已完成。"}沿用本会话的代码上下文，自行阅读判断、完成必要调整并提交，保持工作区干净。不新建 worktree、不操作集成工作区、不修改需求。仅首次调用强制运行全局测试；本轮自行判断必要验证，不启动新一轮完整验收。返回后宿主再次排队合入，合入成功即结束。`,
			});
		}
	}

	#allIntegrated(): void {
		if (!this.#planned || !this.tickets.size || this.#running.size || this.#integrating.size ||
			[...this.tickets.values()].some((ticket) => ticket.status !== "integrated"))
			throw new Error("全部票据集成处理结束后才能进入最终阶段。");
	}
	async #verify(): Promise<void> {
		this.#allIntegrated();
		this.#verified = false;
		this.#verification = undefined;
		await this.git.assertClean();
		const head = await this.git.head();
		const report = await this.#run("verify", this.git.root,
			`对当前集成分支做最终整体验证。${this.#references()}\n不执行 code-review。依据 contract 承诺、跨票据行为及项目要求实际执行整体验证，包括必要的复杂脚本或实机 smoke；逐项报告实际证据、失败与未验证项。自行负责验收，通过则正常完成，失败明确以执行失败返回供 fixer 接手。不得修改代码、需求或提交，不调用 retro。`);
		await this.git.assertClean();
		if ((await this.git.head()) !== head) throw new Error("只读验证期间集成分支提交被修改。");
		this.#verification = report;
		this.#verified = succeeded(report.result);
	}
	async #fix(): Promise<void> {
		this.#allIntegrated();
		if (!this.#verification || this.#verified) throw new Error("先执行最终验证并取得失败报告。");
		const previous = this.#verification;
		this.#verified = false;
		await this.#run("fix", this.git.root,
			`修复最终整体验证发现的问题，报告：${previous.path}。${this.#references()}\n不执行 code-review，不改变需求或弱化验收。根据失败证据阅读代码、修复、运行必要检查并提交，保持工作区干净。完成后由独立 verify 子代理重新验证；不要自行宣布交付，不调用 retro。`);
		await this.git.assertClean();
	}
	async #checkVerification(): Promise<void> {
		if (!this.#verified || !this.#verification) throw new Error("最终验证尚未正常完成。");
		await this.git.assertClean();
		if ((await this.git.head()) !== this.#verification.head) throw new Error("验证报告已过期，需要针对当前提交重新执行。");
	}
	async #run(role: HyperRole, cwd: string, task: string): Promise<Report> {
		const result = await this.host.run({ role, cwd, task, name: `${role}-${randomUUID()}` });
		return this.#save(role, result, await this.git.head());
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
		await this.#checkVerification();
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
		try { await fs.rm(this.temporaryDir, { recursive: true }); }
		catch (error) { warnings.push(`报告临时目录保留：${this.temporaryDir}；${error instanceof Error ? error.message : String(error)}`); }
		return { branch: this.git.branch, commit, reports: files, executions: this.retro.records, warnings, retainedBranches };
	}
}
