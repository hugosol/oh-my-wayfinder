import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { HyperGit } from "./git";
import type { HyperHost } from "./subagent-host";
import { cleanupFixtures, git, initRepo, ticketFile, write } from "./test-support";
import { HyperWorkflow } from "./workflow";

const workflows: HyperWorkflow[] = [];
afterEach(async () => {
	for (const workflow of workflows.splice(0)) {
		await drain(workflow);
		await workflow.retro.finish();
		if (!workflow.finished && !workflow.paused) await workflow.pause();
		for (const repository of workflow.repositories.values()) {
			for (const tree of repository.worktrees.values()) {
				if (await fs.stat(tree.cwd).catch(() => null)) await git(repository.root, "worktree", "remove", "--force", tree.cwd);
			}
		}
		await fs.rm(workflow.temporaryDir, { recursive: true, force: true });
	}
	await fs.rm(HyperWorkflow.checkpointPath("multi-parent"), { force: true });
	await cleanupFixtures();
});

interface MultiStatus {
	active: string[];
	integrating: string[];
	ready: string[];
	tickets: { ticket: string; status: string; worktrees?: Record<string, { cwd: string; branch: string }>; merged?: boolean; mergedHeads?: Record<string, string> }[];
}
async function multiFixture(options: {
	implement?: (ticket: string, trees: Record<string, { cwd: string; branch: string }>) => Promise<void>;
	integrate?: (request: { cwd: string; task: string }) => Promise<void>;
	resume?: (request: { cwd: string; task: string; id: string }) => Promise<void>;
	independent?: boolean;
	cap?: number;
	unchanged?: string[];
} = {}) {
	const front = await initRepo({ slug: "multi", branch: "feature/front", prefix: "hyper-multi-", spec: "S", contract: "C" });
	const back = await initRepo({ slug: "multi", branch: "feature/back", prefix: "hyper-multi-", spec: "S", contract: "C" });
	const coordinator = await HyperGit.inspect(front.root, "multi");
	for (const name of ["a.md", "b.md"]) await ticketFile(front, name);
	await write(path.join(front.root, ".scratch", "multi", "repositories.json"), JSON.stringify({ repositories: [{ id: "frontend", path: "." }, { id: "backend", path: back.root }] }));
	let workflow!: HyperWorkflow;
	const runs: { role: string; id: string; task: string; cwd: string }[] = [];
	const host: HyperHost = {
		async run(request) {
			const id = randomUUID();
			runs.push({ ...request, id });
			if (request.role === "implement") {
				const state = workflow.status() as MultiStatus;
				const ticket = state.tickets.find((entry) => request.name.startsWith(`${entry.ticket}-`))!;
				await options.implement?.(ticket.ticket, ticket.worktrees!);
				for (const [repository, tree] of Object.entries(ticket.worktrees ?? { frontend: { cwd: request.cwd } })) {
					if (options.unchanged?.includes(repository)) continue;
					await write(path.join(tree.cwd, `${ticket.ticket}-${repository}.txt`), "delivered\n");
					await git(tree.cwd, "add", ".");
					await git(tree.cwd, "commit", "-m", `deliver ${ticket.ticket} ${repository}`);
				}
			} else await options.integrate?.(request);
			return { index: 0, id, agent: request.role, agentSource: "project", task: request.task, exitCode: 0, output: "Verified", stderr: "", truncated: false, durationMs: 1, tokens: 1, requests: 1 } as SingleResult;
		},
		async resume(request) { if (!request.name.startsWith("cleanup-")) { runs.push(request); await options.resume?.(request); } return { index: 0, id: request.id, agent: request.role, agentSource: "project", task: request.task, exitCode: 0, output: "Verified", stderr: "", truncated: false, durationMs: 1, tokens: 1, requests: 1 } as SingleResult; },
		async close() {},
		retro: { identify: async (value) => ({ agent: value.agent, agent_id: value.id, session_id: value.id, session_file: null, execution_cwd: front.root }), analyze: async (_record, value) => value, warn() {} },
	};
	workflow = await HyperWorkflow.create("multi", coordinator, host, options.cap ?? 2, "multi-parent", "Main", null);
	workflows.push(workflow);
	await workflow.execute({ action: "plan", plan: [{ ticket: "a.md", blockedBy: [], repositories: ["frontend", "backend"] }, { ticket: "b.md", blockedBy: options.independent ? [] : ["a.md"], repositories: ["backend"] }] });
	return { workflow, host, front, back, runs };
}
async function drain(workflow: HyperWorkflow) {
	while (true) {
		const state = workflow.status() as MultiStatus;
		if (!state.active.length && !state.integrating.length) return;
		await workflow.execute({ action: "collect" });
	}
}

