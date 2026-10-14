/**
 * Real-CLI tests for `HyperGit`: every fixture is a genuine temp Git repository
 * driven by the actual `git` binary, and the module under test spawns its own
 * `git` subprocesses, so nothing here is mocked.
 */

import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { HyperGit, type TicketWorktree } from "./git";
import { cleanupFixtures, git, gitRaw, initRepo, tempDir, ticketFile, trackTree, write } from "./test-support";

afterEach(cleanupFixtures);

/** `createTicket` wrapper that guarantees temp worktrees are removed after the test. */
async function createTicket(backend: HyperGit, name: string): Promise<TicketWorktree> {
	const tree = await backend.createTicket(name);
	trackTree(tree.cwd);
	return tree;
}

async function capture(action: () => Promise<unknown>): Promise<Error> {
	try {
		await action();
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
	throw new Error("expected the action to reject");
}

test("inspect captures the actual top-level checkout and its named branch", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(path.join(repo1.root, ".scratch", repo1.slug), repo1.slug);
	expect(backend.root).toBe(await fs.realpath(repo1.root));
	expect(backend.branch).toBe("integration");
	expect(await backend.head()).toBe((await git(repo1.root, "rev-parse", "HEAD")).trim());
});

test("inspect rejects main/master, detached HEAD, dirty state, missing spec/contract, and unsafe slugs", async () => {
	const main = await initRepo({ branch: "main" });
	await expect(HyperGit.inspect(main.root, main.slug)).rejects.toThrow(/集成分支不能是 main/);
	const master = await initRepo({ branch: "master" });
	await expect(HyperGit.inspect(master.root, master.slug)).rejects.toThrow(/集成分支不能是 master/);

	const detached = await initRepo();
	await git(detached.root, "checkout", "-q", "--detach");
	await expect(HyperGit.inspect(detached.root, detached.slug)).rejects.toThrow(/detached HEAD/);

	const modified = await initRepo();
	await write(path.join(modified.root, ".scratch", modified.slug, "spec.md"), "# Spec\nedited\n");
	await expect(HyperGit.inspect(modified.root, modified.slug)).rejects.toThrow(/不干净/);

	const untracked = await initRepo();
	await write(path.join(untracked.root, "loose.txt"), "loose\n");
	await expect(HyperGit.inspect(untracked.root, untracked.slug)).rejects.toThrow(/不干净/);

	const noContract = await initRepo({ contract: false });
	await expect(HyperGit.inspect(noContract.root, noContract.slug)).rejects.toThrow(/contract\.md/);

	const valid = await initRepo();
	for (const slug of ["../escape", "nested/slug", ".hidden", "trailing.", "", "with space"]) {
		await expect(HyperGit.inspect(valid.root, slug)).rejects.toThrow(/slug/);
	}

	const plain = await tempDir("hyper-git-plain-");
	await expect(HyperGit.inspect(plain, "feature")).rejects.toThrow(/git rev-parse/);
});

test("commitTickets stages only the implementation markdown files", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	const before = await backend.head();
	await ticketFile(repo1, "01-server.md");
	await ticketFile(repo1, "02-client.md");
	await ticketFile(repo1, "03 [edge].md");
	await write(path.join(repo1.root, ".scratch", repo1.slug, "implementation", "notes.txt"), "not a ticket\n");
	await write(path.join(repo1.root, ".scratch", repo1.slug, "spec.md"), "# Spec\nedited but not staged\n");
	await write(path.join(repo1.root, "loose.txt"), "untracked\n");

	const published = await backend.commitTickets();
	expect(published).not.toBe(before);
	expect(published).toBe(await backend.head());
	const committed = (await git(repo1.root, "show", "--name-only", "--format=", "HEAD")).trim().split("\n").sort();
	expect(committed).toEqual([
		`.scratch/${repo1.slug}/implementation/01-server.md`,
		`.scratch/${repo1.slug}/implementation/02-client.md`,
		`.scratch/${repo1.slug}/implementation/03 [edge].md`,
	]);
	expect((await git(repo1.root, "diff", "--cached", "--name-only")).trim()).toBe("");
	const status = await git(repo1.root, "status", "--porcelain");
	expect(status).toContain(`.scratch/${repo1.slug}/spec.md`);
	expect(status).toContain("?? loose.txt");
	expect(status).toContain(`?? .scratch/${repo1.slug}/implementation/notes.txt`);

	// Retry: the ticket files already match HEAD, so nothing new is published.
	expect(await backend.commitTickets()).toBe(published);
	expect((await git(repo1.root, "rev-parse", "HEAD")).trim()).toBe(published);
});

