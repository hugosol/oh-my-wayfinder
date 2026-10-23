import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { TicketProgress } from "../implementation-node/tdd-execution";

export const WORKFLOW_PROGRESS_ENTRY = "wayfinder-workflow-progress";
export const WORKFLOW_PROGRESS_WIDGET = "wayfinder-workflow-progress";
export type WorkflowCommand = "spec-to-code" | "hyper-auto-coding";

export interface WorkflowProgressSnapshot {
	version: 1;
	ownerSessionId: string;
	ownerAgentId: string;
	command: WorkflowCommand;
	slug: string;
	state: "preparing" | "execution" | "stopped" | "error";
	progress: TicketProgress | null;
}

interface ProgressSource {
	readonly progress: TicketProgress;
	subscribeProgress(listener: () => void): () => void;
}

export interface WorkflowProgressHandle {
	isCurrent(): boolean;
	attach(source: ProgressSource): void;
	capture(): void;
	stop(error?: boolean): void;
}

function validSnapshot(value: unknown, sessionId: string, agentId: string): value is WorkflowProgressSnapshot {
	if (!value || typeof value !== "object") return false;
	const s = value as WorkflowProgressSnapshot;
	if (s.version !== 1 || s.ownerSessionId !== sessionId || s.ownerAgentId !== agentId ||
		(s.command !== "spec-to-code" && s.command !== "hyper-auto-coding") ||
		typeof s.slug !== "string" || !s.slug.trim() ||
		!["preparing", "execution", "stopped", "error"].includes(s.state)) return false;
	if (s.progress === null) return s.state !== "execution";
	const p = s.progress;
	if (!p || typeof p !== "object" || !Number.isSafeInteger(p.total) || p.total < 0 ||
		!Number.isSafeInteger(p.executed) || p.executed < 0 || p.executed > p.total ||
		!["running", "pausing", "paused", "finished"].includes(p.mode)) return false;
	return s.command === "hyper-auto-coding"
		? Number.isSafeInteger(p.integrated) && p.integrated! >= 0 && p.integrated! <= p.total
		: p.integrated === undefined;
}

/** Fixed-width bars remain bounded even for empty or very large ticket sets. */
export function formatWorkflowProgress(snapshot: WorkflowProgressSnapshot): string[] {
	const label = snapshot.command === "hyper-auto-coding" ? "Hyper-Auto-Coding" : "Spec-to-Code";
	// Keep persisted labels from injecting terminal controls or unbounded widget lines.
	const slug = snapshot.slug.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").slice(0, 60);
	if (!snapshot.progress) return [`${label} · ${slug} · ${snapshot.state === "preparing" ? "Phase 1 · preparing" : snapshot.state}`];
	const p = snapshot.progress;
	const width = 24;
	const cells = (count: number) => p.total === 0 ? 0 : Math.max(0, Math.min(width, Math.floor(count / p.total * width)));
	const integrated = cells(p.integrated ?? 0);
	const tddOnly = Math.max(0, cells(p.executed) - integrated);
	const bar = "█".repeat(integrated) + "░".repeat(tddOnly) + "·".repeat(width - integrated - tddOnly);
	const state = snapshot.state === "execution" ? p.mode : snapshot.state;
	return [
		`${label} · ${slug} · Phase 2 · ${state}`,
		`[${bar}] TDD ended ${p.executed}/${p.total}${p.integrated === undefined ? "" : ` · integrated ${p.integrated}/${p.total}`}`,
	];
}

/** Display snapshots only: reopening a session never resumes execution. */
export function createWorkflowProgress(pi: Pick<ExtensionAPI, "appendEntry">) {
	let generation = 0;
	let context: ExtensionContext | undefined;
	let detach: (() => void) | undefined;
	let snapshot: WorkflowProgressSnapshot | undefined;
	const clear = () => {
		generation++;
		detach?.();
		detach = undefined;
		context?.ui.setWidget(WORKFLOW_PROGRESS_WIDGET, undefined, { placement: "aboveEditor" });
		context = undefined;
		snapshot = undefined;
	};
	const publish = (persist: boolean) => {
		if (!context || !snapshot || context.sessionManager.getSessionId() !== snapshot.ownerSessionId || context.agent.id !== snapshot.ownerAgentId) return;
		try {
			context.ui.setWidget(WORKFLOW_PROGRESS_WIDGET, formatWorkflowProgress(snapshot), { placement: "aboveEditor" });
			if (persist) pi.appendEntry(WORKFLOW_PROGRESS_ENTRY, snapshot);
		} catch {
			// Display/persistence failures must never affect workflow scheduling or results.
		}
	};
	return {
		clear,
		restore(ctx: ExtensionContext) {
			clear();
			context = ctx;
			const entries = ctx.sessionManager.getEntries();
			for (let index = entries.length - 1; index >= 0; index--) {
				const entry = entries[index];
				if (entry.type !== "custom" || entry.customType !== WORKFLOW_PROGRESS_ENTRY) continue;
				if (validSnapshot(entry.data, ctx.sessionManager.getSessionId(), ctx.agent.id)) {
					snapshot = entry.data;
					publish(false);
					return;
				}
			}
			ctx.ui.setWidget(WORKFLOW_PROGRESS_WIDGET, undefined, { placement: "aboveEditor" });
		},
		begin(ctx: ExtensionContext, command: WorkflowCommand, slug: string): WorkflowProgressHandle {
			clear();
			context = ctx;
			const token = generation;
			snapshot = { version: 1, ownerSessionId: ctx.sessionManager.getSessionId(), ownerAgentId: ctx.agent.id, command, slug, state: "preparing", progress: null };
			const isCurrent = () => token === generation && snapshot !== undefined && ctx.sessionManager.getSessionId() === snapshot.ownerSessionId && ctx.agent.id === snapshot.ownerAgentId;
			let source: ProgressSource | undefined;
			const capture = () => {
				if (!isCurrent() || !source || !snapshot) return;
				snapshot = { ...snapshot, state: "execution", progress: { ...source.progress } };
				publish(true);
			};
			publish(true);
			return {
				isCurrent,
				capture,
				attach(next) {
					if (!isCurrent()) return;
					detach?.();
					source = next;
					detach = next.subscribeProgress(capture);
					capture();
				},
				stop(error = false) {
					if (!isCurrent() || !snapshot) return;
					detach?.();
					detach = undefined;
					snapshot = { ...snapshot, state: error ? "error" : "stopped" };
					publish(true);
				},
			};
		},
	};
}