test("dependencies release only after every repository first merge and inherit backend delivery", async () => {
	const { workflow, back } = await multiFixture();
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	const state = workflow.status() as MultiStatus;
	expect(state.tickets[0].merged).toBe(true);
	expect(Object.keys(state.tickets[0].mergedHeads ?? {}).sort()).toEqual(["backend", "frontend"]);
	expect(state.ready).toEqual(["b.md"]);
	expect(await fs.readFile(path.join(back.root, "a.md-backend.txt"), "utf8")).toBe("delivered\n");
	await workflow.execute({ action: "dispatch", tickets: ["b.md"] });
	await drain(workflow);
	expect((workflow.status() as MultiStatus).tickets[1].status).toBe("integrated");
});

function deferred() {
	return Promise.withResolvers<void>();
}

test("one shared implementation cap spans repositories and independent tickets overlap", async () => {
	const release = deferred();
	const { workflow } = await multiFixture({ independent: true, implement: async () => release.promise });
	try {
		await workflow.execute({ action: "dispatch", tickets: ["a.md", "b.md"] });
		expect((workflow.status() as MultiStatus).active.sort()).toEqual(["a.md", "b.md"]);
		expect(Object.keys((workflow.status() as MultiStatus).tickets[0].worktrees!).sort()).toEqual(["backend", "frontend"]);
	} finally { release.resolve(); await drain(workflow); }
});

test("one shared ticket cap rejects a second implementation in another repository", async () => {
	const release = deferred();
	const { workflow } = await multiFixture({ independent: true, cap: 1, implement: async () => release.promise });
	try {
		await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
		await expect(workflow.execute({ action: "dispatch", tickets: ["b.md"] })).rejects.toThrow("并发上限");
		expect((workflow.status() as MultiStatus).tickets[1].worktrees).toBeUndefined();
	} finally { release.resolve(); await drain(workflow); }
});

test("an unchanged repository counts toward aggregate merge without an empty commit", async () => {
	const { workflow, back } = await multiFixture({ unchanged: ["backend"] });
	const baseline = await git(back.root, "rev-parse", "HEAD");
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	expect((workflow.status() as MultiStatus).tickets[0].merged).toBe(true);
	expect((workflow.status() as MultiStatus).ready).toEqual(["b.md"]);
	expect(await git(back.root, "rev-parse", "HEAD")).toBe(baseline);
});

test("partial worktree setup failure retains earlier repository identity for retry", async () => {
	const { workflow, back, runs } = await multiFixture();
	await git(back.root, "switch", "-c", "feature/interrupted");
	await expect(workflow.execute({ action: "dispatch", tickets: ["a.md"] })).rejects.toThrow("集成分支已切换");
	const first = (workflow.status() as MultiStatus).tickets[0].worktrees!.frontend;
	expect(runs).toHaveLength(0);
	expect(Object.keys((workflow.status() as MultiStatus).tickets[0].worktrees!)).toEqual(["frontend"]);
	await git(back.root, "switch", "feature/back");
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	expect((workflow.status() as MultiStatus).tickets[0].worktrees!.frontend).toEqual(first);
	expect((workflow.status() as MultiStatus).tickets[0].status).toBe("integrated");
});

test("failed implementation retries retain both trees and progress counts completed tickets", async () => {
	let fail = true;
	const { workflow } = await multiFixture({ implement: async () => { if (fail) throw new Error("external implementation failed"); } });
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	const trees = (workflow.status() as MultiStatus).tickets[0].worktrees;
	expect(workflow.progress).toEqual({ total: 2, executed: 1, integrated: 0, mode: "running" });
	fail = false;
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	expect((workflow.status() as MultiStatus).tickets[0].worktrees).toEqual(trees);
	expect(workflow.progress).toEqual({ total: 2, executed: 1, integrated: 1, mode: "running" });
});

