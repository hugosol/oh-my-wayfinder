/**
 * Fresh-session dispatch surface for the hyper-auto-coding orchestrator.
 *
 * Every role runs through the host's own structured-subagent entry point on a
 * child session derived from the live calling session, with `cwd` as the only
 * replaced field: the child runs in the requested workspace while the calling
 * session keeps its own. Settings, credentials, discovered skills, extension
 * policy, and artifacts are forwarded from that live session, and each spawn is
 * a brand-new session, so no child inherits a parent transcript.
 *
 * `implement` runs the `tdd` agent captured from the integration root — injected
 * into every child session, so a project-only `.omp/agents` install survives a
 * worktree spawn. `implement` and `integrate` are the two roles kept addressable
 * (`keepAlive` plus retained artifacts): the retro callbacks continue the exact
 * original implementation session, and `resume` continues the exact original
 * integration session across its conflict/repair rounds instead of spawning a
 * replacement. Helper roles run inline definitions that never autoload the `tdd`
 * skill; `verify` is additionally limited to read-only tools. Isolation is never
 * requested: worktrees are the caller's concern and the retro continuation
 * rejects isolated sessions.
 */
import {
	type AgentDefinition,
	type AgentSession,
	type ExtensionAPI,
	type ExtensionContext,
	runSubagentFollowUpTurn,
	type SingleResult,
	type ToolSession,
} from "@oh-my-pi/pi-coding-agent";
import { formatModelString } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task";
import { getBundledAgent } from "@oh-my-pi/pi-coding-agent/task/agents";
import { AgentOutputManager } from "@oh-my-pi/pi-coding-agent/task/output-manager";
import { runStructuredSubagent } from "@oh-my-pi/pi-coding-agent/task/structured-subagent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createRetroPorts } from "../implementation-node/retro-host";
import type { RetroPorts } from "../implementation-node/tdd-execution";

/** Roles the orchestrator dispatches to fresh subagent sessions. */
export type HyperRole = "implement" | "integrate" | "fix" | "verify";

/** One fresh-session dispatch request. */
export interface HyperRun {
	/** Role the child runs; selects its agent definition and lifecycle. */
	role: HyperRole;
	/**
	 * Working directory of the fresh child session. Set on the child only; the
	 * calling session's own cwd never changes.
	 */
	cwd: string;
	/** Complete instructions for the child; passed as its task prompt verbatim. */
	task: string;
	/** Parent-supplied spawn handle used for id allocation (e.g. the ticket file name). */
	name: string;
}

/** Host handed to the orchestrator; one per workflow. */
export interface HyperHost {
	/**
	 * Run one role to completion in a fresh child session.
	 *
	 * Resolves with the child's settled `SingleResult` exactly as the host
	 * produced it. A run that failed still resolves (`exitCode !== 0`, `error`,
	 * `aborted`, or `truncated` set; `output` may be empty) — the caller owns
	 * what a normal exit means. It rejects only when no child result exists:
	 * unknown role, invalid cwd, missing calling session, or a structured
	 * subagent preflight/execution failure (`StructuredSubagentError`).
	 *
	 * `result.output` carries the child's final yield text (its Markdown
	 * report); no output schema is imposed, so the agent's own completion
	 * contract decides the body.
	 *
	 * `implement` and `integrate` runs keep their child session alive; every
	 * other run ends with its session.
	 */
	run(request: HyperRun): Promise<SingleResult>;
	/**
	 * Continue the exact child session an earlier `integrate` run created, with
	 * one more turn on its retained conversation history, and resolve with that
	 * turn's `SingleResult`. `id` is the `id` of the original run's result;
	 * `task` is the follow-up assignment.
	 *
	 * The continuation never spawns a replacement session: an `id` this host did
	 * not keep alive (or whose session was released) fails instead of silently
	 * starting a new one, and `cwd` is ignored because the session keeps the
	 * working directory it was spawned with. Any failure rejects with the
	 * underlying error.
	 */
	resume(request: HyperRun & { id: string }): Promise<SingleResult>;
	/**
	 * Retro callbacks bound to this host, captured before any implement
	 * dispatch: `identify(result)` resolves the retained original session of an
	 * `implement` result, `analyze` continues it for the retrospective turn.
	 */
	retro: RetroPorts;
	/**
	 * Release artifact directories retained for `implement` and `integrate` runs
	 * whose lease was temporary. Call once the workflow is finished — after every
	 * retro, the last integration round, and the final report commit — because a
	 * retained directory holds the original session a later retro or integration
	 * continuation must revive. A persisted calling session owns its artifacts
	 * directory outright, so nothing is retained and this is a no-op; the calling
	 * session's history is never touched.
	 */
	close(): Promise<void>;
}

