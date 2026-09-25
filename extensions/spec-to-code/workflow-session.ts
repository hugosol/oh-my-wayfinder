/**
 * Workflow session state: the single owner of one `/spec-to-code` run.
 *
 * Every automatic intervention (an `ask` answer or an auto reply) spends one
 * unit of a fixed budget, so a stuck phase can never loop forever. That
 * invariant lives here with the rest of the run state instead of being
 * re-derived at each call site.
 */

/** Hard ceiling on automatic interventions per workflow; reached => stop and hand back to the user. */
export const MAX_AUTO_ACTIONS = 15;

export interface WorkflowSession {
	/** Start phase 1 for `slug`, owned by `sessionId`. */
	begin(slug: string, sessionId: string): void;
	/** Return to idle and drop all run state. */
	reset(): void;
	/** True while a run is in phase 1. */
	readonly isActive: boolean;
	/** Slug of the running workflow, if any. */
	readonly slug: string | undefined;
	/** `agent_end` rounds processed by the running workflow. */
	readonly round: number;
	/** Whether the canned fallback has already sent its first nudge. */
	readonly firstReplySent: boolean;
	/** Whether another automatic intervention fits in the budget. */
	readonly canSpend: boolean;
	/** True when `sessionId` owns the running workflow. */
	owns(sessionId: string): boolean;
	/** Increment and return the processed round count. */
	advanceRound(): number;
	/** Spend one automatic intervention. False once the budget is exhausted. */
	spendIntervention(): boolean;
	/** Record that a canned fallback reply was sent. */
	markReplied(): void;
}

export function createWorkflowSession(): WorkflowSession {
	let phase: "idle" | "phase1" = "idle";
	let slug: string | undefined;
	let ownerSessionId: string | undefined;
	let autoActionCount = 0;
	let roundCount = 0;
	let firstReplySent = false;

	return {
		begin(nextSlug, sessionId) {
			phase = "phase1";
			slug = nextSlug;
			ownerSessionId = sessionId;
			autoActionCount = 0;
			roundCount = 0;
			firstReplySent = false;
		},
		reset() {
			phase = "idle";
			slug = undefined;
			ownerSessionId = undefined;
			autoActionCount = 0;
			roundCount = 0;
			firstReplySent = false;
		},
		get isActive() {
			return phase === "phase1";
		},
		get slug() {
			return slug;
		},
		get round() {
			return roundCount;
		},
		get firstReplySent() {
			return firstReplySent;
		},
		get canSpend() {
			return autoActionCount < MAX_AUTO_ACTIONS;
		},
		owns(sessionId) {
			return ownerSessionId !== undefined && sessionId === ownerSessionId;
		},
		advanceRound() {
			roundCount += 1;
			return roundCount;
		},
		spendIntervention() {
			if (autoActionCount >= MAX_AUTO_ACTIONS) return false;
			autoActionCount += 1;
			return true;
		},
		markReplied() {
			firstReplySent = true;
		},
	};
}
