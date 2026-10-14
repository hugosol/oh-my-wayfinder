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

const roots: string[] = [];
const trees: string[] = [];

afterEach(async () => {
	await Promise.all(trees.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
	await Promise.all(roots.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Real `git` for fixtures; the module under test spawns its own subprocesses. */
async function cliRaw(cwd: string, args: readonly string[]): Promise<CliResult> {
	const child = Bun.spawn(["git", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { code, stdout, stderr };
}

async function cli(cwd: string, args: readonly string[]): Promise<string> {
	const result = await cliRaw(cwd, args);
	if (result.code !== 0) {
		throw new Error(
			`fixture git ${args.join(" ")} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
		);
	}
	return result.stdout;
}

async function write(file: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, content);
}

interface Repo {
	root: string;
	slug: string;
}

async function repo(options: { branch?: string; contract?: boolean; slug?: string } = {}): Promise<Repo> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "hyper-git-repo-"));
	roots.push(root);
	const slug = options.slug ?? "feature-x";
	await cli(root, ["init", "-q", "-b", options.branch ?? "integration"]);
	await cli(root, ["config", "user.email", "hyper-test@example.com"]);
	await cli(root, ["config", "user.name", "Hyper Test"]);
	await cli(root, ["config", "commit.gpgsign", "false"]);
	await cli(root, ["config", "core.autocrlf", "false"]);
	await write(path.join(root, ".scratch", slug, "spec.md"), "# Spec\n");
	if (options.contract !== false) await write(path.join(root, ".scratch", slug, "contract.md"), "# Contract\n");
	await cli(root, ["add", "--", `.scratch/${slug}`]);
	await cli(root, ["commit", "-q", "-m", "spec and contract"]);
	return { root, slug };
}

async function ticket(repo1: Repo, name: string, content = `# ${name}\n`): Promise<string> {
	const relative = `.scratch/${repo1.slug}/implementation/${name}`;
	await write(path.join(repo1.root, relative), content);
	return relative;
}

/** `createTicket` wrapper that guarantees temp worktrees are removed after the test. */
async function createTicket(git: HyperGit, name: string): Promise<TicketWorktree> {
	const tree = await git.createTicket(name);
	trees.push(tree.cwd);
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
	const repo1 = await repo();
	const git = await HyperGit.inspect(path.join(repo1.root, ".scratch", repo1.slug), repo1.slug);
	expect(git.root).toBe(await fs.realpath(repo1.root));
	expect(git.branch).toBe("integration");
	expect(await git.head()).toBe((await cli(repo1.root, ["rev-parse", "HEAD"])).trim());
});

test("inspect rejects main/master, detached HEAD, dirty state, missing spec/contract, and unsafe slugs", async () => {
	const main = await repo({ branch: "main" });
	await expect(HyperGit.inspect(main.root, main.slug)).rejects.toThrow(/集成分支不能是 main/);
	const master = await repo({ branch: "master" });
	await expect(HyperGit.inspect(master.root, master.slug)).rejects.toThrow(/集成分支不能是 master/);

	const detached = await repo();
	await cli(detached.root, ["checkout", "-q", "--detach"]);
	await expect(HyperGit.inspect(detached.root, detached.slug)).rejects.toThrow(/detached HEAD/);

	const modified = await repo();
	await write(path.join(modified.root, ".scratch", modified.slug, "spec.md"), "# Spec\nedited\n");
	await expect(HyperGit.inspect(modified.root, modified.slug)).rejects.toThrow(/不干净/);

	const untracked = await repo();
	await write(path.join(untracked.root, "loose.txt"), "loose\n");
	await expect(HyperGit.inspect(untracked.root, untracked.slug)).rejects.toThrow(/不干净/);

	const noContract = await repo({ contract: false });
	await expect(HyperGit.inspect(noContract.root, noContract.slug)).rejects.toThrow(/contract\.md/);

	const valid = await repo();
	for (const slug of ["../escape", "nested/slug", ".hidden", "trailing.", "", "with space"]) {
		await expect(HyperGit.inspect(valid.root, slug)).rejects.toThrow(/slug/);
	}

	const plain = await fs.mkdtemp(path.join(os.tmpdir(), "hyper-git-plain-"));
	roots.push(plain);
	await expect(HyperGit.inspect(plain, "feature")).rejects.toThrow(/git rev-parse/);
});

test("commitTickets stages only the implementation markdown files", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	const before = await git.head();
	await ticket(repo1, "01-server.md");
	await ticket(repo1, "02-client.md");
	await ticket(repo1, "03 [edge].md");
	await write(path.join(repo1.root, ".scratch", repo1.slug, "implementation", "notes.txt"), "not a ticket\n");
	await write(path.join(repo1.root, ".scratch", repo1.slug, "spec.md"), "# Spec\nedited but not staged\n");
	await write(path.join(repo1.root, "loose.txt"), "untracked\n");

	const published = await git.commitTickets();
	expect(published).not.toBe(before);
	expect(published).toBe(await git.head());
	const committed = (await cli(repo1.root, ["show", "--name-only", "--format=", "HEAD"])).trim().split("\n").sort();
	expect(committed).toEqual([
		`.scratch/${repo1.slug}/implementation/01-server.md`,
		`.scratch/${repo1.slug}/implementation/02-client.md`,
		`.scratch/${repo1.slug}/implementation/03 [edge].md`,
	]);
	expect((await cli(repo1.root, ["diff", "--cached", "--name-only"])).trim()).toBe("");
	const status = await cli(repo1.root, ["status", "--porcelain"]);
	expect(status).toContain(`.scratch/${repo1.slug}/spec.md`);
	expect(status).toContain("?? loose.txt");
	expect(status).toContain(`?? .scratch/${repo1.slug}/implementation/notes.txt`);

	// Retry: the ticket files already match HEAD, so nothing new is published.
	expect(await git.commitTickets()).toBe(published);
	expect((await cli(repo1.root, ["rev-parse", "HEAD"])).trim()).toBe(published);
});

test("commitTickets refuses unrelated staged edits and publishes nothing without tickets", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	const before = await git.head();
	const spec = `.scratch/${repo1.slug}/spec.md`;
	await write(path.join(repo1.root, spec), "# Spec\nstaged edit\n");
	await cli(repo1.root, ["add", "--", spec]);
	await ticket(repo1, "01.md");

	await expect(git.commitTickets()).rejects.toThrow(/无关/);
	expect(await git.head()).toBe(before);
	expect(await cli(repo1.root, ["diff", "--cached", "--name-only"])).toContain(spec);

	// A staged non-markdown file inside the ticket directory is equally foreign.
	await cli(repo1.root, ["reset", "-q", "--", spec]);
	const note = `.scratch/${repo1.slug}/implementation/notes.txt`;
	await write(path.join(repo1.root, note), "note\n");
	await cli(repo1.root, ["add", "--", note]);
	await expect(git.commitTickets()).rejects.toThrow(/无关/);
	await cli(repo1.root, ["reset", "-q", "--", note]);

	// No ticket files on disk: nothing to publish.
	await fs.rm(path.join(repo1.root, ".scratch", repo1.slug, "implementation"), { recursive: true, force: true });
	await expect(git.commitTickets()).rejects.toThrow(/票据/);
	expect(await git.head()).toBe(before);
});

test("createTicket bases on the latest integration tip, lives outside the repo, and is reused on retry", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	const tip0 = await git.head();

	const first = await createTicket(git, "01.md");
	const tempRoot = await fs.realpath(os.tmpdir());
	const resolvedCwd = await fs.realpath(first.cwd);
	expect(first.cwd).toBe(resolvedCwd);
	expect(resolvedCwd.startsWith(tempRoot + path.sep)).toBe(true);
	expect(path.basename(resolvedCwd).startsWith("hyper-ticket-")).toBe(true);
	expect(resolvedCwd.startsWith((await fs.realpath(repo1.root)) + path.sep)).toBe(false);
	expect((await cli(first.cwd, ["rev-parse", "HEAD"])).trim()).toBe(tip0);
	expect((await cli(first.cwd, ["symbolic-ref", "--short", "HEAD"])).trim()).toBe(first.branch);

	// Retry of the same ticket returns the same worktree, not another one.
	expect(await git.createTicket("01.md")).toEqual(first);
	const listedAfterRetry = (await cli(repo1.root, ["worktree", "list", "--porcelain"]))
		.split("\n")
		.filter((line) => line.startsWith("worktree "));
	expect(listedAfterRetry.length).toBe(2);

	// A later ticket starts from the newer integration tip, not the earlier one.
	await write(path.join(repo1.root, "later.txt"), "later\n");
	await cli(repo1.root, ["add", "--", "later.txt"]);
	await cli(repo1.root, ["commit", "-q", "-m", "later integration work"]);
	const tip1 = await git.head();
	expect(tip1).not.toBe(tip0);

	const second = await createTicket(git, "02.md");
	expect(second.branch).not.toBe(first.branch);
	expect((await cli(second.cwd, ["rev-parse", "HEAD"])).trim()).toBe(tip1);
	expect(await git.ticketHead(second)).toBe(tip1);

	// Branch names are unique per run and ticket.
	const otherRun = await HyperGit.inspect(repo1.root, repo1.slug);
	const otherTree = await createTicket(otherRun, "01.md");
	expect(otherTree.branch).not.toBe(first.branch);
	expect(otherTree.cwd).not.toBe(first.cwd);
});

test("mergeTicket merges --no-ff and is a no-op when the branch is already merged", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticket(repo1, "01.md");
	await git.commitTickets();
	const tree = await createTicket(git, "01.md");
	await write(path.join(tree.cwd, "result.txt"), "delivered by ticket\n");
	await cli(tree.cwd, ["add", "--", "result.txt"]);
	await cli(tree.cwd, ["commit", "-q", "-m", "deliver the slice"]);
	const ticketTip = await git.ticketHead(tree);
	expect(ticketTip).toBe((await cli(tree.cwd, ["rev-parse", "HEAD"])).trim());
	await expect(git.assertTicketClean(tree)).resolves.toBeUndefined();

	await git.mergeTicket(tree);

	const parents = (await cli(repo1.root, ["rev-list", "--parents", "-n", "1", "HEAD"])).trim().split(" ");
	expect(parents.length).toBe(3);
	expect(parents).toContain(ticketTip);
	expect(await fs.readFile(path.join(repo1.root, "result.txt"), "utf8")).toContain("delivered by ticket");
	await expect(git.mergeTicket(tree)).resolves.toBeUndefined();
});

test("mergeTicket requires the captured branch with a clean tree and an owned worktree", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticket(repo1, "01.md");
	await git.commitTickets();
	const tree = await createTicket(git, "01.md");

	await write(path.join(repo1.root, "dirty.txt"), "uncommitted\n");
	await expect(git.mergeTicket(tree)).rejects.toThrow(/不干净/);
	await fs.rm(path.join(repo1.root, "dirty.txt"));

	await cli(repo1.root, ["checkout", "-q", "-b", "elsewhere"]);
	await expect(git.mergeTicket(tree)).rejects.toThrow(/集成分支已切换/);
	await cli(repo1.root, ["checkout", "-q", "integration"]);

	await expect(git.mergeTicket({ branch: "not-ours", cwd: tree.cwd })).rejects.toThrow(/不属于本次运行/);
	await expect(git.mergeTicket(tree)).resolves.toBeUndefined();
});

test("mergeTicket leaves a conflict in place without reset or discard", async () => {
	const repo1 = await repo();
	await write(path.join(repo1.root, "shared.txt"), "base\n");
	await cli(repo1.root, ["add", "--", "shared.txt"]);
	await cli(repo1.root, ["commit", "-q", "-m", "shared base"]);
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticket(repo1, "01.md");
	await git.commitTickets();
	const tree = await createTicket(git, "01.md");
	await write(path.join(tree.cwd, "shared.txt"), "ticket side\n");
	await cli(tree.cwd, ["add", "--", "shared.txt"]);
	await cli(tree.cwd, ["commit", "-q", "-m", "ticket side"]);
	await write(path.join(repo1.root, "shared.txt"), "integration side\n");
	await cli(repo1.root, ["add", "--", "shared.txt"]);
	await cli(repo1.root, ["commit", "-q", "-m", "integration side"]);
	const before = await git.head();

	const failure = await capture(() => git.mergeTicket(tree));
	expect(failure.message).toContain("冲突");
	expect(failure.message).toContain(tree.branch);

	// Nothing was aborted, reset, or discarded: both sides and MERGE_HEAD remain.
	const content = await fs.readFile(path.join(repo1.root, "shared.txt"), "utf8");
	expect(content).toContain("<<<<<<<");
	expect(content).toContain("integration side");
	expect(content).toContain("ticket side");
	expect((await cliRaw(repo1.root, ["rev-parse", "--verify", "-q", "MERGE_HEAD"])).code).toBe(0);
	expect((await cli(repo1.root, ["ls-files", "--unmerged"])).trim()).not.toBe("");
	expect((await cli(repo1.root, ["rev-parse", "HEAD"])).trim()).toBe(before);
	await expect(git.assertClean()).rejects.toThrow(/未完成的合并/);
	await expect(git.mergeTicket(tree)).rejects.toThrow(/未完成的合并/);
});

test("assertClean and assertTicketClean reject switched branches and dirty worktrees", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticket(repo1, "01.md");
	await git.commitTickets();
	await expect(git.assertClean()).resolves.toBeUndefined();

	await write(path.join(repo1.root, ".scratch", repo1.slug, "spec.md"), "# Spec\nmodified\n");
	await expect(git.assertClean()).rejects.toThrow(/不干净/);
	await cli(repo1.root, ["checkout", "-q", "--", `.scratch/${repo1.slug}/spec.md`]);
	await write(path.join(repo1.root, "extra.txt"), "untracked\n");
	await expect(git.assertClean()).rejects.toThrow(/不干净/);
	await fs.rm(path.join(repo1.root, "extra.txt"));

	await cli(repo1.root, ["checkout", "-q", "-b", "another"]);
	await expect(git.assertClean()).rejects.toThrow(/集成分支已切换/);
	await cli(repo1.root, ["checkout", "-q", "integration"]);

	const tree = await createTicket(git, "01.md");
	await expect(git.assertTicketClean(tree)).resolves.toBeUndefined();
	await expect(git.assertTicketClean({ branch: "not-ours", cwd: tree.cwd })).rejects.toThrow(/不属于本次运行/);
	await write(path.join(tree.cwd, "wip.txt"), "wip\n");
	await expect(git.assertTicketClean(tree)).rejects.toThrow(/不干净/);
	await fs.rm(path.join(tree.cwd, "wip.txt"));
	await cli(tree.cwd, ["checkout", "-q", "-b", "side"]);
	await expect(git.assertTicketClean(tree)).rejects.toThrow(/已切换分支/);
});

test("cleanup removes only clean merged worktrees, keeps branches, and warns for dirty/unmerged", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticket(repo1, "01.md");
	await ticket(repo1, "02.md");
	await ticket(repo1, "03.md");
	await git.commitTickets();
	const merged = await createTicket(git, "01.md");
	const unmerged = await createTicket(git, "02.md");
	const dirty = await createTicket(git, "03.md");

	for (const [tree, file] of [
		[merged, "one.txt"],
		[unmerged, "two.txt"],
		[dirty, "three.txt"],
	] as const) {
		await write(path.join(tree.cwd, file), "work\n");
		await cli(tree.cwd, ["add", "--", file]);
		await cli(tree.cwd, ["commit", "-q", "-m", `work for ${tree.branch}`]);
	}
	await git.mergeTicket(merged);
	await git.mergeTicket(dirty);
	await write(path.join(dirty.cwd, "three.txt"), "work in progress\n");

	const warnings = await git.cleanup();
	expect(warnings.length).toBe(2);
	expect(warnings.join("\n")).toContain(unmerged.branch);
	expect(warnings.join("\n")).toContain(dirty.branch);
	expect(warnings.join("\n")).toContain("hyper-ticket-");

	await expect(fs.stat(merged.cwd)).rejects.toThrow();
	expect((await fs.stat(unmerged.cwd)).isDirectory()).toBe(true);
	expect((await fs.stat(dirty.cwd)).isDirectory()).toBe(true);

	const listed = (await cli(repo1.root, ["worktree", "list", "--porcelain"])).replace(/\\/g, "/");
	expect(listed).not.toContain(merged.cwd.replace(/\\/g, "/"));
	const branches = await cli(repo1.root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
	expect(branches).toContain(merged.branch);
	expect(branches).toContain(unmerged.branch);
	expect(branches).toContain(dirty.branch);
	expect([...git.worktrees.keys()].sort()).toEqual(["02.md", "03.md"]);

	// A second round still protects the unmerged and dirty worktrees.
	expect((await git.cleanup()).length).toBe(2);
});

test("cleanup keeps a worktree that no longer sits on its ticket branch", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await ticket(repo1, "01.md");
	await git.commitTickets();
	const tree = await createTicket(git, "01.md");
	await cli(tree.cwd, ["checkout", "-q", "--detach"]);

	const warnings = await git.cleanup();
	expect(warnings.length).toBe(1);
	expect(warnings[0]).toContain(tree.branch);
	expect((await fs.stat(tree.cwd)).isDirectory()).toBe(true);
	expect([...git.worktrees.keys()]).toEqual(["01.md"]);
});

