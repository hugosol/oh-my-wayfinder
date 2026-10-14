import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { HyperGit } from "./git";
import type { HyperHost, HyperRun } from "./host";
import { HyperWorkflow } from "./workflow";

const roots: string[] = [];
const workflows: HyperWorkflow[] = [];
const releases: (() => void)[] = [];
afterEach(async () => {
	for (const release of releases.splice(0)) release();
	for (const workflow of workflows.splice(0)) {
		while ((workflow.status() as { active: string[] }).active.length) await workflow.execute({ action: "collect" });
		await workflow.retro.finish();
		for (const tree of workflow.git.worktrees.values()) {
			if (await fs.stat(tree.cwd).catch(() => null))
				await git(workflow.git.root, "worktree", "remove", "--force", tree.cwd);
		}
		await fs.rm(workflow.temporary, { recursive: true, force: true });
	}
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
	const process = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
	const [out, error, code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (code) throw new Error(error || out);
	return out.trim();
}
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

async function fixture(
	options: {
		cap?: number;
		implementationGate?: Promise<void>;
		retroGate?: Promise<void>;
		failIntegration?: boolean;
		throwImplementation?: () => boolean;
		mutateReadonly?: () => "review" | "verify" | undefined;
	} = {},
) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "hyper-workflow-test-"));
	roots.push(root);
	await git(root, "init", "-b", "feature/delivery");
	await git(root, "config", "user.name", "Workflow Test");
	await git(root, "config", "user.email", "workflow@example.invalid");
	await git(root, "config", "core.autocrlf", "false");
	await git(root, "config", "commit.gpgsign", "false");
	const scratch = path.join(root, ".scratch", "feature");
	await fs.mkdir(scratch, { recursive: true });
	await fs.writeFile(path.join(scratch, "spec.md"), "Deliver independent A and B, then dependent C.");
	await fs.writeFile(path.join(scratch, "contract.md"), "P1: A; P2: B; P3: C sees A.");
	await git(root, "add", ".scratch");
	await git(root, "commit", "-m", "approved input documents");
	const backend = await HyperGit.inspect(root, "feature");
	await fs.mkdir(path.join(scratch, "implementation"));
	for (const name of ["a.md", "b.md", "c.md"])
		await fs.writeFile(path.join(scratch, "implementation", name), `# ${name}\nAcceptance: deliver ${name[0]}.`);
	const retroIds: string[] = [];
	let failIntegration = options.failIntegration ?? false;
	const host: HyperHost = {
		async run(request) {
			if (request.role === "implement") {
				await options.implementationGate;
				if (options.throwImplementation?.()) throw new Error("implementation transport failed");
				const name = request.name.split(":")[0][0];
				await fs.writeFile(path.join(request.cwd, `${name}.txt`), `delivered ${name}\n`);
				await git(request.cwd, "add", `${name}.txt`);
				await git(request.cwd, "commit", "--allow-empty", "-m", `deliver ${name}`);
			} else if (request.role === "integrate") {
				if (request.cwd !== root) await git(request.cwd, "merge", "--no-edit", backend.branch);
				else if (failIntegration) {
					failIntegration = false;
					return result(request, { exitCode: 1, output: "Integration regression failed." });
				}
			} else if (request.role === "fix") {
				await fs.writeFile(path.join(root, "integration-fix.txt"), "regression corrected\n");
				await git(root, "add", "integration-fix.txt");
				await git(root, "commit", "-m", "fix integration regression");
			}
			if (options.mutateReadonly?.() === request.role) {
				await fs.writeFile(path.join(root, "readonly-change.txt"), request.role);
				await git(root, "add", "readonly-change.txt");
				await git(root, "commit", "-m", "illegal read-only change");
			}
			return result(request);
		},
		async close() {},
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
			async analyze(_record, execution) {
				retroIds.push(execution.id);
				await options.retroGate;
				return { ...execution, output: "Keep the successful behavioral verification; no instruction changes applied." };
			},
			warn() {},
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
	return { root, workflow, backend, retroIds };
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
	const { workflow, backend, root } = await fixture({ implementationGate: gate });
	await workflow.execute({ action: "dispatch", tickets: ["a.md", "b.md"] });
	expect([...backend.worktrees.keys()]).toEqual(["a.md", "b.md"]);
	await expect(workflow.execute({ action: "dispatch", tickets: ["c.md"] })).rejects.toThrow("并发上限");
	release();
	while (workflow.tickets.get("a.md")!.status === "running") await workflow.execute({ action: "collect" });
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
	await workflow.execute({ action: "dispatch", tickets: ["c.md"] });
	expect(await git(backend.worktrees.get("c.md")!.cwd, "show", "HEAD:a.txt")).toBe("delivered a");
	await workflow.execute({ action: "collect" });
});

test("fresh failed continuation reuses the worktree but cannot be accepted with the previous successful invocation report", async () => {
	let fail = false;
	const { workflow, backend } = await fixture({ throwImplementation: () => fail });
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await workflow.execute({ action: "collect" });
	const original = backend.worktrees.get("a.md")!;
	await workflow.execute({
		action: "accept",
		ticket: "a.md",
		accepted: false,
		reason: "One qualitative acceptance item remains unresolved despite normal exit.",
	});
	fail = true;
	await workflow.execute({ action: "dispatch", tickets: ["a.md"] });
	await workflow.execute({ action: "collect" });
	expect(backend.worktrees.get("a.md")).toEqual(original);
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
	const { workflow, retroIds } = await fixture({ failIntegration: true });
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
	await workflow.retro.finish();
	expect(retroIds).toEqual([workflow.retro.records[0].agent_id!]);
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

test("final publication waits for retro, commits all reports with usable paths, cleans trees and retains branches; stale validation cannot finish", async () => {
	let release!: () => void;
	const retroGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	releases.push(release);
	const { workflow, root, backend, retroIds } = await fixture({ retroGate });
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
	expect(await fs.readdir(path.join(root, ".scratch", "feature"))).toEqual([
		"contract.md",
		"implementation",
		"spec.md",
	]);
	const branches = [...backend.worktrees.values()].map((tree) => tree.branch);
	let finished = false;
	const finishing = workflow.execute({ action: "finish" }).then((value) => {
		finished = true;
		return value;
	});
	await Promise.resolve();
	expect(finished).toBe(false);
	release();
	const summary = (await finishing) as { commit: string; reports: string[]; warnings: string[] };
	expect(summary.warnings).toEqual([]);
	expect(await git(root, "status", "--porcelain")).toBe("");
	for (const branch of branches) expect(await git(root, "rev-parse", "--verify", branch)).toMatch(/^[a-f0-9]{40}$/);
	expect((await git(root, "worktree", "list", "--porcelain")).match(/^worktree /gm)).toEqual(["worktree "]);
	for (const file of summary.reports)
		expect(await git(root, "ls-files", "--error-unmatch", path.relative(root, file))).toBe(
			path.relative(root, file).split(path.sep).join("/"),
		);
	const ledgerFile = summary.reports.find((file) => file.endsWith("workflow.json"))!;
	const ledger = JSON.parse(await fs.readFile(ledgerFile, "utf8"));
	for (const attempt of ledger.attempts)
		expect(await fs.readFile(attempt.report, "utf8")).toContain("Required behavior verified");
	expect(retroIds).toEqual(workflow.retro.records.map((record) => record.agent_id!));
	expect(await fs.stat(workflow.temporary).catch(() => null)).toBeNull();
}, 30000);
