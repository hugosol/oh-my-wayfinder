/**
 * Turn policy: what to do after one `agent_end` round.
 *
 * `planTurn` owns the whole decision — judge consult, ticket check, canned
 * fallback sequence, force round, and budget — and returns a `TurnPlan` for the
 * extension entry point to apply. The judge and the ticket lookup are injected
 * ports, so the policy is testable without a session.
 */

/** Jev option 1; also the first fallback follow-up when the judging chain is unavailable. */
export const AUTO_REPLY = "请你仔细思考后回答这些问题";
/** Jev option 2; also the fallback follow-up once one auto reply has been sent. */
export const PUBLISH_REPLY = "请生成文件";
/** Jev option 3; also the "continue normally" decision. */
export const CONTINUE_REPLY = "请继续";

export type TurnPlan =
	| { readonly type: "reply"; readonly text: string; readonly fallback: boolean }
	| { readonly type: "phase2"; readonly slug: string }
	| { readonly type: "stop"; readonly reason: "aborted" | "error" | "budget" };

export interface TurnSnapshot {
	readonly stopReason: string | undefined;
	readonly lastReply: string | undefined;
	readonly round: number;
	readonly firstReplySent: boolean;
	readonly canSpend: boolean;
	readonly forcePhase2Round: number;
}

export interface TurnPorts {
	/** Judge-chain decision, or undefined to run the pre-Jev canned sequence. */
	decide(lastReply: string, round: number): Promise<string | undefined>;
	/** True when implementation tickets exist for the slug. */
	hasTickets(slug: string): Promise<boolean>;
}

/** Strict argmax over `options`, preserving their order on ties (1 > 2 > 3). */
export function pickJevOption(probabilities: Record<string, number>, options: readonly string[]): string {
	let chosen = options[0] ?? "";
	for (const option of options) {
		if ((probabilities[option] ?? 0) > (probabilities[chosen] ?? 0)) chosen = option;
	}
	return chosen;
}

/** Phase 2 starts when tickets exist and Jev says continue, or once the force round is exceeded. */
export function shouldEnterPhase2(
	tickets: boolean,
	decision: string,
	turnCount: number,
	forcePhase2Round: number,
): boolean {
	if (!tickets) return false;
	if (decision === CONTINUE_REPLY) return true;
	return turnCount > forcePhase2Round;
}

/** Stop reason of the newest assistant message in an agent_end payload. */
export function lastAssistantStopReason(messages: readonly unknown[]): string | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (typeof message !== "object" || message === null) continue;
		if (!("role" in message) || message.role !== "assistant") continue;
		if (!("stopReason" in message)) return undefined;
		return typeof message.stopReason === "string" ? message.stopReason : undefined;
	}
	return undefined;
}

/** Text of the newest assistant message carrying non-empty text, or undefined when none does. */
export function lastAssistantText(messages: readonly unknown[]): string | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (typeof message !== "object" || message === null) continue;
		if (!("role" in message) || message.role !== "assistant") continue;
		if (!("content" in message) || !Array.isArray(message.content)) continue;
		const texts: string[] = [];
		for (const part of message.content) {
			if (typeof part !== "object" || part === null) continue;
			if (!("type" in part) || part.type !== "text") continue;
			if (!("text" in part) || typeof part.text !== "string") continue;
			texts.push(part.text);
		}
		const text = texts.join("\n").trim();
		if (text) return text;
	}
	return undefined;
}

/**
 * Decide what this `agent_end` round should do. Stop reasons short-circuit before
 * the judge; otherwise the judge picks a canned reply, and any failure falls back
 * to the pre-Jev sequence.
 */
export async function planTurn(slug: string, snapshot: TurnSnapshot, ports: TurnPorts): Promise<TurnPlan> {
	if (snapshot.stopReason === "aborted" || snapshot.stopReason === "error") {
		return { type: "stop", reason: snapshot.stopReason };
	}

	const decision = snapshot.lastReply ? await ports.decide(snapshot.lastReply, snapshot.round) : undefined;

	if (decision === undefined) {
		// Pre-Jev path: tickets end the phase immediately, otherwise nudge the agent.
		if (await ports.hasTickets(slug)) return { type: "phase2", slug };
		if (!snapshot.canSpend) return { type: "stop", reason: "budget" };
		return { type: "reply", text: snapshot.firstReplySent ? PUBLISH_REPLY : AUTO_REPLY, fallback: true };
	}

	const tickets = await ports.hasTickets(slug);
	if (shouldEnterPhase2(tickets, decision, snapshot.round, snapshot.forcePhase2Round)) {
		return { type: "phase2", slug };
	}
	if (!snapshot.canSpend) {
		// Budget spent but tickets are ready: don't throw the work away.
		return tickets ? { type: "phase2", slug } : { type: "stop", reason: "budget" };
	}
	return { type: "reply", text: decision, fallback: false };
}
