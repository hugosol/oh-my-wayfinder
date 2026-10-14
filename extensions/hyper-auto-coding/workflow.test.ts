import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { HyperGit } from "./git";
import type { HyperHost, HyperRole, HyperRun } from "./subagent-host";
import { cleanupFixtures, git, initRepo, ticketFile, write } from "./test-support";
import { HyperWorkflow } from "./workflow";

/** Public `status` snapshot fields used for behavioral assertions. */
interface TicketSnapshot {
	ticket: string;
	status: "ready" | "running" | "reported" | "accepted" | "integrated";
	worktree?: { branch: string; cwd: string };
	report?: string;
}
interface StatusSnapshot {
	branch: string;
	temporaryDir: string;
	active: string[];
	ready: string[];
	tickets: TicketSnapshot[];
}
interface FinishSummary {
	reports: string[];
	warnings: string[];
	retainedBranches: string[];
}
/** Published workflow ledger: enrolled executions and their retro outcomes. */
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
		while ((await status(workflow)).active.length) await workflow.execute({ action: "collect" });
		await workflow.retro.finish();
		for (const tree of workflow.git.worktrees.values()) {
			if (await fs.stat(tree.cwd).catch(() => null))
				await git(workflow.git.root, "worktree", "remove", "--force", tree.cwd);
		}
		await fs.rm(workflow.temporaryDir, { recursive: true, force: true });
	}
	await cleanupFixtures();
});

function result(request: HyperRun, overrides: Partial<SingleResult> = {}): SingleResult {
	return {
		index: 0,
		id: randomUUID(),
		agent: request.role,
		agentSource: "project",
		task: request.task,
		exitCode: 0,
		output: "Required behavior verified; no unresolved acceptance items.",
		stderr: "",
		truncated: false,
		durationMs: 1,
		tokens: 1,
		requests: 1,
		...overrides,
	};
}

async function status(workflow: HyperWorkflow): Promise<StatusSnapshot> {
	return (await workflow.execute({ action: "status" })) as unknown as StatusSnapshot;
}
function ticketSnapshot(state: StatusSnapshot, ticket: string): TicketSnapshot {
	const found = state.tickets.find((entry) => entry.ticket === ticket);
	if (!found) throw new Error(`status snapshot has no ticket ${ticket}`);
	return found;
}
function worktreeOf(state: StatusSnapshot, ticket: string): { branch: string; cwd: string } {
	const worktree = ticketSnapshot(state, ticket).worktree;
	if (!worktree) throw new Error(`status snapshot has no worktree for ${ticket}`);
	return worktree;
}

interface Scene {
	root: string;
	workflow: HyperWorkflow;
	/** Execution ids observed at the controlled retro boundary, in enrolment order. */
	retroIds: string[];
	/** Host results by dispatched run, in call order. */
	runs: { role: HyperRole; id: string; name: string }[];
	/** Retro warnings raised at the controlled boundary. */
	retroWarnings: string[];
	/** Boundary probes recorded while the workflow ran. */
	events: string[];
}

