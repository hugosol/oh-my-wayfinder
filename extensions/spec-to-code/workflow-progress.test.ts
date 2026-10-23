import { expect, test } from "bun:test";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { TicketProgress } from "../implementation-node/tdd-execution";
import { createWorkflowProgress, WORKFLOW_PROGRESS_ENTRY, type WorkflowProgressSnapshot } from "./workflow-progress";

function fixture() {
	let sessionId = "original";
	const entries = new Map<string, { type: "custom"; customType: string; data: unknown }[]>();
	let widget: string[] | undefined;
	let writes = 0;
	const ctx = {
		agent: { id: "Main" },
		sessionManager: {
			getSessionId: () => sessionId,
			getEntries: () => entries.get(sessionId) ?? [],
		},
		ui: { setWidget(_key: string, content: string[] | undefined) { widget = content; } },
	} as unknown as ExtensionContext;
	const display = createWorkflowProgress({ appendEntry(customType: string, data: unknown) {
		writes++;
		const records = entries.get(sessionId) ?? [];
		records.push({ type: "custom", customType, data });
		entries.set(sessionId, records);
	} });
	return { ctx, display, entries, get widget() { return widget; }, get writes() { return writes; }, switchTo(id: string) { sessionId = id; } };
}

function source(initial: TicketProgress) {
	let listener = () => {};
	let detached = false;
	return {
		progress: initial,
		subscribeProgress(next: () => void) { listener = next; return () => { detached = true; }; },
		notify() { listener(); },
		get detached() { return detached; },
	};
}

test("no initial widget; switching detaches and stale callbacks cannot write; reopening restores display only", () => {
	const f = fixture();
	f.display.restore(f.ctx);
	expect(f.widget).toBeUndefined();
	expect(f.writes).toBe(0);
	const handle = f.display.begin(f.ctx, "hyper-auto-coding", "feature");
	expect(f.widget?.[0]).toContain("preparing");
	const workflow = source({ total: 3, executed: 2, integrated: 1, mode: "running" });
	handle.attach(workflow);
	expect(f.widget?.[1]).toContain("TDD ended 2/3 · integrated 1/3");
	f.display.clear();
	expect(workflow.detached).toBe(true);
	f.switchTo("other");
	f.display.restore(f.ctx);
	const writes = f.writes;
	workflow.progress = { total: 3, executed: 3, integrated: 3, mode: "finished" };
	workflow.notify();
	handle.capture();
	handle.stop(true);
	expect(f.widget).toBeUndefined();
	expect(f.writes).toBe(writes);
	f.switchTo("original");
	f.display.restore(f.ctx);
	expect(f.widget?.[1]).toContain("TDD ended 2/3 · integrated 1/3");
	workflow.notify();
	expect(f.writes).toBe(writes);
	expect(f.widget?.[1]).toContain("TDD ended 2/3");
});

test("new workflow invalidates old callbacks and final snapshots survive reopen", () => {
	const f = fixture();
	const old = source({ total: 1, executed: 0, mode: "running" });
	f.display.begin(f.ctx, "spec-to-code", "old").attach(old);
	const handle = f.display.begin(f.ctx, "spec-to-code", "new");
	const current = source({ total: 1, executed: 1, mode: "finished" });
	handle.attach(current);
	const writes = f.writes;
	old.notify();
	expect(f.writes).toBe(writes);
	f.display.restore(f.ctx);
	expect(f.widget?.[0]).toContain("new · Phase 2 · finished");
	expect(f.widget?.[1]).toContain("TDD ended 1/1");
});

test("restoration rejects foreign owners, malformed counts and unknown versions", () => {
	const f = fixture();
	const valid: WorkflowProgressSnapshot = { version: 1, ownerSessionId: "original", ownerAgentId: "Main", command: "spec-to-code", slug: "feature", state: "execution", progress: { total: 1, executed: 1, mode: "finished" } };
	for (const data of [
		{ ...valid, ownerSessionId: "foreign" },
		{ ...valid, ownerAgentId: "Other" },
		{ ...valid, version: 2 },
		{ ...valid, progress: { total: 1, executed: 2, mode: "finished" } },
		{ ...valid, progress: { total: 1, executed: NaN, mode: "finished" } },
		{ ...valid, command: "hyper-auto-coding" },
	]) {
		f.entries.set("original", [{ type: "custom", customType: WORKFLOW_PROGRESS_ENTRY, data }]);
		f.display.restore(f.ctx);
		expect(f.widget).toBeUndefined();
	}
});

test("activation failure remains an error instead of an endless preparing label", () => {
	const f = fixture();
	f.display.begin(f.ctx, "spec-to-code", "feature").stop(true);
	expect(f.widget?.[0]).toContain("error");
	f.display.restore(f.ctx);
	expect(f.widget?.[0]).not.toContain("preparing");
	expect(f.widget?.[0]).toContain("error");
});
