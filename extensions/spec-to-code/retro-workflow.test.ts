import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SingleResult } from "@oh-my-pi/pi-coding-agent";
import { RetroWorkflow } from "./retro-workflow";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

function result(id: string, overrides: Partial<SingleResult> = {}): SingleResult {
	return { index: 0, id, agent: "tdd", agentSource: "project", task: "ticket", exitCode: 0,
		output: "Implemented and verified", stderr: "", truncated: false, durationMs: 1, tokens: 1, requests: 1, ...overrides };
}

async function root(): Promise<string> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "wayfinder-retro-test-"));
	roots.push(directory);
	return directory;
}

function identify(execution: SingleResult) {
	return Promise.resolve({ agent: "tdd", agent_id: execution.id, session_id: `session-${execution.id}`,
		session_file: `/sessions/${execution.id}.jsonl`, execution_cwd: "/execution" });
}

// Controlled completion gates exercise ordering, not elapsed-time assumptions.
test("retry and next-ticket TDD proceed while every previous retro remains pending; final drain waits for all", async () => {
	const workspace = await root();
	const gates = new Map<string, { release(): void; started: Promise<void> }>();
	const releases = new Map<string, () => void>();
	for (const id of ["failed", "retry", "next"]) {
		let release!: () => void;
		const started = new Promise<void>(resolve => { release = resolve; });
		gates.set(id, { release, started });
	}
	const workflow = new RetroWorkflow("feature", workspace, "parent", "Main", "/parent.jsonl", new Set(["a.md", "b.md"]), {
		identify,
		async analyze(_record, execution) {
			const completion = new Promise<void>(resolve => releases.set(execution.id, resolve));
			gates.get(execution.id)!.release();
			await completion;
			return result(execution.id, { output: `Finding from ${execution.id}` });
		},
		warn() {},
	});
	await workflow.begin("call1", "a.md");
	await workflow.settle("call1", result("failed", { exitCode: 1, output: "Tests failed", error: "red" }));
	await gates.get("failed")!.started;
	await workflow.settle("call1", result("failed")); // Duplicate delivery must not overwrite first outcome.
	await workflow.begin("call2", "a.md");
	await workflow.settle("call2", result("retry"));
	await gates.get("retry")!.started;
	await workflow.begin("call3", "b.md");
	await workflow.settle("call3", result("next"));
	await gates.get("next")!.started;
	let drained = false;
	const finishing = workflow.finish().then(summary => { drained = true; return summary; });
	expect(workflow.records.map(record => record.retro_status)).toEqual(["running", "running", "running"]);
	expect(drained).toBe(false);
	releases.get("next")!();
	releases.get("retry")!();
	await Promise.resolve();
	expect(drained).toBe(false);
	releases.get("failed")!();
	await finishing;
	const records = workflow.records;
	expect(records.map(record => record.tdd_status)).toEqual(["failed", "completed", "completed"]);
	expect(records.map(record => record.retro_status)).toEqual(["completed", "completed", "completed"]);
	expect(new Set(records.map(record => record.run_id)).size).toBe(3);
	for (const record of records) {
		const saved = JSON.parse(await fs.readFile(path.join(workspace, ".scratch/feature/retro", record.ticket, `${record.run_id}.json`), "utf8"));
		expect(saved.tdd_result.output).toBe(record.tdd_result!.output);
		expect(saved.session_id).toBe(`session-${record.agent_id}`);
		const document = await fs.readFile(record.retro_document!, "utf8");
		expect(document).toContain(`Finding from ${record.agent_id}`);
		expect(document).toContain(`"session_id": "session-${record.agent_id}"`);
	}
	await expect(workflow.begin("late", "a.md")).rejects.toThrow("收尾");
});

test("running TDD rejects concurrent dispatch; retro failures do not change implementation outcomes or stop next TDD", async () => {
	const workspace = await root();
	const workflow = new RetroWorkflow("feature", workspace, "parent", "Main", null, new Set(["a.md"]), {
		identify,
		async analyze(_record, execution) { throw new Error(`retro failure ${execution.id}`); },
		warn() {},
	});
	await workflow.begin("call1", "a.md");
	await expect(workflow.begin("parallel", "a.md")).rejects.toThrow("串行");
	await workflow.settle("call1", result("first"));
	await workflow.begin("call2", "a.md");
	await workflow.settle("call2", result("second"));
	await workflow.finish();
	expect(workflow.records.map(record => record.tdd_status)).toEqual(["completed", "completed"]);
	expect(workflow.records.map(record => record.retro_error)).toEqual(["retro failure first", "retro failure second"]);
	for (const record of workflow.records) {
		const saved = JSON.parse(await fs.readFile(path.join(workspace, ".scratch/feature/retro/a.md", `${record.run_id}.json`), "utf8"));
		expect(saved.retro_status).toBe("failed");
		expect(saved.retro_document).toBeUndefined();
	}
});

test("truncated output, missing original identity and document write failure are reported as undelivered", async () => {
	const workspace = await root();
	const workflow = new RetroWorkflow("feature", workspace, "parent", "Main", null, new Set(["a.md"]), {
		async identify(execution) {
			const identity = await identify(execution);
			return { ...identity, session_id: execution.id === "missing" ? null : identity.session_id };
		},
		async analyze(record, execution) {
			if (execution.id === "write-failure") {
				await fs.mkdir(path.join(workspace, ".scratch/feature/retro/a.md", `${record.run_id}.md`));
			}
			return result(execution.id, { truncated: execution.id === "truncated", output: "Finding" });
		},
		warn() {},
	});
	for (const id of ["truncated", "missing", "write-failure"]) {
		await workflow.begin(id, "a.md");
		await workflow.settle(id, result(id));
	}
	await workflow.finish();
	const records = workflow.records;
	expect(records.map(record => record.retro_status)).toEqual(["failed", "failed", "failed"]);
	expect(records[0].retro_error).toContain("截断");
	expect(records[1].retro_error).toContain("session_id");
	expect(records[2].retro_error).toMatch(/EISDIR|EEXIST|EPERM/);
	expect(records.map(record => record.tdd_status)).toEqual(["completed", "completed", "completed"]);
});

test("session cancellation settles background retro as failed without rerunning or creating a document", async () => {
	const workspace = await root();
	let ready!: () => void;
	const started = new Promise<void>(resolve => { ready = resolve; });
	const workflow = new RetroWorkflow("feature", workspace, "parent", "Main", null, new Set(["a.md"]), {
		identify,
		async analyze(_record, execution, signal) {
			ready();
			await new Promise<void>((_resolve, reject) => {
				if (signal.aborted) reject(signal.reason);
				else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
			});
			return result(execution.id);
		},
		warn() {},
	});
	await workflow.begin("call", "a.md");
	await workflow.settle("call", result("cancelled"));
	await started;
	await workflow.cancel();
	await workflow.finish();
	expect(workflow.records[0].tdd_status).toBe("completed");
	expect(workflow.records[0].retro_status).toBe("failed");
	expect(workflow.records[0].retro_error).toContain("不会自动恢复");
	expect(workflow.records[0].retro_document).toBeUndefined();
});
