import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { HyperGit } from "./git";
import type { HyperHost, HyperRole, HyperRun } from "./subagent-host";
import { cleanupFixtures, git, initRepo, ticketFile, write } from "./test-support";
import { HyperWorkflow } from "./workflow";

interface TicketSnapshot {
	ticket: string;
	status: "ready" | "running" | "integrating" | "integrated" | "failed";
	mergedHead?: string;
	worktree?: { branch: string; cwd: string };
	error?: string;
}
interface StatusSnapshot {
	mode: "running" | "pausing" | "paused";
	planned: boolean;
	paused: boolean;
	pausing: boolean;
	checkpoint: string;
	temporaryDir: string;
	active: string[];
	integrating: string[];
	ready: string[];
	tickets: TicketSnapshot[];
}
interface CheckpointTicket {
	ticket: string;
	status: TicketSnapshot["status"];
	worktree?: { branch: string; cwd: string };
	integration?: { mergedHead?: string; integrationReport?: string; integrationAgentId?: string };
}
interface CheckpointSnapshot {
	version: number;
	planned: boolean;
	temporaryDir: string;
	reports: string[];
	attempts: { ticket: string; id: string; report?: string; error?: string }[];
	retro: { tickets: string[]; records: { ticket: string; tool_call_id: string; retro_status: string; retro_error?: string }[] };
	tickets: CheckpointTicket[];
}
interface FinishSummary {
	reports: string[];
	warnings: string[];
	retainedBranches: string[];
}
interface Ledger {
	attempts: { ticket: string; id: string; report?: string; error?: string }[];
	executions: {
		tool_call_id: string;
		agent_id?: string;
		ticket: string;
		run_id: string;
		tdd_status: string;
		retro_status: string;
		retro_error?: string;
		retro_document?: string;
	}[];
}

const workflows: HyperWorkflow[] = [];
const releases: (() => void)[] = [];
afterEach(async () => {
	for (const release of releases.splice(0)) release();
	for (const workflow of workflows.splice(0)) {
		await drain(workflow);
		await workflow.retro.finish();
		for (const tree of workflow.git.worktrees.values()) {
			if (await fs.stat(tree.cwd).catch(() => null))
				await git(workflow.git.root, "worktree", "remove", "--force", tree.cwd);
		}
		await fs.rm(workflow.temporaryDir, { recursive: true, force: true });
	}
	await fs.rm(HyperWorkflow.checkpointPath("parent"), { recursive: true, force: true });
	await cleanupFixtures();
});

function result(request: Pick<HyperRun, "role" | "task">, overrides: Partial<SingleResult> = {}): SingleResult {
	return { index: 0, id: randomUUID(), agent: request.role, agentSource: "project", task: request.task,
		exitCode: 0, output: "Required behavior verified; no unresolved acceptance items.", stderr: "",
		truncated: false, durationMs: 1, tokens: 1, requests: 1, ...overrides };
}
async function status(workflow: HyperWorkflow): Promise<StatusSnapshot> {
	return await workflow.execute({ action: "status" }) as unknown as StatusSnapshot;
}
function ticketSnapshot(state: StatusSnapshot, name: string): TicketSnapshot {
	const entry = state.tickets.find((ticket) => ticket.ticket === name);
	if (!entry) throw new Error(`Missing ticket ${name}`);
	return entry;
}
async function drain(workflow: HyperWorkflow): Promise<void> {
	while (true) {
		const state = await status(workflow);
		if (!state.active.length && !state.integrating.length) return;
		await workflow.execute({ action: "collect" });
	}
}
function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	releases.push(release);
	return { promise, release };
}