const ROLES: readonly HyperRole[] = ["implement", "integrate", "fix", "verify"];
const IMPLEMENT_AGENT = "tdd";
type HelperRole = Exclude<HyperRole, "implement">;
const HELPER_ROLES: readonly HelperRole[] = ["integrate", "fix", "verify"];
/**
 * Explicit tool set for `verify`: file readers, LSP, and `bash` so
 * `git diff`/`log`, builds, and checks actually run, minus every
 * file-writing tool. The host has no read-only bash mode (its read-only agent
 * policy excludes `bash` entirely), so write prevention rides the role prompt
 * and the orchestrator's own post-run assertions.
 */
const HELPER_TOOLS = ["read", "grep", "glob", "find", "ast_grep", "lsp", "web_search", "wait", "todo", "bash"];

interface HelperSpec {
	description: string;
	systemPrompt: string;
	/** Tool allowlist; absent keeps the bundled task agent's full toolset. */
	tools?: string[];
}

const HELPER_SPECS: Record<HelperRole, HelperSpec> = {
	integrate: {
		description: "Hyper-auto-coding helper: sync ticket work into the integration state and validate the result",
		systemPrompt: [
			"You are the integration helper of the hyper-auto-coding pipeline, running as one fresh child session. You receive one complete assignment and no parent conversation exists.",
			"The assignment is your whole scope, including which directory each step runs in: syncing a ticket's work and verifying the merged state can happen in different workspaces, so follow the paths the assignment names rather than assuming one.",
			"Do not work outside the assignment and do not modify unrelated files. When finished, report through yield: the concrete result, the commands you ran with their observed outcomes, and any blocker with its exact error. Never fabricate an outcome you did not observe.",
		].join("\n\n"),
	},
	fix: {
		description: "Hyper-auto-coding helper: apply the assigned fixes, validate, and commit",
		systemPrompt: [
			"You are the fixer helper of the hyper-auto-coding pipeline, running as one fresh child session. You receive one complete assignment and no parent conversation exists.",
			"Apply exactly the fixes the assignment describes, validate them with the project's own checks, and commit the result when the assignment calls for a commit. Every claim in your report must come from a command you actually ran in this session.",
			"End with yield: what changed, the validation evidence (commands and observed outcomes), the commit identity when one was created, and any fix you could not complete with its exact blocker.",
		].join("\n\n"),
	},
	verify: {
		description: "Hyper-auto-coding helper: run the final verification pass and report what was observed",
		systemPrompt: [
			"You are the verification helper of the hyper-auto-coding pipeline, running as one fresh child session. You receive one complete assignment and no parent conversation exists.",
			"Run the verification the assignment specifies against the current workspace state and report what you observed. Do not fix, edit, or commit anything unless the assignment explicitly says to.",
			"End with yield: the exact commands, their observed outcomes, the verdict, and any check you could not run with its reason. Never claim a check passed without its output.",
		].join("\n\n"),
		tools: HELPER_TOOLS,
	},
};

/**
 * Inline helper definitions, built on the bundled `task` agent exactly as the
 * host's own session agents are. Helpers never inherit the implementation
 * agent's `tdd` skill.
 */
function buildHelperAgents(): AgentDefinition[] {
	const base = getBundledAgent("task");
	if (!base) throw new Error('hyper-auto-coding helper agents need the bundled "task" agent definition.');
	return HELPER_ROLES.map((role) => ({
		...base,
		name: `hyper-${role}`,
		description: HELPER_SPECS[role].description,
		systemPrompt: HELPER_SPECS[role].systemPrompt,
		tools: HELPER_SPECS[role].tools,
		filePath: undefined,
	}));
}

/**
 * The integration root's `tdd` agent, captured before any ticket dispatch.
 * Users may install it only in `<integration-root>/.omp/agents`, and a ticket
 * worktree carries no ignored `.omp`, so this definition is injected into every
 * child session instead of relying on discovery from the worktree cwd.
 */