async function fixture(
	options: {
		cap?: number;
		implementationGate?: Promise<void>;
		retroGate?: Promise<void>;
		failIntegration?: boolean;
		throwImplementation?: () => boolean;
		mutateReadonly?: () => "review" | "verify" | undefined;
		failRetro?: (ticket: string) => boolean;
	} = {},
): Promise<Scene> {
	const repo = await initRepo({
		slug: "feature",
		branch: "feature/delivery",
		prefix: "hyper-workflow-test-",
		spec: "Deliver independent A and B, then dependent C.",
		contract: "P1: A; P2: B; P3: C sees A.",
	});
	const { root } = repo;
	const backend = await HyperGit.inspect(root, repo.slug);
	for (const name of ["a.md", "b.md", "c.md"])
		await ticketFile(repo, name, `# ${name}\nAcceptance: deliver ${name[0]}.`);
	const events: string[] = [];
	const retroIds: string[] = [];
	const runs: { role: HyperRole; id: string; name: string }[] = [];
	const retroWarnings: string[] = [];
	const published = async (): Promise<string[]> =>
		(await fs.readdir(path.join(root, ".scratch", repo.slug))).sort();
	let failIntegration = options.failIntegration ?? false;
	const host: HyperHost = {
		async run(request) {
			const respond = (overrides: Partial<SingleResult> = {}): SingleResult => {
				const execution = result(request, overrides);
				runs.push({ role: request.role, id: execution.id, name: request.name });
				return execution;
			};
			if (request.role === "implement") {
				await options.implementationGate;
				if (options.throwImplementation?.()) throw new Error("implementation transport failed");
				const name = request.name.split(":")[0][0];
				await write(path.join(request.cwd, `${name}.txt`), `delivered ${name}\n`);
				await git(request.cwd, "add", `${name}.txt`);
				await git(request.cwd, "commit", "--allow-empty", "-m", `deliver ${name}`);
			} else if (request.role === "integrate") {
				if (request.cwd !== root) await git(request.cwd, "merge", "--no-edit", backend.branch);
				else if (failIntegration) {
					failIntegration = false;
					return respond({ exitCode: 1, output: "Integration regression failed." });
				}
			} else if (request.role === "fix") {
				await write(path.join(root, "integration-fix.txt"), "regression corrected\n");
				await git(root, "add", "integration-fix.txt");
				await git(root, "commit", "-m", "fix integration regression");
			}
			if (options.mutateReadonly?.() === request.role) {
				await write(path.join(root, "readonly-change.txt"), request.role);
				await git(root, "add", "readonly-change.txt");
				await git(root, "commit", "-m", "illegal read-only change");
			}
			return respond();
		},
		async close() {
			// Final boundary: by the time finish releases the host, publication must be complete.
			events.push(`close:publication=${JSON.stringify(await published())}`);
		},
		retro: {
			async identify(execution) {
				return {
					agent: execution.agent,
					agent_id: execution.id,
					session_id: `session-${execution.id}`,
					session_file: null,
					execution_cwd: root,
				};
			},
			async analyze(record, execution) {
				retroIds.push(execution.id);
				await options.retroGate;
				// External artifact boundary: while this retro is not yet terminal, the workflow
				// must not have published any report or record into the integration checkout.
				events.push(`retro:${record.ticket}:publication=${JSON.stringify(await published())}`);
				if (options.failRetro?.(record.ticket))
					return result(execution, { exitCode: 1, output: "", error: "retro turn returned no transcript" });
				return {
					...execution,
					output: "Keep the successful behavioral verification; no instruction changes applied.",
				};
			},
			warn(message) {
				retroWarnings.push(message);
			},
		},
	};
	const workflow = await HyperWorkflow.create("feature", backend, host, options.cap ?? 2, "parent", "Main", null);
	workflows.push(workflow);
	await workflow.execute({
		action: "plan",
		plan: [
			{ ticket: "a.md", blockedBy: [] },
			{ ticket: "b.md", blockedBy: [] },
			{ ticket: "c.md", blockedBy: ["a.md"] },
		],
	});
	return { root, workflow, retroIds, runs, retroWarnings, events };
}

async function complete(workflow: HyperWorkflow, ticket: string) {
	await workflow.execute({ action: "dispatch", tickets: [ticket] });
	await workflow.execute({ action: "collect" });
	await workflow.execute({
		action: "accept",
		ticket,
		accepted: true,
		reason: "Read report: assigned criterion verified by actual command, no unresolved work.",
	});
	await workflow.execute({ action: "integrate", ticket });
	await workflow.execute({
		action: "confirm_integration",
		ticket,
		accepted: true,
		reason: "Read integration report: related regression passed on current commit.",
	});
}

async function finalVerification(workflow: HyperWorkflow) {
	await workflow.execute({ action: "review" });
	await workflow.execute({
		action: "assess_review",
		accepted: true,
		reason: "Both independent axes have no blocking findings.",
	});
	await workflow.execute({ action: "verify" });
	await workflow.execute({
		action: "accept_verification",
		accepted: true,
		reason: "Read final report: all contract promises have verified evidence.",
	});
}

test("parallel slots are bounded and dependency C waits for A's merge AND main-agent integration acceptance", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	releases.push(release);
	const { workflow, root } = await fixture({ implementationGate: gate });
	const dispatched = (await workflow.execute({
		action: "dispatch",
		tickets: ["a.md", "b.md"],
	})) as unknown as StatusSnapshot;
	expect(dispatched.active).toEqual(["a.md", "b.md"]);
	expect(ticketSnapshot(dispatched, "c.md").status).toBe("ready");
	await expect(workflow.execute({ action: "dispatch", tickets: ["c.md"] })).rejects.toThrow("并发上限");
	release();
	while (ticketSnapshot(await status(workflow), "a.md").status === "running")
		await workflow.execute({ action: "collect" });
	await workflow.execute({
		action: "accept",
		ticket: "a.md",
		accepted: true,
		reason: "A's acceptance has actual verification evidence.",
	});
	await expect(workflow.execute({ action: "dispatch", tickets: ["c.md"] })).rejects.toThrow("尚不可执行");
	await workflow.execute({ action: "integrate", ticket: "a.md" });
	expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("delivered a\n");
	await expect(workflow.execute({ action: "dispatch", tickets: ["c.md"] })).rejects.toThrow("集成验证未确认");
	await workflow.execute({
		action: "confirm_integration",
		ticket: "a.md",
		accepted: true,
		reason: "Integrated A behavior and relevant regression passed.",
	});
	const dispatchedC = (await workflow.execute({
		action: "dispatch",
		tickets: ["c.md"],
	})) as unknown as StatusSnapshot;
	expect(await git(worktreeOf(dispatchedC, "c.md").cwd, "show", "HEAD:a.txt")).toBe("delivered a");
	await workflow.execute({ action: "collect" });
});