async function fixture(options: {
	cap?: number;
	implementationGate?: Promise<void>;
	retroGate?: Promise<void>;
	throwImplementation?: () => boolean;
	implementationWork?: (request: HyperRun) => Promise<void>;
	integrationWork?: (request: HyperRun) => Promise<void>;
	resumeWork?: (request: HyperRun & { id: string }) => Promise<void>;
	failRetro?: (ticket: string) => boolean;
} = {}) {
	const repo = await initRepo({ slug: "feature", branch: "feature/delivery", prefix: "hyper-workflow-test-",
		spec: "Deliver independent A and B, then dependent C.", contract: "P1: A; P2: B; P3: C sees A." });
	const { root } = repo;
	await write(path.join(root, "shared.txt"), "base\n");
	await git(root, "add", "shared.txt");
	await git(root, "commit", "-m", "shared base");
	const backend = await HyperGit.inspect(root, repo.slug);
	for (const name of ["a.md", "b.md", "c.md"]) await ticketFile(repo, name);
	const events: string[] = [];
	const retroIds: string[] = [];
	const runs: { role: HyperRole; id: string; cwd: string; resumed: boolean }[] = [];
	const retroWarnings: string[] = [];
	const published = async () => (await fs.readdir(path.join(root, ".scratch", repo.slug))).sort();
	const host: HyperHost = {
		async run(request) {
			const execution = result(request);
			runs.push({ role: request.role, id: execution.id, cwd: request.cwd, resumed: false });
			if (request.role === "implement") {
				await options.implementationGate;
				if (options.throwImplementation?.()) throw new Error("implementation transport failed");
				const name = request.name[0];
				await write(path.join(request.cwd, `${name}.txt`), `delivered ${name}\n`);
				await options.implementationWork?.(request);
				await git(request.cwd, "add", ".");
				await git(request.cwd, "commit", "--allow-empty", "-m", `deliver ${name}`);
			} else if (request.role === "integrate") {
				await options.integrationWork?.(request);
			}
			return execution;
		},
		async resume(request) {
			runs.push({ role: request.role, id: request.id, cwd: request.cwd, resumed: true });
			await options.resumeWork?.(request);
			return result(request, { id: request.id });
		},
		async close() { events.push(`close:publication=${JSON.stringify(await published())}`); },
		retro: {
			async identify(execution) {
				return { agent: execution.agent, agent_id: execution.id, session_id: `session-${execution.id}`,
					session_file: null, execution_cwd: root };
			},
			async analyze(record, execution) {
				retroIds.push(execution.id);
				await options.retroGate;
				events.push(`retro:${record.ticket}:publication=${JSON.stringify(await published())}`);
				if (options.failRetro?.(record.ticket))
					return { ...execution, exitCode: 1, output: "", error: "retro turn returned no transcript" };
				return { ...execution, output: "Keep the successful behavioral verification; no instruction changes applied." };
			},
			warn(message) { retroWarnings.push(message); },
		},
	};
	const workflow = await HyperWorkflow.create("feature", backend, host, options.cap ?? 2, "parent", "Main", null);
	workflows.push(workflow);
	await workflow.execute({ action: "plan", plan: [
		{ ticket: "a.md", blockedBy: [] }, { ticket: "b.md", blockedBy: [] }, { ticket: "c.md", blockedBy: ["a.md"] },
	] });
	return { root, workflow, host, retroIds, runs, retroWarnings, events };
}
async function complete(workflow: HyperWorkflow, ticket: string): Promise<void> {
	await workflow.execute({ action: "dispatch", tickets: [ticket] });
	await drain(workflow);
	expect(ticketSnapshot(await status(workflow), ticket).status).toBe("integrated");
}

/** Minimal host for create-time tests that never dispatch, integrate, or run retro. */
function stubHost(): HyperHost {
	return {
		retro: {
			identify: async () => ({ agent: "retro", agent_id: "retro", session_id: null, session_file: null, execution_cwd: null }),
			analyze: async (_record: unknown, result: SingleResult) => result,
			warn: () => {},
		},
	} as unknown as HyperHost;
}

test("phase 2 publishes the contract mapping phase 1 filled and starts on a clean checkout", async () => {
	const repo = await initRepo({ slug: "feature", branch: "feature/delivery", prefix: "hyper-workflow-test-",
		spec: "S", contract: "C" });
	const backend = await HyperGit.inspect(repo.root, repo.slug);
	await ticketFile(repo, "a.md");
	// Phase 1 fills the contract's "Delivering work" mapping; leaving it uncommitted
	// used to fail every first integration merge with a dirty-worktree rejection.
	await write(path.join(repo.root, ".scratch", repo.slug, "contract.md"), "C\n|P1|[01](implementation/a.md)|\n");
	const workflow = await HyperWorkflow.create("feature", backend, stubHost(), 1, "parent", "Main", null);
	workflows.push(workflow);
	expect((await git(repo.root, "status", "--porcelain")).trim()).toBe("");
});