test("commitTickets refuses unrelated staged edits and publishes nothing without tickets", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	const before = await backend.head();
	const spec = `.scratch/${repo1.slug}/spec.md`;
	await write(path.join(repo1.root, spec), "# Spec\nstaged edit\n");
	await git(repo1.root, "add", "--", spec);
	await ticketFile(repo1, "01.md");

	await expect(backend.commitTickets()).rejects.toThrow(/无关/);
	expect(await backend.head()).toBe(before);
	expect(await git(repo1.root, "diff", "--cached", "--name-only")).toContain(spec);

	// A staged non-markdown file inside the ticket directory is equally foreign.
	await git(repo1.root, "reset", "-q", "--", spec);
	const note = `.scratch/${repo1.slug}/implementation/notes.txt`;
	await write(path.join(repo1.root, note), "note\n");
	await git(repo1.root, "add", "--", note);
	await expect(backend.commitTickets()).rejects.toThrow(/无关/);
	await git(repo1.root, "reset", "-q", "--", note);

	// No ticket files on disk: nothing to publish.
	await fs.rm(path.join(repo1.root, ".scratch", repo1.slug, "implementation"), { recursive: true, force: true });
	await expect(backend.commitTickets()).rejects.toThrow(/票据/);
	expect(await backend.head()).toBe(before);
});

test("createTicket bases on the latest integration tip, lives outside the repo, and is reused on retry", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	const tip0 = await backend.head();

	const first = await createTicket(backend, "01.md");
	const tempRoot = await fs.realpath(os.tmpdir());
	const resolvedCwd = await fs.realpath(first.cwd);
	expect(first.cwd).toBe(resolvedCwd);
	expect(resolvedCwd.startsWith(tempRoot + path.sep)).toBe(true);
	expect(path.basename(resolvedCwd).startsWith("hyper-ticket-")).toBe(true);
	expect(resolvedCwd.startsWith((await fs.realpath(repo1.root)) + path.sep)).toBe(false);
	expect((await git(first.cwd, "rev-parse", "HEAD")).trim()).toBe(tip0);
	expect((await git(first.cwd, "symbolic-ref", "--short", "HEAD")).trim()).toBe(first.branch);

	// Retry of the same ticket returns the same worktree, not another one.
	expect(await backend.createTicket("01.md")).toEqual(first);
	const listedAfterRetry = (await git(repo1.root, "worktree", "list", "--porcelain"))
		.split("\n")
		.filter((line) => line.startsWith("worktree "));
	expect(listedAfterRetry.length).toBe(2);

	// A later ticket starts from the newer integration tip, not the earlier one.
	await write(path.join(repo1.root, "later.txt"), "later\n");
	await git(repo1.root, "add", "--", "later.txt");
	await git(repo1.root, "commit", "-q", "-m", "later integration work");
	const tip1 = await backend.head();
	expect(tip1).not.toBe(tip0);

	const second = await createTicket(backend, "02.md");
	expect(second.branch).not.toBe(first.branch);
	expect((await git(second.cwd, "rev-parse", "HEAD")).trim()).toBe(tip1);
	expect(await backend.ticketHead(second)).toBe(tip1);

	// Branch names are unique per run and ticket.
	const otherRun = await HyperGit.inspect(repo1.root, repo1.slug);
	const otherTree = await createTicket(otherRun, "01.md");
	expect(otherTree.branch).not.toBe(first.branch);
	expect(otherTree.cwd).not.toBe(first.cwd);
});

