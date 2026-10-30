import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	AuthStorage, createAgentSession, ModelRegistry, SessionManager, Settings,
} from "@oh-my-pi/pi-coding-agent";
import { AgentLifecycleManager } from "@oh-my-pi/pi-coding-agent/registry/agent-lifecycle";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { prepareRetroSession } from "./retro-host";

// These are consumer tests against the installed SDK: no mocks and no model
// turn/network request. Exercise its real writer, registry, park, replay and
// yield-tool runtime rather than asserting that a cwd option was forwarded.
for (const scenario of ["live", "parked", "retro-active"] as const) {
	test(`retro preserves the original session after cwd deletion (${scenario})`, async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "wayfinder-retro-cwd-"));
		const workspace = path.join(root, "integration");
		const worktree = path.join(root, "ticket-worktree");
		const sessions = path.join(root, "sessions");
		await Promise.all([workspace, worktree, sessions].map(directory => fs.mkdir(directory)));
		const auth = await AuthStorage.create(":memory:");
		const models = new ModelRegistry(auth, path.join(root, "models.yml"));
		const model = models.getAll().find(candidate => candidate.contextWindow !== null && candidate.contextWindow > 0);
		if (!model) throw new Error("SDK bundled model catalog is required (no API key or model call needed).");
		const id = `Retro-${path.basename(root)}`;
		const lifecycle = AgentLifecycleManager.global();
		const options = {
			authStorage: auth,
			modelRegistry: models,
			model,
			agentDir: root,
			settings: Settings.isolated({ "compaction.enabled": false, "async.enabled": false }),
			bindProcessState: false,
			disableExtensionDiscovery: true,
			enableMCP: false,
			enableLsp: false,
			enableIrc: false,
			restrictToolNames: true,
			toolNames: ["yield"],
			requireYieldTool: true,
			skills: [], contextFiles: [], promptTemplates: [], slashCommands: [],
			workspaceTree: { rootPath: workspace, rendered: "", truncated: false, totalLines: 0, agentsMdFiles: [] },
		};
		const { session: parent } = await createAgentSession({
			...options, cwd: workspace, sessionManager: SessionManager.inMemory(workspace), agentId: `${id}-Parent`,
		});
		try {
			const manager = SessionManager.create(worktree, sessions);
			manager.appendSessionInit({
				agent: "tdd", systemPrompt: ["Original TDD execution instructions"], task: "Implement ticket",
				tools: ["write", "bash", "yield"], resolvedModel: `${model.provider}/${model.id}`,
			});
			manager.appendMessage({ role: "user", content: "Original ticket request", timestamp: Date.now() });
			manager.appendMessage({
				role: "assistant", content: [{ type: "text", text: "Original implementation evidence" }],
				api: model.api, provider: model.provider, model: model.id,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "stop", timestamp: Date.now(),
			});
			const { session: execution } = await createAgentSession({
				...options, cwd: worktree, sessionManager: manager, agentId: id,
				parentAgentId: `${id}-Parent`, parentTaskPrefix: id, taskDepth: 1,
			});
			AgentRegistry.global().setStatus(id, "idle");
			lifecycle.adopt(id, {
				idleTtlMs: 0,
				revive: async () => { throw new Error("Spawn-time reviver must never touch the deleted worktree"); },
			});
			const identity = {
				agent_id: id, session_id: manager.getSessionId(), session_file: manager.getSessionFile()!, workspace,
			};
			const historyIds = manager.getEntries().filter(entry => entry.type === "message").map(entry => entry.id);
			if (scenario === "parked") await lifecycle.park(id);
			if (scenario !== "retro-active") await fs.rm(worktree, { recursive: true });
			const retro = await prepareRetroSession(identity, parent);
			if (scenario === "retro-active") await fs.rm(worktree, { recursive: true });
			expect(retro).not.toBe(execution);
			expect(retro.sessionManager.getSessionId()).toBe(identity.session_id);
			expect(retro.sessionManager.getSessionFile()).toBe(identity.session_file);
			expect(retro.sessionManager.getCwd()).toBe(workspace);
			expect(retro.sessionManager.getEntries().filter(entry => entry.type === "message").map(entry => entry.id)).toEqual(historyIds);
			expect(JSON.stringify(retro.messages)).toContain("Original implementation evidence");
			expect(retro.getActiveToolNames()).toEqual(["yield"]);
			await retro.setWorkPoolYieldItems([{ id: "retro_markdown", index: 1 }]);
			expect(retro.getActiveToolNames()).toContain("yield");
			const yielded = await retro.getToolByName("yield")!.execute("retro-yield", {
				key: 1, data: "# Findings\nOriginal execution evidence only.",
			});
			expect(yielded.details).toMatchObject({ status: "success" });
			// A retro waiting/running after integration uses only this stable cwd.
			expect(await fs.stat(workspace).then(stat => stat.isDirectory())).toBe(true);
			await expect(fs.stat(worktree)).rejects.toThrow();
			// Re-park after migration: the SDK must revive from the new contract,
			// not use either its original warm closure or its deleted-cwd probe.
			await lifecycle.park(id);
			expect(AgentRegistry.global().get(id)?.session).toBeNull();
			const restored = await lifecycle.ensureLive(id);
			expect(restored.sessionManager.getSessionId()).toBe(identity.session_id);
			expect(restored.sessionManager.getCwd()).toBe(workspace);
			expect(JSON.stringify(restored.messages)).toContain("Original implementation evidence");
			expect(restored.getActiveToolNames()).toEqual(["yield"]);
			expect((await SessionManager.peekSessionInit(identity.session_file))?.cwd).toBe(workspace);
		} finally {
			await lifecycle.release(id);
			await parent.dispose();
			await auth.close();
			await fs.rm(root, { recursive: true, force: true });
		}
	}, 60_000);
}