test("partial first merges block dependencies while one integration agent resolves original backend tree", async () => {
	const entered = deferred(), release = deferred();
	let backendRoot = "";
	let workflow!: HyperWorkflow;
	const fixture = await multiFixture({
		implement: async (_ticket, trees) => {
			await write(path.join(trees.backend.cwd, "collision.txt"), "ticket\n");
			await write(path.join(backendRoot, "collision.txt"), "upstream\n");
			await git(backendRoot, "add", ".");
			await git(backendRoot, "commit", "-m", "upstream collision");
		},
		integrate: async () => {
			entered.resolve();
			await release.promise;
			const tree = (workflow.status() as MultiStatus).tickets[0].worktrees!.backend;
			await write(path.join(tree.cwd, "collision.txt"), "resolved\n");
			await git(tree.cwd, "add", ".");
			await git(tree.cwd, "commit", "-m", "resolve backend conflict");
		},
	});
	workflow = fixture.workflow; backendRoot = fixture.back.root;
	try {
		await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
		await entered.promise;
		const state = workflow.status() as MultiStatus;
		expect(state.tickets[0].merged).toBe(false);
		expect(Object.keys(state.tickets[0].mergedHeads!)).toEqual(["frontend"]);
		expect(state.ready).toEqual([]);
		await expect(workflow.execute({ action: "dispatch", tickets: ["b.md"] })).rejects.toThrow("尚不可执行");
	} finally { release.resolve(); await drain(workflow); }
	expect((workflow.status() as MultiStatus).ready).toEqual(["b.md"]);
	expect(await fs.readFile(path.join(backendRoot, "collision.txt"), "utf8")).toBe("resolved\n");
	expect(fixture.runs.filter((run) => run.role === "integrate")).toHaveLength(1);
});

test("later backend conflict resumes the same integration session owning both original worktrees", async () => {
	let workflow!: HyperWorkflow;
	let backendRoot = "";
	let originalTrees!: Record<string, { cwd: string; branch: string }>;
	const fixture = await multiFixture({
		integrate: async (request) => {
			originalTrees = (workflow.status() as MultiStatus).tickets[0].worktrees!;
			for (const tree of Object.values(originalTrees)) expect(request.task).toContain(JSON.stringify(tree.cwd));
			await write(path.join(originalTrees.backend.cwd, "late.txt"), "ticket correction\n");
			await git(originalTrees.backend.cwd, "add", ".");
			await git(originalTrees.backend.cwd, "commit", "-m", "validation correction");
			await write(path.join(backendRoot, "late.txt"), "concurrent delivery\n");
			await git(backendRoot, "add", ".");
			await git(backendRoot, "commit", "-m", "concurrent delivery");
		},
		resume: async (request) => {
			for (const tree of Object.values(originalTrees)) expect(request.task).toContain(JSON.stringify(tree.cwd));
			await write(path.join(originalTrees.backend.cwd, "late.txt"), "resolved together\n");
			await git(originalTrees.backend.cwd, "add", ".");
			await git(originalTrees.backend.cwd, "commit", "-m", "resolve late conflict");
		},
	});
	workflow = fixture.workflow; backendRoot = fixture.back.root;
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	const integrations = fixture.runs.filter((run) => run.role === "integrate");
	expect(integrations).toHaveLength(2);
	expect(integrations[1].id).toBe(integrations[0].id);
	expect(integrations[1].cwd).toBe(integrations[0].cwd);
	expect((workflow.status() as MultiStatus).tickets[0].worktrees).toEqual(originalTrees);
	expect((workflow.status() as MultiStatus).tickets[0].status).toBe("integrated");
	expect(await fs.readFile(path.join(backendRoot, "late.txt"), "utf8")).toBe("resolved together\n");
});