test("mergeTicket merges --no-ff and is a no-op when the branch is already merged", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticketFile(repo1, "01.md");
	await backend.commitTickets();
	const tree = await createTicket(backend, "01.md");
	await write(path.join(tree.cwd, "result.txt"), "delivered by ticket\n");
	await git(tree.cwd, "add", "--", "result.txt");
	await git(tree.cwd, "commit", "-q", "-m", "deliver the slice");
	const ticketTip = await backend.ticketHead(tree);
	expect(ticketTip).toBe((await git(tree.cwd, "rev-parse", "HEAD")).trim());
	await expect(backend.assertTicketClean(tree)).resolves.toBeUndefined();

	await backend.mergeTicket(tree);

	const parents = (await git(repo1.root, "rev-list", "--parents", "-n", "1", "HEAD")).trim().split(" ");
	expect(parents.length).toBe(3);
	expect(parents).toContain(ticketTip);
	expect(await fs.readFile(path.join(repo1.root, "result.txt"), "utf8")).toContain("delivered by ticket");
	await expect(backend.mergeTicket(tree)).resolves.toBeUndefined();
});

test("mergeTicket requires the captured branch with a clean tree and an owned worktree", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticketFile(repo1, "01.md");
	await backend.commitTickets();
	const tree = await createTicket(backend, "01.md");

	await write(path.join(repo1.root, "dirty.txt"), "uncommitted\n");
	await expect(backend.mergeTicket(tree)).rejects.toThrow(/不干净/);
	await fs.rm(path.join(repo1.root, "dirty.txt"));

	await git(repo1.root, "checkout", "-q", "-b", "elsewhere");
	await expect(backend.mergeTicket(tree)).rejects.toThrow(/集成分支已切换/);
	await git(repo1.root, "checkout", "-q", "integration");

	await expect(backend.mergeTicket({ branch: "not-ours", cwd: tree.cwd })).rejects.toThrow(/不属于本次运行/);
	await expect(backend.mergeTicket(tree)).resolves.toBeUndefined();
});

test("mergeTicket leaves a conflict in place without reset or discard", async () => {
	const repo1 = await initRepo();
	await write(path.join(repo1.root, "shared.txt"), "base\n");
	await git(repo1.root, "add", "--", "shared.txt");
	await git(repo1.root, "commit", "-q", "-m", "shared base");
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticketFile(repo1, "01.md");
	await backend.commitTickets();
	const tree = await createTicket(backend, "01.md");
	await write(path.join(tree.cwd, "shared.txt"), "ticket side\n");
	await git(tree.cwd, "add", "--", "shared.txt");
	await git(tree.cwd, "commit", "-q", "-m", "ticket side");
	await write(path.join(repo1.root, "shared.txt"), "integration side\n");
	await git(repo1.root, "add", "--", "shared.txt");
	await git(repo1.root, "commit", "-q", "-m", "integration side");
	const before = await backend.head();

	const failure = await capture(() => backend.mergeTicket(tree));
	expect(failure.message).toContain("冲突");
	expect(failure.message).toContain(tree.branch);

	// Nothing was aborted, reset, or discarded: both sides and MERGE_HEAD remain.
	const content = await fs.readFile(path.join(repo1.root, "shared.txt"), "utf8");
	expect(content).toContain("<<<<<<<");
	expect(content).toContain("integration side");
	expect(content).toContain("ticket side");
	expect((await gitRaw(repo1.root, ["rev-parse", "--verify", "-q", "MERGE_HEAD"])).code).toBe(0);
	expect((await git(repo1.root, "ls-files", "--unmerged")).trim()).not.toBe("");
	expect((await git(repo1.root, "rev-parse", "HEAD")).trim()).toBe(before);
	await expect(backend.assertClean()).rejects.toThrow(/未完成的合并/);
	await expect(backend.mergeTicket(tree)).rejects.toThrow(/未完成的合并/);
});

test("assertClean and assertTicketClean reject switched branches and dirty worktrees", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticketFile(repo1, "01.md");
	await backend.commitTickets();
	await expect(backend.assertClean()).resolves.toBeUndefined();

	await write(path.join(repo1.root, ".scratch", repo1.slug, "spec.md"), "# Spec\nmodified\n");
	await expect(backend.assertClean()).rejects.toThrow(/不干净/);
	await git(repo1.root, "checkout", "-q", "--", `.scratch/${repo1.slug}/spec.md`);
	await write(path.join(repo1.root, "extra.txt"), "untracked\n");
	await expect(backend.assertClean()).rejects.toThrow(/不干净/);
	await fs.rm(path.join(repo1.root, "extra.txt"));

	await git(repo1.root, "checkout", "-q", "-b", "another");
	await expect(backend.assertClean()).rejects.toThrow(/集成分支已切换/);
	await git(repo1.root, "checkout", "-q", "integration");

	const tree = await createTicket(backend, "01.md");
	await expect(backend.assertTicketClean(tree)).resolves.toBeUndefined();
	await expect(backend.assertTicketClean({ branch: "not-ours", cwd: tree.cwd })).rejects.toThrow(/不属于本次运行/);
	await write(path.join(tree.cwd, "wip.txt"), "wip\n");
	await expect(backend.assertTicketClean(tree)).rejects.toThrow(/不干净/);
	await fs.rm(path.join(tree.cwd, "wip.txt"));
	await git(tree.cwd, "checkout", "-q", "-b", "side");
	await expect(backend.assertTicketClean(tree)).rejects.toThrow(/已切换分支/);
});