test("commitFiles commits only explicit relative paths, refuses foreign staged edits, and returns HEAD when unchanged", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await write(path.join(repo1.root, "a.txt"), "a1\n");
	await write(path.join(repo1.root, "b.txt"), "b1\n");
	await cli(repo1.root, ["add", "--", "a.txt", "b.txt"]);
	await cli(repo1.root, ["commit", "-q", "-m", "add a and b"]);
	const before = await git.head();

	await write(path.join(repo1.root, "a.txt"), "a2\n");
	await write(path.join(repo1.root, "b.txt"), "b2\n");
	const after = await git.commitFiles(["a.txt"], "update a");
	expect(after).not.toBe(before);
	expect((await cli(repo1.root, ["show", "--name-only", "--format=", "HEAD"])).trim().split("\n")).toEqual(["a.txt"]);
	expect((await cli(repo1.root, ["status", "--porcelain"])).trim()).toBe("M b.txt");

	// Already committed: HEAD is returned instead of an empty commit.
	expect(await git.commitFiles(["a.txt"], "no-op")).toBe(after);
	expect((await cli(repo1.root, ["rev-parse", "HEAD"])).trim()).toBe(after);

	await expect(git.commitFiles([path.join(repo1.root, "a.txt")], "absolute")).rejects.toThrow(/绝对路径/);
	await expect(git.commitFiles(["../outside.txt"], "parent segment")).rejects.toThrow(/片段/);
	await expect(git.commitFiles(["nested\\file.txt"], "backslash")).rejects.toThrow(/分隔符/);
	await expect(git.commitFiles([""], "empty path")).rejects.toThrow(/非空/);
	await expect(git.commitFiles(["a.txt"], "   ")).rejects.toThrow(/提交信息/);

	// Foreign staged edits block the commit even when the requested path is unchanged.
	await cli(repo1.root, ["add", "--", "b.txt"]);
	await expect(git.commitFiles(["a.txt"], "blocked")).rejects.toThrow(/无关/);
	expect((await cli(repo1.root, ["rev-parse", "HEAD"])).trim()).toBe(after);

	// Explicit paths commit together once the index only holds what was asked for.
	await cli(repo1.root, ["reset", "-q", "--", "b.txt"]);
	await write(path.join(repo1.root, "a.txt"), "a3\n");
	await write(path.join(repo1.root, "b.txt"), "b3\n");
	const multi = await git.commitFiles(["a.txt", "b.txt"], "update a and b");
	expect(multi).toBe(await git.head());
	expect((await cli(repo1.root, ["show", "--name-only", "--format=", "HEAD"])).trim().split("\n").sort()).toEqual([
		"a.txt",
		"b.txt",
	]);
	expect((await cli(repo1.root, ["status", "--porcelain"])).trim()).toBe("");
	expect(await git.commitFiles([], "nothing to commit")).toBe(multi);
});