async function captureImplementAgent(ctx: ExtensionContext): Promise<AgentDefinition> {
	const workspace = path.resolve(ctx.cwd);
	const roots = AgentRegistry.global().get(ctx.agent.id)?.session?.effectiveExtensionRoots;
	const { agents } = await discoverAgents(workspace, undefined, roots);
	const agent = agents.find((candidate) => candidate.name === IMPLEMENT_AGENT);
	if (!agent) {
		throw new Error(
			`hyper-auto-coding needs a discovered "${IMPLEMENT_AGENT}" agent at the integration root ${workspace} (project .omp/agents or a configured extension root).`,
		);
	}
	return agent;
}

/** The live calling session that owns this host, or a precise failure. */
function requireCallerSession(ctx: ExtensionContext): AgentSession {
	const session = AgentRegistry.global().get(ctx.agent.id)?.session;
	if (!session) {
		throw new Error(
			`hyper-auto-coding needs the live calling session "${ctx.agent.id}" in the agent registry to spawn fresh subagents.`,
		);
	}
	return session;
}

/**
 * Child session surface for one spawn: every field comes from the live calling
 * session and `cwd` is the only replacement. Fields a session cannot expose
 * stay absent on purpose so the host's own defaults apply instead of a
 * fabricated value.
 */
function deriveChildSession(options: {
	parent: AgentSession;
	cwd: string;
	pi: ExtensionAPI;
	ctx: ExtensionContext;
	implement: AgentDefinition;
	helpers: readonly AgentDefinition[];
	outputManager: AgentOutputManager;
}): ToolSession {
	const { parent, cwd, pi, ctx, implement, helpers, outputManager } = options;
	return {
		cwd,
		hasUI: false,
		getSessionFile: () => parent.sessionFile ?? null,
		// Unrestricted, matching the SDK default a top-level session reports.
		getSessionSpawns: () => "*",
		settings: parent.settings,
		// Drives the executor's autoload resolution: this is what lets the
		// discovered `tdd` agent autoload the discovered `tdd` skill.
		skills: parent.skills,
		promptTemplates: [...parent.promptTemplates],
		effectiveExtensionRoots: () => parent.effectiveExtensionRoots,
		extensionPaths: parent.extensionPaths ? [...parent.extensionPaths] : undefined,
		preparedExtensions: parent.preparedExtensions ? [...parent.preparedExtensions] : undefined,
		authStorage: parent.modelRegistry.authStorage,
		modelRegistry: parent.modelRegistry,
		asyncJobManager: parent.asyncJobManager,
		eventBus: pi.events,
		getCredentialSourceSessionId: () => parent.sessionId,
		getServiceTierByFamily: () => parent.serviceTierByFamily,
		emitBeforeSubagentSpawn: (event, signal) =>
			parent.extensionRunner?.emitBeforeSubagentSpawn(event, signal) ?? Promise.resolve(undefined),
		// The captured integration-root `tdd` resolves by name even when the
		// fresh cwd (a worktree) has no `.omp`; the calling session's own agents
		// and the helpers keep working for nested children as for `task` spawns.
		getSessionAgents: () => [implement, ...parent.getSessionAgents(), ...helpers],
		getSessionId: () => parent.sessionId,
		getAgentId: () => parent.getAgentId() ?? ctx.agent.id,
		getActiveModel: () => parent.model,
		getActiveModelString: () => (parent.model ? formatModelString(parent.model) : undefined),
		getArtifactsDir: () => parent.sessionManager.getArtifactsDir(),
		getArtifactManager: () => parent.sessionManager.getArtifactManager(),
		agentOutputManager: outputManager,
		localProtocolOptions: ctx.localProtocolOptions,
		isDisposed: () => parent.isDisposed,
	};
}

/**
 * Resolution mirrors the executor exactly — discovery from the fresh cwd first,
 * then the agents this host injected — so a project-only `tdd` still resolves
 * in a worktree without its own `.omp`. A declared autoload skill that is not
 * discovered fails the run instead of silently spawning an agent without it.
 */
async function assertImplementReady(cwd: string, parent: AgentSession, session: ToolSession): Promise<void> {
	const { agents } = await discoverAgents(cwd, undefined, parent.effectiveExtensionRoots);
	const agent = [...agents, ...(session.getSessionAgents?.() ?? [])].find(
		(candidate) => candidate.name === IMPLEMENT_AGENT,
	);
	if (!agent) {
		throw new Error(`hyper-auto-coding implement could not resolve the "${IMPLEMENT_AGENT}" agent for ${cwd}.`);
	}
	const discovered = new Set((session.skills ?? []).map((skill) => skill.name));
	const missing = (agent.autoloadSkills ?? []).filter((name) => !discovered.has(name));
	if (missing.length > 0) {
		throw new Error(
			`"${IMPLEMENT_AGENT}" autoloads ${missing.join(", ")}, but no such skill is discovered for this session; the child would run without its skill.`,
		);
	}
}