test("cleanup removes only clean merged worktrees, keeps branches, and warns for dirty/unmerged", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticketFile(repo1, "01.md");
	await ticketFile(repo1, "02.md");
	await ticketFile(repo1, "03.md");
	await backend.commitTickets();
	const merged = await createTicket(backend, "01.md");
	const unmerged = await createTicket(backend, "02.md");
	const dirty = await createTicket(backend, "03.md");

	for (const [tree, file] of [
		[merged, "one.txt"],
		[unmerged, "two.txt"],
		[dirty, "three.txt"],
	] as const) {
		await write(path.join(tree.cwd, file), "work\n");
		await git(tree.cwd, "add", "--", file);
		await git(tree.cwd, "commit", "-q", "-m", `work for ${tree.branch}`);
	}
	await backend.mergeTicket(merged);
	await backend.mergeTicket(dirty);
	await write(path.join(dirty.cwd, "three.txt"), "work in progress\n");

	const warnings = await backend.cleanup();
	expect(warnings.length).toBe(2);
	expect(warnings.join("\n")).toContain(unmerged.branch);
	expect(warnings.join("\n")).toContain(dirty.branch);
	expect(warnings.join("\n")).toContain("hyper-ticket-");

	await expect(fs.stat(merged.cwd)).rejects.toThrow();
	expect((await fs.stat(unmerged.cwd)).isDirectory()).toBe(true);
	expect((await fs.stat(dirty.cwd)).isDirectory()).toBe(true);

	const listed = (await git(repo1.root, "worktree", "list", "--porcelain")).replace(/\\/g, "/");
	expect(listed).not.toContain(merged.cwd.replace(/\\/g, "/"));
	const branches = await git(repo1.root, "for-each-ref", "--format=%(refname:short)", "refs/heads");
	expect(branches).toContain(merged.branch);
	expect(branches).toContain(unmerged.branch);
	expect(branches).toContain(dirty.branch);
	expect([...backend.worktrees.keys()].sort()).toEqual(["02.md", "03.md"]);

	// A second round still protects the unmerged and dirty worktrees.
	expect((await backend.cleanup()).length).toBe(2);
});

test("cleanup keeps a worktree that no longer sits on its ticket branch", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticketFile(repo1, "01.md");
	await backend.commitTickets();
	const tree = await createTicket(backend, "01.md");
	await git(tree.cwd, "checkout", "-q", "--detach");

	const warnings = await backend.cleanup();
	expect(warnings.length).toBe(1);
	expect(warnings[0]).toContain(tree.branch);
	expect((await fs.stat(tree.cwd)).isDirectory()).toBe(true);
	expect([...backend.worktrees.keys()]).toEqual(["01.md"]);
});