test("pause restore preserves all repository baselines and publishes reports and cleanup centrally", async () => {
	const { workflow, host, front, back } = await multiFixture();
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await drain(workflow);
	const before = workflow.status() as MultiStatus;
	const paused = await workflow.pause() as { checkpoint: string };
	for (const tree of Object.values(before.tickets[0].worktrees!)) expect(await fs.stat(tree.cwd).catch(() => null)).toBeNull();
	const checkpoint = JSON.parse(await fs.readFile(paused.checkpoint, "utf8"));
	expect(checkpoint.version).toBe(2);
	expect(Object.keys(checkpoint.repositories).sort()).toEqual(["backend", "frontend"]);
	for (const repository of Object.values(checkpoint.repositories) as { baseline: string }[]) expect(repository.baseline).toMatch(/^[a-f0-9]{40}$/);
	const restored = await HyperWorkflow.restore(paused.checkpoint, host, "multi-parent", "Main", null);
	workflows.push(restored);
	expect((restored.status() as MultiStatus).tickets[0].mergedHeads).toEqual(before.tickets[0].mergedHeads);
	await restored.resume();
	// Dispatch host reads the original object's public state; reuse the same
	// original instance for this completed ticket and finish the remaining work
	// through a host that records its own request paths.
	const originalRun = host.run;
	host.run = async (request) => {
		if (request.role !== "implement") return originalRun(request);
		await write(path.join(request.cwd, "b.md-backend.txt"), "delivered\n");
		await git(request.cwd, "add", "."); await git(request.cwd, "commit", "-m", "deliver restored backend");
		return { index: 0, id: randomUUID(), agent: request.role, agentSource: "project", task: request.task, exitCode: 0, output: "Verified", stderr: "", truncated: false, durationMs: 1, tokens: 1, requests: 1 } as SingleResult;
	};
	await restored.execute({ action: "dispatch", tickets: ["b.md"] });
	await drain(restored);
	const finish = await restored.execute({ action: "finish" }) as { reports: string[]; cleanupReport: string; retainedBranches: unknown[]; retainedWorktrees: unknown[] };
	expect(finish.retainedBranches).toEqual([]); expect(finish.retainedWorktrees).toEqual([]);
	for (const report of finish.reports) expect(report.startsWith(front.root)).toBe(true);
	const reports = await Promise.all(finish.reports.filter((file) => /implement-/.test(file) && file.endsWith(".md")).map((file) => fs.readFile(file, "utf8")));
	expect(reports.some((body) => body.includes('"frontend"') && body.includes('"backend"') && body.includes('"heads"'))).toBe(true);
	const cleanup = JSON.parse(await fs.readFile(finish.cleanupReport, "utf8"));
	expect(new Set(cleanup.attempts.flatMap((attempt: { resources: { repository: string }[] }) => attempt.resources.map((resource) => resource.repository)))).toEqual(new Set(["frontend", "backend"]));
	expect(await git(back.root, "status", "--porcelain")).toBe("");
	expect(await git(front.root, "status", "--porcelain")).toBe("");
});

// Public seam: create/execute. A missing repository assignment must not silently
// dispatch a cross-repository ticket into the coordinator alone.
test("multi-repository planning requires explicit ticket repositories", async () => {
	const coordinator = await initRepo({ slug: "multi", branch: "feature/front", prefix: "hyper-multi-", spec: "S", contract: "C" });
	const target = await initRepo({ slug: "multi", branch: "feature/back", prefix: "hyper-multi-", spec: "S", contract: "C" });
	const coordinatorGit = await HyperGit.inspect(coordinator.root, "multi");
	await ticketFile(coordinator, "a.md");
	await write(path.join(coordinator.root, ".scratch", "multi", "repositories.json"), JSON.stringify({ repositories: [
		{ id: "frontend", path: "." }, { id: "backend", path: target.root },
	] }));
	const host = { retro: { identify: async () => ({}), analyze: async (_: unknown, value: unknown) => value, warn() {} } } as unknown as HyperHost;
	const workflow = await HyperWorkflow.create("multi", coordinatorGit, host, 2, "multi-parent", "Main", null);
	workflows.push(workflow);
	await expect(workflow.execute({ action: "plan", plan: [{ ticket: "a.md", blockedBy: [] }] })).rejects.toThrow(/repositor/i);
	expect(await git(target.root, "status", "--porcelain")).toBe("");
});