test("fresh failed continuation reuses the worktree but cannot be accepted with the previous successful invocation report", async () => {
	let fail = false;
	const { workflow } = await fixture({ throwImplementation: () => fail });
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await workflow.execute({ action: "collect" });
	const original = worktreeOf(await status(workflow), "a.md");
	await workflow.execute({
		action: "accept",
		ticket: "a.md",
		accepted: false,
		reason: "One qualitative acceptance item remains unresolved despite normal exit.",
	});
	fail = true;
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await workflow.execute({ action: "collect" });
	expect(worktreeOf(await status(workflow), "a.md")).toEqual(original);
	expect(await fs.readFile(path.join(original.cwd, "a.txt"), "utf8")).toBe("delivered a\n");
	await expect(
		workflow.execute({ action: "accept", ticket: "a.md", accepted: true, reason: "Attempt to reuse previous report." }),
	).rejects.toThrow("本次执行失败");
	await workflow.execute({
		action: "accept",
		ticket: "a.md",
		accepted: false,
		reason: "New execution failed; retain existing work for another fresh continuation.",
	});
	fail = false;
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await workflow.execute({ action: "collect" });
	await workflow.execute({
		action: "accept",
		ticket: "a.md",
		accepted: true,
		reason: "Fresh implementation report now resolves the remaining item.",
	});
});

test("failed post-merge verification pauses new work until independent repair and acceptance; helper agents never retro", async () => {
	const { workflow, retroIds, runs, retroWarnings } = await fixture({ failIntegration: true });
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await workflow.execute({ action: "collect" });
	await workflow.execute({
		action: "accept",
		ticket: "a.md",
		accepted: true,
		reason: "A ticket passed its own verification.",
	});
	await workflow.execute({ action: "integrate", ticket: "a.md" });
	await expect(
		workflow.execute({
			action: "confirm_integration",
			ticket: "a.md",
			accepted: true,
			reason: "Cannot trust failed integration.",
		}),
	).rejects.toThrow("执行失败");
	await expect(workflow.execute({ action: "dispatch", tickets: ["b.md"] })).rejects.toThrow("集成验证未确认");
	await workflow.execute({ action: "repair_integration" });
	await workflow.execute({
		action: "confirm_integration",
		ticket: "a.md",
		accepted: true,
		reason: "Repair report demonstrates corrected regression.",
	});
	// Scene barrier: drain the asynchronous retros before reading the boundary capture.
	await workflow.retro.finish();
	expect([...new Set(runs.map((run) => run.role))].sort()).toEqual(["fix", "implement", "integrate"]);
	expect(retroIds).toEqual(runs.filter((run) => run.role === "implement").map((run) => run.id));
	expect(retroWarnings).toEqual([]);
	// This fixture ends after checking repair; no further dispatch after retro.finish.
});

test("read-only reviewers and verifiers cannot publish an acceptable report after changing the reviewed commit", async () => {
	let mutation: "review" | "verify" | undefined = "review";
	const { workflow } = await fixture({ mutateReadonly: () => mutation });
	await complete(workflow, "a.md");
	await complete(workflow, "b.md");
	await complete(workflow, "c.md");
	await expect(workflow.execute({ action: "review" })).rejects.toThrow("只读评审期间");
	await expect(
		workflow.execute({
			action: "assess_review",
			accepted: true,
			reason: "Cannot accept a report whose author changed its target.",
		}),
	).rejects.toThrow("先完成独立 code-review");
	mutation = undefined;
	await workflow.execute({ action: "review" });
	await workflow.execute({
		action: "assess_review",
		accepted: true,
		reason: "Fresh read-only review now applies to the current commit.",
	});
	mutation = "verify";
	await expect(workflow.execute({ action: "verify" })).rejects.toThrow("只读验证期间");
	await expect(
		workflow.execute({
			action: "accept_verification",
			accepted: true,
			reason: "Cannot accept validation that changed its own target.",
		}),
	).rejects.toThrow("没有最终验证报告");
}, 30000);