/** Build the host for one orchestrator run; fails fast when the host cannot dispatch. */
export async function createHyperHost(pi: ExtensionAPI, ctx: ExtensionContext): Promise<HyperHost> {
	const helpers = buildHelperAgents();
	// Captured from the integration root before any ticket dispatch, so worktree
	// spawns keep resolving the same `tdd` agent a project-only install provides.
	const implement = await captureImplementAgent(ctx);
	// Also captured here; enforces the blocking-tdd requirement the retro
	// continuation relies on.
	const retro = await createRetroPorts(pi, ctx);
	// One allocator per host keeps sibling spawn ids unique (same-name retries
	// get their numeric suffix), seeded from the calling session's artifacts
	// directory, live-resolved in case the session moves.
	const outputManager = new AgentOutputManager(
		() => AgentRegistry.global().get(ctx.agent.id)?.session?.sessionManager.getArtifactsDir() ?? null,
	);
	// Cleanup closures for kept-alive runs whose artifact lease was temporary
	// (a calling session with no session file of its own). A persisted calling
	// session owns its artifacts directory outright, so the host never receives
	// a temporary lease and never retains anything to release.
	const retainedCleanups = new Set<() => Promise<void>>();

	async function run(request: HyperRun): Promise<SingleResult> {
		if (!ROLES.includes(request.role)) {
			throw new Error(`Unknown hyper role "${String(request.role)}". Expected one of: ${ROLES.join(", ")}.`);
		}
		const assignment = request.task.trim();
		if (!assignment) throw new Error(`hyper ${request.role} run needs a non-empty task.`);
		const cwd = path.resolve(request.cwd);
		const stat = await fs.stat(cwd).catch(() => null);
		if (!stat?.isDirectory()) {
			throw new Error(`hyper ${request.role} cwd is not a directory: ${cwd}`);
		}
		const isImplement = request.role === "implement";
		// Implement sessions outlive the run so the retro callbacks can continue
		// the exact original session; integration sessions outlive it so `resume`
		// can continue the same session across its conflict/repair rounds. Either
		// way the artifacts directory holding the session is retained until
		// `close`, including across a park/revive cycle.
		const keptAlive = isImplement || request.role === "integrate";
		const parent = requireCallerSession(ctx);
		const session = deriveChildSession({ parent, cwd, pi, ctx, implement, helpers, outputManager });
		if (isImplement) await assertImplementReady(cwd, parent, session);
		const { result } = await runStructuredSubagent({
			session,
			invocationKind: "task",
			assignment,
			agent: isImplement ? IMPLEMENT_AGENT : `hyper-${request.role}`,
			identity: { label: request.name },
			keepAlive: keptAlive,
			retainArtifacts: keptAlive,
			onArtifactsRetained: keptAlive ? (cleanup) => retainedCleanups.add(cleanup) : undefined,
		});
		return result;
	}

	/**
	 * Continue the exact integration session `id` names. The turn runs on the
	 * retained conversation history through the SDK's own follow-up entry point,
	 * so no replacement session is ever created; an unknown or released id
	 * rejects with the SDK's own error. `cwd` and `name` are ignored: the
	 * continued session keeps the working directory and id it was spawned with.
	 */
	async function resume(request: HyperRun & { id: string }): Promise<SingleResult> {
		if (request.role !== "integrate") {
			throw new Error(`hyper resume only continues "integrate" sessions, not "${String(request.role)}".`);
		}
		const id = request.id.trim();
		if (!id) throw new Error("hyper integrate resume needs the id of the run to continue.");
		const assignment = request.task.trim();
		if (!assignment) throw new Error("hyper integrate resume needs a non-empty task.");
		const agent = helpers.find((candidate) => candidate.name === "hyper-integrate");
		if (!agent) throw new Error('hyper-auto-coding has no "hyper-integrate" agent definition.');
		return runSubagentFollowUpTurn({
			id,
			agent,
			message: assignment,
			parentToolCallId: `hyper:integrate:${id}`,
			eventBus: pi.events,
		});
	}

	/** Release the temporary artifact directories retained for kept-alive runs. */
	async function close(): Promise<void> {
		const cleanups = [...retainedCleanups];
		retainedCleanups.clear();
		await Promise.all(cleanups.map((cleanup) => cleanup()));
	}

	return { run, resume, retro, close };
}