test("phase 2 refuses to start when phase 1 left the checkout dirty", async () => {
	const repo = await initRepo({ slug: "feature", branch: "feature/delivery", prefix: "hyper-workflow-test-",
		spec: "S", contract: "C" });
	const backend = await HyperGit.inspect(repo.root, repo.slug);
	await ticketFile(repo, "a.md");
	// A tracked or untracked edit outside the published tickets and contract mapping
	// would make every integration merge fail assertClean, so create must stop now.
	await write(path.join(repo.root, "phase1-leftover.txt"), "uncommitted\n");
	await expect(HyperWorkflow.create("feature", backend, stubHost(), 1, "parent", "Main", null)).rejects.toThrow(/不干净/);
});

test("implementation slots are bounded; first merge releases dependencies while integration remains asynchronous", async () => {
	const implementing = gate(), integrating = gate();
	const { workflow, root } = await fixture({ cap: 2, implementationGate: implementing.promise,
		integrationWork: async () => { await integrating.promise; } });
	const dispatched = await workflow.execute({ action: "dispatch", tickets: ["a.md", "b.md"] }) as unknown as StatusSnapshot;
	expect(dispatched.active).toEqual(["a.md", "b.md"]);
	await expect(workflow.execute({ action: "dispatch", tickets: ["c.md"] })).rejects.toThrow("并发上限");
	implementing.release();
	while (!ticketSnapshot(await status(workflow), "a.md").mergedHead)
		await workflow.execute({ action: "collect" });
	while ((await status(workflow)).active.length) await workflow.execute({ action: "collect" });
	const state = await status(workflow);
	expect(ticketSnapshot(state, "a.md").status).toBe("integrating");
	expect(state.ready).toContain("c.md");
	expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("delivered a\n");
	await workflow.execute({ action: "dispatch", tickets: ["c.md"] });
	const c = ticketSnapshot(await status(workflow), "c.md").worktree!;
	expect(await git(c.cwd, "show", "HEAD:a.txt")).toBe("delivered a");
	integrating.release();
	await drain(workflow);
});

async function collectBeforeNextTurn(collection: Promise<object>): Promise<StatusSnapshot> {
	// Retained progress requires only an in-memory snapshot, not another I/O event.
	return await Promise.race([
		collection as Promise<StatusSnapshot>,
		new Promise<never>((_, reject) => {
			setImmediate(() => reject(new Error("collect missed pending progress")));
		}),
	]);
}

test("collect retains a first merge between calls and releases downstream without waiting for integration", async () => {
	const entered = gate(), integrating = gate();
	const { workflow } = await fixture({ integrationWork: async () => {
		entered.release();
		await integrating.promise;
	} });
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	const first = await workflow.execute({ action: "collect" }) as StatusSnapshot;
	expect(first.active).toEqual([]);
	await entered.promise;
	const collection = workflow.execute({ action: "collect" });
	try {
		const state = await collectBeforeNextTurn(collection);
		expect(state.ready).toContain("c.md");
		expect(state.integrating).toEqual(["a.md"]);
		await workflow.execute({ action: "dispatch", tickets: ["c.md"] });
		expect((await status(workflow)).active).toContain("c.md");
	} finally {
		integrating.release();
		await collection;
	}
});