test("final publication waits for every retro terminal outcome, commits all records with usable paths, cleans trees and retains branches; stale validation cannot finish", async () => {
	let release!: () => void;
	const retroGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	releases.push(release);
	const { workflow, root, events, retroIds, runs, retroWarnings } = await fixture({
		retroGate,
		failRetro: (ticket) => ticket === "b.md",
	});
	await complete(workflow, "a.md");
	await complete(workflow, "b.md");
	await complete(workflow, "c.md");
	await workflow.execute({ action: "review" });
	await workflow.execute({
		action: "assess_review",
		accepted: false,
		reason: "Spec axis identifies integration behavior needing correction.",
	});
	await workflow.execute({ action: "fix" });
	await expect(workflow.execute({ action: "verify" })).rejects.toThrow("评审修复及独立复核");
	await finalVerification(workflow);
	await git(root, "commit", "--allow-empty", "-m", "change after verification");
	await expect(workflow.execute({ action: "finish" })).rejects.toThrow("报告已过期");
	await finalVerification(workflow);
	const scratch = path.join(root, ".scratch", "feature");
	expect((await fs.readdir(scratch)).sort()).toEqual(["contract.md", "implementation", "spec.md"]);
	const before = await status(workflow);
	expect(before.tickets.map((ticket) => ticket.status)).toEqual(["integrated", "integrated", "integrated"]);
	const branches = before.tickets.map((ticket) => worktreeOf(before, ticket.ticket).branch);
	const finishing = workflow.execute({ action: "finish" });
	release();
	const summary = (await finishing) as unknown as FinishSummary;
	expect(summary.warnings).toEqual([]);
	expect(await git(root, "status", "--porcelain")).toBe("");
	for (const branch of branches) expect(await git(root, "rev-parse", "--verify", branch)).toMatch(/^[a-f0-9]{40}$/);
	expect((await git(root, "worktree", "list", "--porcelain")).match(/^worktree /gm)).toEqual(["worktree "]);
	for (const file of summary.reports)
		expect(await git(root, "ls-files", "--error-unmatch", path.relative(root, file))).toBe(
			path.relative(root, file).split(path.sep).join("/"),
		);
	expect(summary.retainedBranches.slice().sort()).toEqual(branches.slice().sort());

	// Deterministic boundary signals: the host's retro boundary observes the integration
	// checkout before any publication, the close boundary observes it published, and
	// nothing is recorded after close — so publication is bracketed by the retro terminal
	// outcomes instead of being sampled at an arbitrary scheduling point.
	const unpublishedListing = JSON.stringify(["contract.md", "implementation", "spec.md"]);
	const publishedListing = JSON.stringify(["contract.md", "execution", "implementation", "retro", "spec.md"]);
	const retroProbes = events.filter((event) => event.startsWith("retro:"));
	expect(retroProbes.map((event) => event.split(":")[1]).sort()).toEqual(["a.md", "b.md", "c.md"]);
	expect(retroProbes.filter((event) => !event.endsWith(`publication=${unpublishedListing}`))).toEqual([]);
	expect(events.filter((event) => event.startsWith("close:"))).toEqual([
		`close:publication=${publishedListing}`,
	]);
	const closeIndex = events.findIndex((event) => event.startsWith("close:"));
	expect(closeIndex).toBe(events.length - 1);
	expect(events.slice(0, closeIndex).every((event) => event.startsWith("retro:"))).toBe(true);
	expect(retroIds).toEqual(runs.filter((run) => run.role === "implement").map((run) => run.id));
	const ledgerFile = summary.reports.find((file) => file.endsWith("workflow.json"))!;
	const ledger = JSON.parse(await fs.readFile(ledgerFile, "utf8")) as unknown as Ledger;
	expect(ledger.executions.map((record) => record.agent_id).sort()).toEqual(retroIds.slice().sort());
	expect(ledger.executions.map((record) => record.tool_call_id).sort()).toEqual(
		ledger.attempts.map((attempt) => attempt.id).sort(),
	);
	for (const attempt of ledger.attempts) {
		const record = ledger.executions.find((entry) => entry.tool_call_id === attempt.id)!;
		expect(record.ticket).toBe(attempt.ticket);
		expect(record.tdd_status).toBe("completed");
		expect(record.retro_status).toBe(attempt.ticket === "b.md" ? "failed" : "completed");
		const publishedRecord = path.join(scratch, "retro", attempt.ticket, `${record.run_id}.json`);
		expect(summary.reports).toContain(publishedRecord);
		if (attempt.ticket === "b.md") {
			expect(record.retro_error).toBeTruthy();
			expect(record.retro_document).toBeUndefined();
		} else {
			expect(await fs.readFile(record.retro_document!, "utf8")).toContain(
				"Keep the successful behavioral verification",
			);
			expect(summary.reports).toContain(
				path.join(scratch, "retro", attempt.ticket, `${record.run_id}.md`),
			);
		}
		expect(await fs.readFile(attempt.report!, "utf8")).toContain("Required behavior verified");
	}
	expect(retroWarnings.some((warning) => warning.includes("b.md"))).toBe(true);
	expect(await fs.stat(before.temporaryDir).catch(() => null)).toBeNull();
}, 30000);
