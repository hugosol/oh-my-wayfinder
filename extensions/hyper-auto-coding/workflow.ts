import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { RetroWorkflow } from "../spec-to-code/retro-workflow";
import { HyperGit, type TicketWorktree } from "./git";
import type { HyperHost, HyperRole } from "./host";

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
	status: "ready" | "running" | "reported" | "accepted" | "integrated";
	worktree?: TicketWorktree;
	report?: Report;
	decision?: string;
}
export type HyperAction =
	| "status"
	| "plan"
	| "dispatch"
	| "collect"
	| "accept"
	| "integrate"
	| "confirm_integration"
	| "repair_integration"
	| "review"
	| "assess_review"
	| "fix"
	| "verify"
	| "accept_verification"
	| "finish";

/** One implementation attempt of one ticket, recorded for the audit ledger. */
interface ExecutionAttempt {
	ticket: string;
	id: string;
	report?: string;
	error?: string;
}

/** Main-agent acceptance decision recorded for one workflow action. */
interface AcceptanceDecision {
	action: HyperAction;
	ticket?: string;
	accepted: boolean;
	reason: string;
}

export interface HyperInput {
	action: HyperAction;
	plan?: TicketPlan[];
	tickets?: string[];
	ticket?: string;
	accepted?: boolean;
	reason?: string;
}

function succeeded(result: SingleResult): boolean {
	return result.exitCode === 0 && !result.error && !result.aborted && !result.truncated && !!result.output.trim();
}

/** Label for each read-only phase in HEAD-drift errors; the run must never move HEAD. */
const READ_ONLY_PHASE_LABEL: Record<"review" | "verify", string> = {
	review: "评审",
	verify: "验证",
};