async function waitForState(workflow: HyperWorkflow, matches: (state: StatusSnapshot) => boolean): Promise<StatusSnapshot> {
	while (true) {
		const state = await status(workflow);
		if (matches(state)) return state;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
}

test("collect coalesces earlier changes but retains completion after a previous snapshot", async () => {
	const integrating = gate();
	const { workflow } = await fixture({ integrationWork: async () => { await integrating.promise; } });
	await workflow.execute({ action: "dispatch", tickets: ["a.md", "b.md"] });
	await waitForState(workflow, (state) => state.active.length === 0 &&
		["a.md", "b.md"].every((name) => !!ticketSnapshot(state, name).mergedHead));
	const snapshot = await collectBeforeNextTurn(workflow.execute({ action: "collect" }));
	expect(snapshot.integrating).toEqual(["a.md", "b.md"]);
	expect(snapshot.ready).toEqual(["c.md"]);

	// All earlier notifications were consumed by one check; another collect must wait.
	let returned = false;
	const waiting = workflow.execute({ action: "collect" }).then((state) => { returned = true; return state; });
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(returned).toBe(false);
	integrating.release();
	const completion = await waiting as StatusSnapshot;
	expect(completion.tickets.some((ticket) => ticket.status === "integrated")).toBe(true);
	await drain(workflow);
});

test("collect retains terminal progress even when no background tasks remain", async () => {
	const { workflow } = await fixture();
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await waitForState(workflow, (state) => state.active.length === 0 && state.integrating.length === 0);
	const state = await collectBeforeNextTurn(workflow.execute({ action: "collect" }));
	expect(ticketSnapshot(state, "a.md").status).toBe("integrated");
	expect(state.ready).toContain("c.md");
	await expect(workflow.execute({ action: "collect" })).rejects.toThrow("没有运行中的实现或集成");
});

test("concurrent collect requests share progress without blocking dispatch", async () => {
	const implementing = gate(), bImplementing = gate(), integrating = gate();
	const { workflow } = await fixture({
		implementationGate: implementing.promise,
		implementationWork: async (request) => {
			if (request.name.startsWith("b.md")) await bImplementing.promise;
		},
		integrationWork: async () => { await integrating.promise; },
	});
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	const first = workflow.execute({ action: "collect" });
	const second = workflow.execute({ action: "collect" });
	try {
		await workflow.execute({ action: "dispatch", tickets: ["b.md"] });
		expect((await status(workflow)).active).toEqual(["a.md", "b.md"]);
		implementing.release();
		for (const state of await Promise.all([first, second]) as StatusSnapshot[]) {
			expect(state.active).toEqual(["b.md"]);
			expect(ticketSnapshot(state, "a.md").status).toBe("integrating");
		}
	} finally {
		implementing.release();
		bImplementing.release();
		integrating.release();
		await Promise.allSettled([first, second]);
	}
});

test("failed implementation retries reuse the original branch and worktree without main-agent acceptance", async () => {
	let fail = true;
	const { workflow } = await fixture({ throwImplementation: () => fail });
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	const first = ticketSnapshot(await status(workflow), "a.md");
	expect(first.status).toBe("ready");
	expect(first.mergedHead).toBeUndefined();
	fail = false;
	await complete(workflow, "a.md");
	expect(ticketSnapshot(await status(workflow), "a.md").worktree).toEqual(first.worktree);
	expect(await fs.readFile(path.join(first.worktree!.cwd, "a.txt"), "utf8")).toBe("delivered a\n");
});

test("post-test merge conflicts resume the same integration session in the original worktree and then terminate", async () => {
	const aTesting = gate(), releaseA = gate();
	const { workflow, root, runs } = await fixture({
		implementationWork: async (request) => {
			if (request.name.startsWith("b.md")) await write(path.join(request.cwd, "shared.txt"), "B\n");
		},
		integrationWork: async (request) => {
			if (!request.name.includes("a.md")) return;
			aTesting.release();
			await releaseA.promise;
			await write(path.join(request.cwd, "shared.txt"), "A fix\n");
			await git(request.cwd, "add", "shared.txt");
			await git(request.cwd, "commit", "-m", "A test fix");
		},
		resumeWork: async (request) => {
			expect(await git(root, "status", "--porcelain")).toBe("");
			expect(await git(request.cwd, "diff", "--name-only", "--diff-filter=U")).toBe("shared.txt");
			await write(path.join(request.cwd, "shared.txt"), "A fix with B\n");
			await git(request.cwd, "add", "shared.txt");
			await git(request.cwd, "commit", "-m", "resolve A and B");
		},
	});
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await aTesting.promise;
	await workflow.execute({ action: "dispatch", tickets: ["b.md"] });
	while (ticketSnapshot(await status(workflow), "b.md").status !== "integrated")
		await workflow.execute({ action: "collect" });
	releaseA.release();
	await drain(workflow);
	expect(ticketSnapshot(await status(workflow), "a.md").status).toBe("integrated");
	expect(await fs.readFile(path.join(root, "shared.txt"), "utf8")).toBe("A fix with B\n");
	const aTree = ticketSnapshot(await status(workflow), "a.md").worktree!;
	const aIntegration = runs.filter((run) => run.role === "integrate" && run.cwd === aTree.cwd);
	expect(aIntegration.map((run) => run.resumed)).toEqual([false, true]);
	expect(aIntegration[1].id).toBe(aIntegration[0].id);
	expect([...workflow.git.worktrees.values()].map((tree) => tree.cwd).sort()).toEqual(
		(await status(workflow)).tickets.filter((ticket) => ticket.worktree).map((ticket) => ticket.worktree!.cwd).sort(),
	);
	expect((await git(root, "worktree", "list", "--porcelain")).match(/^worktree /gm)?.length).toBe(3);
});

test("first-merge conflict starts one integration child; its successful merge does not run validation again", async () => {
	const implementationDone = gate(), beginImplementation = gate();
	const { workflow, root, runs } = await fixture({
		implementationWork: async (request) => {
			if (!request.name.startsWith("a.md")) return;
			await write(path.join(request.cwd, "shared.txt"), "A\n");
			implementationDone.release();
			await beginImplementation.promise;
		},
		integrationWork: async (request) => {
			expect(await git(root, "status", "--porcelain")).toBe("");
			expect(await git(request.cwd, "diff", "--name-only", "--diff-filter=U")).toBe("shared.txt");
			await write(path.join(request.cwd, "shared.txt"), "resolved A and integration\n");
			await git(request.cwd, "add", "shared.txt");
			await git(request.cwd, "commit", "-m", "resolve initial integration conflict");
		},
	});
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await implementationDone.promise;
	await write(path.join(root, "shared.txt"), "integration change\n");
	await git(root, "add", "shared.txt");
	await git(root, "commit", "-m", "parallel change");
	expect((await status(workflow)).ready).not.toContain("c.md");
	beginImplementation.release();
	await drain(workflow);
	expect(await fs.readFile(path.join(root, "shared.txt"), "utf8")).toBe("resolved A and integration\n");
	expect((await status(workflow)).ready).toContain("c.md");
	expect(runs.filter((run) => run.role === "integrate").map((run) => run.resumed)).toEqual([false]);
});

test("integrated tickets can be published without independent final verification", async () => {
	const retros = gate();
	const { workflow, root, events, retroIds, runs, retroWarnings } = await fixture({
		retroGate: retros.promise, failRetro: (ticket) => ticket === "b.md",
	});
	for (const name of ["a.md", "b.md", "c.md"]) await complete(workflow, name);
	const scratch = path.join(root, ".scratch", "feature");
	expect((await fs.readdir(scratch)).sort()).toEqual(["contract.md", "implementation", "spec.md"]);
	const before = await status(workflow);
	const branches = before.tickets.map((ticket) => ticket.worktree!.branch);
	const finishing = workflow.execute({ action: "finish" });
	retros.release();
	const summary = await finishing as unknown as FinishSummary;
	expect(summary.warnings).toEqual([]);
	expect(await git(root, "status", "--porcelain")).toBe("");
	for (const branch of branches) expect(await git(root, "rev-parse", "--verify", branch)).toMatch(/^[a-f0-9]{40}$/);
	expect((await git(root, "worktree", "list", "--porcelain")).match(/^worktree /gm)).toEqual(["worktree "]);
	for (const file of summary.reports)
		expect(await git(root, "ls-files", "--error-unmatch", path.relative(root, file))).toBe(path.relative(root, file).split(path.sep).join("/"));
	expect(summary.retainedBranches.slice().sort()).toEqual(branches.slice().sort());
	const unpublished = JSON.stringify(["contract.md", "implementation", "spec.md"]);
	const published = JSON.stringify(["contract.md", "execution", "implementation", "retro", "spec.md"]);
	const probes = events.filter((event) => event.startsWith("retro:"));
	expect(probes.map((event) => event.split(":")[1]).sort()).toEqual(["a.md", "b.md", "c.md"]);
	expect(probes.filter((event) => !event.endsWith(`publication=${unpublished}`))).toEqual([]);
	expect(events.filter((event) => event.startsWith("close:"))).toEqual([`close:publication=${published}`]);
	expect(events[events.length - 1]).toBe(`close:publication=${published}`);
	expect(retroIds.slice().sort()).toEqual(runs.filter((run) => run.role === "implement").map((run) => run.id).sort());
	const ledgerFile = summary.reports.find((file) => file.endsWith("workflow.json"))!;
	const ledger = JSON.parse(await fs.readFile(ledgerFile, "utf8")) as Ledger;
	expect(ledger.executions.map((record) => record.agent_id).sort()).toEqual(retroIds.slice().sort());
	expect(ledger.executions.map((record) => record.tool_call_id).sort()).toEqual(ledger.attempts.map((attempt) => attempt.id).sort());
	for (const attempt of ledger.attempts) {
		const record = ledger.executions.find((entry) => entry.tool_call_id === attempt.id)!;
		expect(record.ticket).toBe(attempt.ticket);
		expect(record.tdd_status).toBe("completed");
		expect(record.retro_status).toBe(attempt.ticket === "b.md" ? "failed" : "completed");
		expect(summary.reports).toContain(path.join(scratch, "retro", attempt.ticket, `${record.run_id}.json`));
		if (attempt.ticket === "b.md") {
			expect(record.retro_error).toBeTruthy();
			expect(record.retro_document).toBeUndefined();
		}
	}
	expect(retroWarnings.some((warning) => warning.includes("b.md"))).toBe(true);
	expect(await fs.stat(before.temporaryDir).catch(() => null)).toBeNull();
}, 30000);

async function waitFor(matches: () => boolean): Promise<void> {
	while (!matches()) await new Promise<void>((resolve) => setImmediate(resolve));
}

test("pause drains in-flight implementation, integration and delayed retro, then refuses new attempts", async () => {
	const implementing = gate(), retroDelay = gate(), integrating = gate();
	const { workflow, retroIds, retroWarnings, runs } = await fixture({
		implementationGate: implementing.promise,
		retroGate: retroDelay.promise,
		failRetro: (ticket) => ticket === "a.md",
		integrationWork: async () => { await integrating.promise; },
	});
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	const pausing = workflow.pause();
	// The gate closes synchronously, before the first await, so this call cannot admit an attempt.
	expect(workflow.pausing).toBe(true);
	expect(workflow.paused).toBe(false);
	await expect(workflow.execute({ action: "dispatch", tickets: ["b.md"] })).rejects.toThrow("正在暂停");
	await expect(workflow.execute({ action: "plan", plan: [] })).rejects.toThrow("正在暂停");
	await expect(workflow.execute({ action: "finish" })).rejects.toThrow("正在暂停");
	const collecting = workflow.execute({ action: "collect" });
	let paused = false;
	void pausing.then(() => { paused = true; });
	implementing.release();
	await waitFor(() => retroIds.length === 1 && runs.some((run) => run.role === "integrate"));
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(paused).toBe(false);
	retroDelay.release();
	integrating.release();
	const snapshot = await pausing as StatusSnapshot;
	expect(snapshot.mode).toBe("paused");
	expect(ticketSnapshot(snapshot, "a.md").status).toBe("integrated");
	expect(ticketSnapshot(snapshot, "b.md").status).toBe("ready");
	expect(ticketSnapshot(snapshot, "b.md").worktree).toBeUndefined();
	expect(snapshot.active).toEqual([]);
	expect(snapshot.integrating).toEqual([]);
	expect(runs.filter((run) => run.role === "implement")).toHaveLength(1);
	expect(["pausing", "paused"]).toContain((await collecting as StatusSnapshot).mode);
	const saved = JSON.parse(await fs.readFile(snapshot.checkpoint, "utf8")) as CheckpointSnapshot;
	expect(saved.version).toBe(1);
	expect(saved.planned).toBe(true);
	expect(saved.attempts.map((attempt) => attempt.ticket)).toEqual(["a.md"]);
	expect(saved.retro.tickets.slice().sort()).toEqual(["a.md", "b.md", "c.md"]);
	expect(saved.retro.records.map((record) => record.retro_status)).toEqual(["failed"]);
	expect(saved.retro.records[0].retro_error).toBeTruthy();
	expect(retroWarnings.some((warning) => warning.includes("a.md"))).toBe(true);
	expect(saved.reports.length).toBeGreaterThan(0);
	const delivered = saved.tickets.find((ticket) => ticket.ticket === "a.md")!;
	expect(delivered.status).toBe("integrated");
	expect(delivered.integration?.mergedHead).toBeTruthy();
	expect(saved.tickets.find((ticket) => ticket.ticket === "b.md")?.status).toBe("ready");
	await workflow.resume();
	expect(workflow.paused).toBe(false);
	expect(await fs.stat(snapshot.checkpoint).catch(() => null)).toBeNull();
});

test("pause with nothing in flight wakes a waiting collect and freezes pending tickets", async () => {
	const { workflow, runs } = await fixture();
	const pausing = workflow.pause();
	const collected = await workflow.execute({ action: "collect" }) as StatusSnapshot;
	expect(collected.mode).toBe("paused");
	expect(await pausing).toMatchObject({ mode: "paused" });
	const frozen = await collectBeforeNextTurn(workflow.execute({ action: "collect" })) as StatusSnapshot;
	expect(frozen.mode).toBe("paused");
	expect(frozen.paused).toBe(true);
	expect(frozen.ready.slice().sort()).toEqual(["a.md", "b.md"]);
	expect(runs).toEqual([]);
	await expect(workflow.execute({ action: "dispatch", tickets: ["a.md"] })).rejects.toThrow("已暂停");
	await expect(workflow.execute({ action: "finish" })).rejects.toThrow("已暂停");
	await expect(workflow.execute({ action: "plan", plan: [] })).rejects.toThrow("已暂停");
	await workflow.resume();
	expect((await status(workflow)).mode).toBe("running");
});

test("pause during a dispatch loop stops admission without checkpointing an attempt away", async () => {
	const { workflow, runs } = await fixture();
	const dispatching = workflow.execute({ action: "dispatch", tickets: ["a.md", "b.md"] });
	const pausing = workflow.pause();
	expect(workflow.pausing).toBe(true);
	expect((await dispatching as StatusSnapshot).mode).toBe("pausing");
	const paused = await pausing as StatusSnapshot;
	expect(paused.mode).toBe("paused");
	expect(paused.active).toEqual([]);
	expect(runs).toEqual([]);
	const saved = JSON.parse(await fs.readFile(paused.checkpoint, "utf8")) as CheckpointSnapshot;
	expect(saved.attempts).toEqual([]);
	expect(saved.tickets.every((ticket) => ticket.status === "ready")).toBe(true);
	// The worktree reserved by the interrupted loop is kept, so a resumed run reuses it.
	const reserved = saved.tickets.find((ticket) => ticket.ticket === "a.md")!.worktree!;
	expect(reserved.cwd).toBeTruthy();
	await workflow.resume();
	await complete(workflow, "a.md");
	expect(ticketSnapshot(await status(workflow), "a.md").worktree).toEqual(reserved);
});

test("a restored pause keeps dependency evidence, the ledger and remaining scheduling", async () => {
	const { workflow, host, root } = await fixture({ failRetro: (ticket) => ticket === "c.md" });
	await complete(workflow, "a.md");
	const before = await status(workflow);
	expect(before.ready.slice().sort()).toEqual(["b.md", "c.md"]);
	const paused = await workflow.pause() as StatusSnapshot;
	expect(paused.mode).toBe("paused");
	expect(HyperWorkflow.checkpointPath("parent")).toBe(paused.checkpoint);
	const restored = await HyperWorkflow.restore(paused.checkpoint, host, "parent", "Main", null);
	workflows.push(restored);
	expect(restored.paused).toBe(true);
	expect(restored.finished).toBe(false);
	expect(restored.git.root).toBe(root);
	expect(restored.git.branch).toBe(workflow.git.branch);
	const reopened = await status(restored);
	expect(reopened.mode).toBe("paused");
	expect(reopened.planned).toBe(true);
	expect(reopened.ready.slice().sort()).toEqual(["b.md", "c.md"]);
	expect(ticketSnapshot(reopened, "a.md")).toMatchObject({
		status: "integrated",
		mergedHead: ticketSnapshot(before, "a.md").mergedHead,
		worktree: ticketSnapshot(before, "a.md").worktree,
	});
	await expect(restored.execute({ action: "plan", plan: [] })).rejects.toThrow("已暂停");
	await expect(restored.execute({ action: "dispatch", tickets: ["b.md"] })).rejects.toThrow("已暂停");
	await expect(restored.execute({ action: "finish" })).rejects.toThrow("已暂停");
	expect(await fs.stat(restored.temporaryDir).then((stat) => stat.isDirectory())).toBe(true);
	await restored.resume();
	expect(restored.paused).toBe(false);
	expect(await fs.stat(paused.checkpoint).catch(() => null)).toBeNull();
	// The next collect is served from the restored state without waiting for work.
	const immediate = await collectBeforeNextTurn(restored.execute({ action: "collect" })) as StatusSnapshot;
	expect(immediate.mode).toBe("running");
	expect(immediate.ready.slice().sort()).toEqual(["b.md", "c.md"]);
	// Only the restored dependency evidence releases the blocked ticket.
	await complete(restored, "c.md");
	await complete(restored, "b.md");
	const summary = await restored.execute({ action: "finish" }) as unknown as FinishSummary;
	expect(summary.warnings).toEqual([]);
	const ledgerFile = summary.reports.find((file) => file.endsWith("workflow.json"))!;
	const ledger = JSON.parse(await fs.readFile(ledgerFile, "utf8")) as Ledger;
	expect(ledger.attempts.map((attempt) => attempt.ticket)).toEqual(["a.md", "c.md", "b.md"]);
	expect(ledger.executions).toHaveLength(3);
	for (const attempt of ledger.attempts) {
		const record = ledger.executions.find((entry) => entry.tool_call_id === attempt.id)!;
		const failedRetro = attempt.ticket === "c.md";
		expect(record.tdd_status).toBe("completed");
		expect(record.retro_status).toBe(failedRetro ? "failed" : "completed");
		expect(Boolean(record.retro_error)).toBe(failedRetro);
		expect(summary.reports).toContain(
			path.join(root, ".scratch", "feature", "retro", attempt.ticket, `${record.run_id}.json`),
		);
	}
	const first = ledger.executions.find((entry) => entry.ticket === "a.md")!;
	const document = path.join(root, ".scratch", "feature", "retro", "a.md", `${first.run_id}.md`);
	expect(summary.reports).toContain(document);
	expect(await fs.readFile(document, "utf8")).toContain("Keep the successful behavioral verification");
	expect(await fs.stat(paused.checkpoint).catch(() => null)).toBeNull();
}, 30000);

test("a failed checkpoint write never claims a pause and stays retryable", async () => {
	const { workflow } = await fixture();
	const file = HyperWorkflow.checkpointPath("parent");
	await fs.mkdir(file);
	try {
		await expect(workflow.pause()).rejects.toThrow();
		expect(workflow.paused).toBe(false);
		expect(workflow.pausing).toBe(false);
		const state = await status(workflow);
		expect(state.mode).toBe("running");
		expect(state.checkpoint).toBe(file);
		await complete(workflow, "a.md");
	} finally {
		await fs.rm(file, { recursive: true, force: true });
	}
	const paused = await workflow.pause() as StatusSnapshot;
	expect(paused.mode).toBe("paused");
	const saved = JSON.parse(await fs.readFile(file, "utf8")) as CheckpointSnapshot;
	expect(saved.attempts.map((attempt) => attempt.ticket)).toEqual(["a.md"]);
});
