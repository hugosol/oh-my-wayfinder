import * as fs from "node:fs/promises";
import * as path from "node:path";
import { HyperGit } from "./git";

/** Resolve the run's local repositories; delivery inputs remain in the coordinator only. */
export async function loadRepositories(slug: string, coordinator: HyperGit): Promise<Map<string, HyperGit>> {
	const file = path.join(coordinator.root, ".scratch", slug, "repositories.json");
	let text: string;
	try {
		text = await fs.readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map([["coordinator", coordinator]]);
		throw error;
	}
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch {
		throw new Error(`仓库清单不是有效 JSON：${file}`);
	}
	const entries = input && typeof input === "object" && "repositories" in input ? input.repositories : undefined;
	if (!Array.isArray(entries) || entries.length === 0)
		throw new Error(`仓库清单必须包含非空 repositories 数组：${file}`);
	const repositories = new Map<string, HyperGit>();
	const directories = new Set<string>();
	let includesCoordinator = false;
	for (const entry of entries) {
		if (!entry || typeof entry !== "object" || typeof entry.id !== "string" ||
			!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.id) || typeof entry.path !== "string" || entry.path.trim() === "")
			throw new Error(`仓库条目需要安全的 id 与非空本地 path：${file}`);
		if (repositories.has(entry.id)) throw new Error(`仓库 id 重复：${entry.id}`);
		const root = await fs.realpath(path.resolve(coordinator.root, entry.path));
		// Phase 1 may have just written the coordinator's ticket files. Its clean
		// check belongs after publication, not while resolving this manifest.
		const backend = root === coordinator.root
			? coordinator
			: await HyperGit.inspect(root, slug, { requireInputs: false });
		if (backend.root !== root) throw new Error(`仓库 path 必须指向 Git 工作区根目录：${entry.id} (${root})`);
		const commonDirectory = await backend.commonDirectory();
		if (directories.has(commonDirectory)) throw new Error(`同一 Git 仓库不能重复登记（包括 linked worktree）：${entry.id}`);
		directories.add(commonDirectory);
		repositories.set(entry.id, backend);
		if (backend === coordinator) includesCoordinator = true;
	}
	if (!includesCoordinator) throw new Error(`仓库清单必须包含协调仓：${coordinator.root}`);
	return repositories;
}