test("ticket and report publication refuse a switched integration branch before staging files", async () => {
	const repo1 = await repo();
	const git = await HyperGit.inspect(repo1.root, repo1.slug);
	await cli(repo1.root, ["switch", "-c", "another-feature"]);
	await ticket(repo1, "01-slice.md");
	await write(path.join(repo1.root, "report.md"), "# Report\n");
	await expect(git.commitTickets()).rejects.toThrow("集成分支已切换");
	await expect(git.commitFiles(["report.md"], "report")).rejects.toThrow("集成分支已切换");
	expect((await cli(repo1.root, ["diff", "--cached", "--name-only"])).trim()).toBe("");
});

test("smoke: the real git CLI backend drives the full ticket lifecycle", async () => {
	const repo1 = await repo({ slug: "smoke" });
	const git = await HyperGit.inspect(repo1.root, "smoke");
	await ticket(repo1, "01-slice.md", "# Ticket\nDeliver the slice.\n");
	const published = await git.commitTickets();
	expect(published).toBe(await git.head());

	const tree = await createTicket(git, "01-slice.md");
	await write(path.join(tree.cwd, "slice.txt"), "delivered\n");
	await cli(tree.cwd, ["add", "--", "slice.txt"]);
	await cli(tree.cwd, ["commit", "-q", "-m", "deliver the slice"]);
	expect(await git.ticketHead(tree)).toBe((await cli(tree.cwd, ["rev-parse", "HEAD"])).trim());
	await git.assertTicketClean(tree);

	await git.mergeTicket(tree);
	await git.assertClean();

	await write(path.join(repo1.root, ".scratch", "smoke", "retro", "01-slice.md", "run.md"), "# Retro\n");
	expect(await git.commitFiles([".scratch/smoke/retro/01-slice.md/run.md"], "add retro report")).toBe(await git.head());

	expect(await git.cleanup()).toEqual([]);
	await expect(fs.stat(tree.cwd)).rejects.toThrow();
	expect(await cli(repo1.root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])).toContain(tree.branch);
	expect((await cli(repo1.root, ["status", "--porcelain"])).trim()).toBe("");
});