test("commitFiles commits only explicit relative paths, refuses foreign staged edits, and returns HEAD when unchanged", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await write(path.join(repo1.root, "a.txt"), "a1\n");
	await write(path.join(repo1.root, "b.txt"), "b1\n");
	await git(repo1.root, "add", "--", "a.txt", "b.txt");
	await git(repo1.root, "commit", "-q", "-m", "add a and b");
	const before = await backend.head();

	await write(path.join(repo1.root, "a.txt"), "a2\n");
	await write(path.join(repo1.root, "b.txt"), "b2\n");
	const after = await backend.commitFiles(["a.txt"], "update a");
	expect(after).not.toBe(before);
	expect((await git(repo1.root, "show", "--name-only", "--format=", "HEAD")).trim().split("\n")).toEqual(["a.txt"]);
	expect((await git(repo1.root, "status", "--porcelain")).trim()).toBe("M b.txt");

	// Already committed: HEAD is returned instead of an empty commit.
	expect(await backend.commitFiles(["a.txt"], "no-op")).toBe(after);
	expect((await git(repo1.root, "rev-parse", "HEAD")).trim()).toBe(after);

	await expect(backend.commitFiles([path.join(repo1.root, "a.txt")], "absolute")).rejects.toThrow(/绝对路径/);
	await expect(backend.commitFiles(["../outside.txt"], "parent segment")).rejects.toThrow(/片段/);
	await expect(backend.commitFiles(["nested\\file.txt"], "backslash")).rejects.toThrow(/分隔符/);
	await expect(backend.commitFiles([""], "empty path")).rejects.toThrow(/非空/);
	await expect(backend.commitFiles(["a.txt"], "   ")).rejects.toThrow(/提交信息/);

	// Foreign staged edits block the commit even when the requested path is unchanged.
	await git(repo1.root, "add", "--", "b.txt");
	await expect(backend.commitFiles(["a.txt"], "blocked")).rejects.toThrow(/无关/);
	expect((await git(repo1.root, "rev-parse", "HEAD")).trim()).toBe(after);

	// Explicit paths commit together once the index only holds what was asked for.
	await git(repo1.root, "reset", "-q", "--", "b.txt");
	await write(path.join(repo1.root, "a.txt"), "a3\n");
	await write(path.join(repo1.root, "b.txt"), "b3\n");
	const multi = await backend.commitFiles(["a.txt", "b.txt"], "update a and b");
	expect(multi).toBe(await backend.head());
	expect((await git(repo1.root, "show", "--name-only", "--format=", "HEAD")).trim().split("\n").sort()).toEqual([
		"a.txt",
		"b.txt",
	]);
	expect((await git(repo1.root, "status", "--porcelain")).trim()).toBe("");
	expect(await backend.commitFiles([], "nothing to commit")).toBe(multi);
});

test("ticket and report publication refuse a switched integration branch before staging files", async () => {
	const repo1 = await initRepo();
	const backend = await HyperGit.inspect(repo1.root, repo1.slug);
	await git(repo1.root, "switch", "-c", "another-feature");
	await ticketFile(repo1, "01-slice.md");
	await write(path.join(repo1.root, "report.md"), "# Report\n");
	await expect(backend.commitTickets()).rejects.toThrow("集成分支已切换");
	await expect(backend.commitFiles(["report.md"], "report")).rejects.toThrow("集成分支已切换");
	expect((await git(repo1.root, "diff", "--cached", "--name-only")).trim()).toBe("");
});

test("smoke: the real git CLI backend drives the full ticket lifecycle", async () => {
	const repo1 = await initRepo({ slug: "smoke" });
	const backend = await HyperGit.inspect(repo1.root, "smoke");
	await ticketFile(repo1, "01-slice.md", "# Ticket\nDeliver the slice.\n");
	const published = await backend.commitTickets();
	expect(published).toBe(await backend.head());

	const tree = await createTicket(backend, "01-slice.md");
	await write(path.join(tree.cwd, "slice.txt"), "delivered\n");
	await git(tree.cwd, "add", "--", "slice.txt");
	await git(tree.cwd, "commit", "-q", "-m", "deliver the slice");
	expect(await backend.ticketHead(tree)).toBe((await git(tree.cwd, "rev-parse", "HEAD")).trim());
	await backend.assertTicketClean(tree);

	await backend.mergeTicket(tree);
	await backend.assertClean();

	await write(path.join(repo1.root, ".scratch", "smoke", "retro", "01-slice.md", "run.md"), "# Retro\n");
	expect(await backend.commitFiles([".scratch/smoke/retro/01-slice.md/run.md"], "add retro report")).toBe(
		await backend.head(),
	);

	expect(await backend.cleanup()).toEqual([]);
	await expect(fs.stat(tree.cwd)).rejects.toThrow();
	expect(await git(repo1.root, "for-each-ref", "--format=%(refname:short)", "refs/heads")).toContain(tree.branch);
	expect((await git(repo1.root, "status", "--porcelain")).trim()).toBe("");
});