/** The main agent makes acceptance decisions; this class enforces workspace and scheduling boundaries. */
export class HyperWorkflow {
	readonly tickets = new Map<string, TicketState>();
	readonly #running = new Map<string, Promise<void>>();
	readonly #reports: string[] = [];
	readonly #attempts: ExecutionAttempt[] = [];
	readonly #decisions: AcceptanceDecision[] = [];
	#busy = false;
	#integration?: { ticket: string; report?: Report };
	#review?: Report;
	#reviewAccepted = false;
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
			slug,
			git,
			host,
			maxParallelTickets,
			sessionId,
			agentId,
			temporaryDir,
			baseline,
			retro,
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
			ready:
				this.#planned && !this.#integration
					? [...this.tickets.values()].filter((ticket) => this.#ready(ticket)).map((ticket) => ticket.ticket)
					: [],
			tickets: [...this.tickets.values()].map(({ report, ...ticket }) => ({
				...ticket,
				report: report?.path,
				reportSuccessful: report && succeeded(report.result),
			})),
			integrationPending: this.#integration && {
				ticket: this.#integration.ticket,
				report: this.#integration.report?.path,
			},
			review: this.#review?.path,
			reviewAccepted: this.#reviewAccepted,
			verification: this.#verification?.path,
			verified: this.#verified,
			finished: this.#finished,
			lastReport: this.#reports[this.#reports.length - 1],
		};
	}

	async execute(input: HyperInput): Promise<object> {
		if (input.action === "status") return this.status();
		if (this.#finished) throw new Error("Hyper-Auto-Coding 已完成。");
		if (this.#busy) throw new Error("另一个编排操作仍在执行；集成工作区只能有一个写入者。");
		this.#busy = true;
		try {
			switch (input.action) {
				case "plan":
					this.#plan(input.plan ?? []);
					break;
				case "dispatch":
					await this.#dispatch(input.tickets ?? []);
					break;
				case "collect":
					await this.#collect();
					break;
				case "accept":
					await this.#accept(input);
					break;
				case "integrate":
					await this.#integrate(this.#ticket(input.ticket));
					break;
				case "confirm_integration":
					await this.#confirmIntegration(input);
					break;
				case "repair_integration":
					await this.#repairIntegration();
					break;
				case "review":
					await this.#runReview();
					break;
				case "assess_review":
					await this.#assessReview(input);
					break;
				case "fix":
					await this.#fix();
					break;
				case "verify":
					await this.#verify();
					break;
				case "accept_verification":
					await this.#acceptVerification(input);
					break;
				case "finish":
					return await this.#finish();
			}
			if (typeof input.accepted === "boolean" && input.reason) {
				this.#decisions.push({
					action: input.action,
					ticket: input.ticket,
					accepted: input.accepted,
					reason: input.reason,
				});
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
		const visited = new Set<string>(),
			visiting = new Set<string>();
		const visit = (name: string): void => {
			if (visiting.has(name)) throw new Error(`循环依赖：${name}`);
			if (visited.has(name)) return;
			visiting.add(name);
			for (const blocker of graph.get(name) ?? []) visit(blocker);
			visiting.delete(name);
			visited.add(name);
		};
		for (const name of graph.keys()) visit(name);
		for (const item of plan) this.#ticket(item.ticket).blockedBy = [...item.blockedBy];
		this.#planned = true;
	}

	#ticket(name: string | undefined): TicketState {
		const ticket = name && this.tickets.get(name);
		if (!ticket) throw new Error(`未知票据：${name ?? "未提供"}`);
		return ticket;
	}
	#ready(ticket: TicketState): boolean {
		return ticket.status === "ready" && ticket.blockedBy.every((name) => this.#ticket(name).status === "integrated");
	}
	#decision(input: HyperInput): boolean {
		if (typeof input.accepted !== "boolean" || !input.reason?.trim())
			throw new Error("主代理必须明确 accepted 并提供验收依据或未完成原因。");
		return input.accepted;
	}
	#references(): string {
		return `集成分支：${this.git.branch}\n固定评审起点：${this.baseline}\nspec：${path.join(this.git.root, ".scratch", this.slug, "spec.md")}\ncontract：${path.join(this.git.root, ".scratch", this.slug, "contract.md")}`;
	}

	async #dispatch(names: string[]): Promise<void> {
		if (!this.#planned) throw new Error("先读取票据并登记 Phase 2 依赖图。");
		if (this.#integration) throw new Error("集成验证未确认通过，暂停新票据执行。");
		if (!names.length || new Set(names).size !== names.length) throw new Error("dispatch 必须提供不重复的票据名称。");
		if (this.#running.size + names.length > this.maxParallelTickets) throw new Error("已达到实现并发上限。");
		for (const name of names) if (!this.#ready(this.#ticket(name))) throw new Error(`票据尚不可执行：${name}`);
		await this.git.assertClean();
		for (const name of names) {
			const ticket = this.#ticket(name);
			const worktree = await this.git.createTicket(name);
			ticket.worktree = worktree;
			const id = randomUUID();
			const previous = ticket.report?.path;
			ticket.report = undefined;
			ticket.status = "running";
			const attempt: ExecutionAttempt = { ticket: name, id };
			this.#attempts.push(attempt);
			await this.retro.begin(id, name);
			const task = `在当前 worktree 实现唯一票据：${path.join(worktree.cwd, ".scratch", this.slug, "implementation", name)}。\n${this.#references()}\n${previous ? `接手此前实现进度，不丢弃已有修改。先读上次报告：${previous}` : "这是本票首次执行。"}\n遵守 tdd skill。逐项报告验收证据、实际验证命令及未完成事项。不要修改其他票据、retro 或工作流报告。不要操作集成分支工作区。完成前将集成分支最新 tip 合入当前票据分支，解决冲突并验证；提交本票实现。不得 reset 丢弃既有工作。只执行本票，不调用 retro、不派发其他票据。`;
			const job = (async () => {
				let result: SingleResult | undefined, failure: string | undefined;
				try {
					result = await this.host.run({ role: "implement", cwd: worktree.cwd, name: `${name}-${id}`, task });
					ticket.report = await this.#save("implement", result, await this.git.ticketHead(worktree));
					attempt.report = ticket.report.path;
				} catch (error) {
					failure = error instanceof Error ? error.message : String(error);
					attempt.error = failure;
					const file = path.join(this.temporaryDir, `implement-${id}-error.md`);
					await fs.writeFile(file, failure, "utf8");
					this.#reports.push(file);
					ticket.decision = failure;
				} finally {
					await this.retro.settle(id, result, failure);
					ticket.status = "reported";
					this.#running.delete(name);
				}
			})();
			this.#running.set(name, job);
		}
	}

	async #collect(): Promise<void> {
		if (this.#running.size) {
			await Promise.race(this.#running.values());
		} else if (![...this.tickets.values()].some((ticket) => ticket.status === "reported")) {
			throw new Error("没有运行中的实现；请验收现有报告或派发 ready 票据。");
		}
	}
	async #accept(input: HyperInput): Promise<void> {
		const ticket = this.#ticket(input.ticket);
		if (ticket.status !== "reported") throw new Error("只能验收已结束的本次实现执行。");
		const accepted = this.#decision(input);
		if (accepted) {
			if (!ticket.report || !succeeded(ticket.report.result))
				throw new Error("本次执行失败或报告不完整，不能标记验收通过。");
			await this.git.assertTicketClean(ticket.worktree!);
			if ((await this.git.ticketHead(ticket.worktree!)) !== ticket.report.head)
				throw new Error("报告对应的票据提交已改变。");
		}
		ticket.status = accepted ? "accepted" : "ready";
		ticket.decision = input.reason;
	}

	async #integrate(ticket: TicketState): Promise<void> {
		if (this.#integration) throw new Error("先完成当前集成验证或修复。");
		if (ticket.status !== "accepted" || !ticket.worktree) throw new Error("票据尚未由主代理验收通过。");
		await this.git.assertClean();
		await this.git.assertTicketClean(ticket.worktree);
		if ((await this.git.ticketHead(ticket.worktree)) !== ticket.report!.head)
			throw new Error("票据验收后的提交已改变。");
		const sync = await this.#run(
			"integrate",
			ticket.worktree.cwd,
			`同步集成分支 ${this.git.branch} 最新 tip 到当前票据分支，解决冲突，重新运行本票验收及相关回归。票据：${ticket.ticket}。已验收报告：${ticket.report!.path}。${this.#references()}\n不要修改集成分支工作区。必要修复提交到当前票据分支；不要 reset 丢弃工作。返回实际验证结果和未解决事项。`,
		);
		if (!succeeded(sync.result)) {
			ticket.status = "ready";
			ticket.decision = `同步验证未完成：${sync.path}`;
			return;
		}
		await this.git.assertTicketClean(ticket.worktree);
		ticket.report = { ...ticket.report!, head: await this.git.ticketHead(ticket.worktree) };
		this.#integration = { ticket: ticket.ticket };
		await this.git.mergeTicket(ticket.worktree);
		this.#integration.report = await this.#run(
			"integrate",
			this.git.root,
			`在集成分支当前工作区执行合并后的针对性验证。票据：${ticket.ticket}。票据验收报告：${ticket.report!.path}；同步验证报告：${sync.path}。${this.#references()}\n验证本票验收、受影响交互和项目必要构建/检查，不机械重跑无关场景。只验证，不修改代码，不操作其他 worktree。报告实际命令、结果、未验证项和需修复事项。`,
		);
	}
	async #confirmIntegration(input: HyperInput): Promise<void> {
		const pending = this.#integration;
		if (!pending || pending.ticket !== input.ticket || !pending.report)
			throw new Error("没有该票可供确认的集成验证报告。");
		const accepted = this.#decision(input);
		if (!accepted) return;
		await this.#checkReport(pending.report);
		this.#ticket(pending.ticket).status = "integrated";
		this.#integration = undefined;
	}
	async #repairIntegration(): Promise<void> {
		if (!this.#integration) throw new Error("没有待修复的集成。");
		const ticket = this.#ticket(this.#integration.ticket);
		this.#integration.report = await this.#run(
			"fix",
			this.git.root,
			`修复当前集成失败，包括必要的未完成合并。票据：${ticket.ticket}。票据报告：${ticket.report?.path}。集成报告：${this.#integration.report?.path ?? "合并操作失败，检查 Git 状态"}。${this.#references()}\n只处理集成阻断问题，不改变验收含义、不 reset 或自动回滚。解决冲突或修复后实际运行本票及相关回归并提交代码。报告证据与未解决项。不要调用 retro。`,
		);
	}

	#allIntegrated(): void {
		if (
			!this.#planned ||
			!this.tickets.size ||
			this.#running.size ||
			this.#integration ||
			[...this.tickets.values()].some((ticket) => ticket.status !== "integrated")
		)
			throw new Error("全部票据集成并通过验证后才能进入最终阶段。");
	}
	async #runReview(): Promise<void> {
		this.#allIntegrated();
		this.#review = await this.#runReadOnly(
			"review",
			`加载并执行本仓库已安装的 code-review skill，对固定起点 ${this.baseline} 到当前 HEAD 的已提交变更进行评审，不评审默认未提交 diff。${this.#references()}\n显式读取 spec，contract 为补充依据。保留 Standards/Spec 双轴独立并行及分开汇总，按 skill 完整执行。评审只读，不应用修复、不提交、不运行 retro。只通过文档、提交和证据取材，不依赖主会话历史。`,
			() => {
				this.#reviewAccepted = false;
				this.#verified = false;
				this.#review = undefined;
			},
		);
	}
	async #assessReview(input: HyperInput): Promise<void> {
		if (!this.#review) throw new Error("先完成独立 code-review。");
		await this.#checkReport(this.#review);
		this.#reviewAccepted = this.#decision(input);
	}
	async #fix(): Promise<void> {
		this.#allIntegrated();
		if (!this.#review || this.#reviewAccepted) throw new Error("先评审并确认仍有需要处理的发现。");
		this.#verified = false;
		const fixed = await this.#run(
			"fix",
			this.git.root,
			`根据独立评审报告自动 apply 修复：${this.#review.path}。${this.#references()}\n已确认错误、遗漏、规范违反必须处理；有依据且不改变需求的建议可自动应用。不成立、重复或冲突的建议解释理由。不得修改需求、contract 或弱化验收，不扩大范围。运行相关验证并 commit 修复代码。只处理评审发现，不复盘、不自行宣布最终交付。报告每个发现的处置与证据，供下一次独立 reviewer 复核。`,
		);
		if (succeeded(fixed.result)) {
			await this.git.assertClean();
			this.#review = undefined;
		}
		this.#reviewAccepted = false;
	}
	async #verify(): Promise<void> {
		this.#allIntegrated();
		if (!this.#reviewAccepted || !this.#review) throw new Error("先完成评审修复及独立复核。");
		await this.#checkReport(this.#review);
		this.#verification = await this.#runReadOnly(
			"verify",
			`对当前集成分支做最终整体验证。${this.#references()}\n评审报告：${this.#review.path}。依据 contract 承诺、跨票据行为及项目要求选择并实际执行整体验证，逐项报告证据和未验证项。不得修改代码、需求或提交。不要调用 retro。`,
			() => {
				this.#verified = false;
				this.#verification = undefined;
			},
		);
	}
	async #acceptVerification(input: HyperInput): Promise<void> {
		if (!this.#verification) throw new Error("没有最终验证报告。");
		const accepted = this.#decision(input);
		if (accepted) await this.#checkReport(this.#verification);
		this.#verified = accepted;
	}
	async #checkReport(report: Report): Promise<void> {
		if (!succeeded(report.result)) throw new Error(`执行失败或报告不完整：${report.path}`);
		await this.git.assertClean();
		if ((await this.git.head()) !== report.head) throw new Error("验证或评审报告已过期，需要针对当前提交重新执行。");
	}

	/**
	 * Run one read-only phase (`review` or `verify`) under the HEAD+clean
	 * guard: the integration checkout is clean before and after, and HEAD must
	 * be the same commit. The phase's prior state is reset before the run, so a
	 * phase that mutated its own target can never leave an acceptable report.
	 */
	async #runReadOnly(role: "review" | "verify", task: string, reset: () => void): Promise<Report> {
		await this.git.assertClean();
		reset();
		const head = await this.git.head();
		const report = await this.#run(role, this.git.root, task);
		await this.git.assertClean();
		if ((await this.git.head()) !== head) {
			throw new Error(`只读${READ_ONLY_PHASE_LABEL[role]}期间集成分支提交被修改。`);
		}
		return report;
	}

	async #run(role: HyperRole, cwd: string, task: string): Promise<Report> {
		const result = await this.host.run({ role, cwd, task, name: `${role}-${randomUUID()}` });
		return this.#save(role, result, await this.git.head());
	}
	async #save(role: HyperRole, result: SingleResult, head: string): Promise<Report> {
		const file = path.join(this.temporaryDir, `${role}-${randomUUID()}.md`);
		const metadata = {
			role,
			agent: result.agent,
			agent_id: result.id,
			head,
			exitCode: result.exitCode,
			error: result.error,
			aborted: result.aborted,
			truncated: result.truncated,
		};
		await fs.writeFile(
			file,
			`# ${role}\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n\n${result.output}\n`,
			"utf8",
		);
		this.#reports.push(file);
		return { path: file, result, head };
	}
	async #finish(): Promise<object> {
		this.#allIntegrated();
		if (!this.#reviewAccepted || !this.#verified || !this.#verification)
			throw new Error("评审与最终验证尚未由主代理确认通过。");
		await this.#checkReport(this.#verification);
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
		const body = JSON.stringify(
			{
				branch: this.git.branch,
				baseline: this.baseline,
				attempts: this.#attempts,
				decisions: this.#decisions,
				tickets: this.status(),
				executions: this.retro.records,
			},
			null,
			2,
		);
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
		try {
			await this.host.close();
		} catch (error) {
			warnings.push(`宿主临时产物清理失败：${error instanceof Error ? error.message : String(error)}`);
		}
		this.#finished = true;
		try {
			await fs.rm(this.temporaryDir, { recursive: true });
		} catch (error) {
			warnings.push(`报告临时目录保留：${this.temporaryDir}；${error instanceof Error ? error.message : String(error)}`);
		}
		return {
			branch: this.git.branch,
			commit,
			reports: files,
			executions: this.retro.records,
			warnings,
			retainedBranches,
		};
	}
}
