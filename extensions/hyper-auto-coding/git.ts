/**
 * Hyper auto-coding Git plumbing: real-argv `git` subprocesses over one
 * integration checkout plus one external worktree per ticket.
 *
 * The workflow this serves starts on a clean local integration branch with
 * `.scratch/<slug>/spec.md` and `.scratch/<slug>/contract.md` already committed,
 * publishes implementation tickets, runs TDD in per-ticket worktrees under the
 * OS temp directory, and merges each ticket back serially. The rules that keep
 * that safe:
 *
 *  - every call is an argv array (`Bun.spawn`), never a shell string;
 *  - `commitTickets`/`commitFiles` only ever stage the exact paths they were
 *    asked to commit and refuse preexisting staged edits outside that set;
 *  - merges and ticket creation share one FIFO lock per run, so no two of them
 *    ever overlap on the integration checkout;
 *  - a conflicting integration-side merge is aborted and retried inside the
 *    ticket worktree (never a new or temporary worktree): the conflict stays
 *    there for the integration agent, and nothing is reset or discarded;
 *  - `cleanup` never passes `--force`, never deletes a branch, and only removes
 *    worktrees that are clean and already merged into the integration branch.
 */

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/** One ticket worktree: the branch it owns and the external directory it lives in. */
export interface TicketWorktree {
	branch: string;
	cwd: string;
}

/** What one `mergeTicket` call did to the integration branch and the ticket worktree. */
export interface MergeTicketResult {
	/** True when the ticket branch is now merged into the integration branch. */
	merged: boolean;
	/** True when the ticket worktree still holds an unresolved merge to finish. */
	conflicts: boolean;
	/**
	 * Integration-branch commit this call settled on inside its lock: the new
	 * merge commit, or the unchanged tip after an aborted conflicting merge.
	 */
	head: string;
}

/** Raw outcome of one `git` subprocess. */
interface GitResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Ticket worktrees are `mkdtemp` directories with this prefix under the OS temp root. */
const WORKTREE_PREFIX = "hyper-ticket-";

/** One safe `.scratch/` path segment: alphanumeric start, no separators, no trailing dot. */
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_SLUG_LENGTH = 64;

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Compact git output for error messages without dumping whole merge transcripts. */
function firstLines(text: string, max = 12): string {
	return text
		.trim()
		.split(/\r?\n/)
		.filter((line) => line !== "")
		.slice(0, max)
		.join("\n");
}

/**
 * Literal pathspec: ticket names or report paths may contain glob characters
 * (`[`, `*`, `?`), and a bare pathspec would expand them instead of matching.
 */
function literal(file: string): string {
	return `:(literal)${file}`;
}

/** Run one real `git` subprocess; argv only, no shell, no interpolation. */
async function git(cwd: string, args: readonly string[]): Promise<GitResult> {
	let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
	try {
		child = Bun.spawn(["git", ...args], {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
		});
	} catch (error) {
		throw new Error(`无法启动 git（git ${args.join(" ")}）：${errorText(error)}；请确认 git 在 PATH 中`);
	}
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { code, stdout, stderr };
}

/** Run one `git` subprocess and throw (with its own output) on a non-zero exit. */
async function mustGit(cwd: string, args: readonly string[]): Promise<string> {
	const result = await git(cwd, args);
	if (result.code !== 0) {
		throw new Error(
			`git ${args.join(" ")} 执行失败（退出码 ${result.code}）：${firstLines(result.stderr || result.stdout) || "无输出"}`,
		);
	}
	return result.stdout;
}

/** Reject a slug that is not one safe `.scratch/` path segment. */
function assertSlug(slug: string): void {
	if (typeof slug !== "string" || !SLUG_PATTERN.test(slug) || slug.endsWith(".") || slug.length > MAX_SLUG_LENGTH) {
		throw new Error(
			`slug 必须是安全的单段路径（字母或数字开头，仅含 A-Za-z0-9._-，不以点结尾，最长 ${MAX_SLUG_LENGTH} 字符）：${JSON.stringify(slug)}`,
		);
	}
}

/** `git worktree list --porcelain` parsed into branch-ref → path plus every registered path. */
function registeredWorktrees(porcelain: string): { branches: Map<string, string>; paths: string[] } {
	const branches = new Map<string, string>();
	const paths: string[] = [];
	let current: string | undefined;
	for (const line of porcelain.split("\n")) {
		if (line.startsWith("worktree ")) {
			current = line.slice("worktree ".length).trim();
			if (current !== "") paths.push(current);
		} else if (line.startsWith("branch ") && current !== undefined) {
			branches.set(line.slice("branch ".length).trim(), current);
		} else if (line === "") {
			current = undefined;
		}
	}
	return { branches, paths };
}

/** True when `candidate` resolves to a `hyper-ticket-*` mkdtemp directory under the OS temp root. */
async function underTempWorktreeRoot(candidate: string): Promise<boolean> {
	try {
		const [resolved, temp] = await Promise.all([fs.realpath(candidate), fs.realpath(os.tmpdir())]);
		const relative = path.relative(temp, resolved);
		if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return false;
		return relative.split(path.sep)[0]!.startsWith(WORKTREE_PREFIX);
	} catch {
		return false;
	}
}

/**
 * One run's Git surface: a captured integration checkout plus every ticket
 * worktree this run created. Never constructed directly; `inspect` validates
 * the repository and captures the branch first, and `adopt` rebuilds the same
 * surface from a paused checkpoint without validation.
 */
export class HyperGit {
	/** Resolved top-level working tree of the integration repository. */
	readonly root: string;
	/** Named branch the integration checkout was on at `inspect` time; never main/master. */
	readonly branch: string;
	/** Ticket worktrees created by this run, keyed by the ticket name passed to `createTicket`. */
	readonly worktrees = new Map<string, TicketWorktree>();

	#slug: string;
	/** Random per-run token that keeps ticket branches unique across runs. */
	#runToken: string;
	/** Tail of this run's FIFO queue over the integration checkout; see `#withLock`. */
	#queue: Promise<void> = Promise.resolve();

	private constructor(root: string, branch: string, slug: string) {
		this.root = root;
		this.branch = branch;
		this.#slug = slug;
		this.#runToken = randomUUID().replace(/-/g, "").slice(0, 12);
	}

	/**
	 * Validate `cwd`'s actual top-level repository as the integration checkout:
	 * a named branch other than main/master, a clean tree and index, and
	 * committed tracked `.scratch/<slug>/spec.md` plus `contract.md`.
	 */
	static async inspect(cwd: string, slug: string): Promise<HyperGit> {
		assertSlug(slug);
		const top = (await mustGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
		if (top === "") throw new Error(`无法解析 Git 顶层目录（git rev-parse --show-toplevel 无输出）：${cwd}`);
		const root = await fs.realpath(top);

		const branchResult = await git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
		const branch = branchResult.stdout.trim();
		if (branchResult.code !== 0 || branch === "") {
			throw new Error(`仓库处于 detached HEAD；hyper auto-coding 需要命名集成分支：${root}`);
		}
		if (branch === "main" || branch === "master") {
			throw new Error(`集成分支不能是 ${branch}；请在本地集成分支上运行：${root}`);
		}

		const status = await mustGit(root, ["status", "--porcelain"]);
		if (status.trim() !== "") {
			throw new Error(`集成分支工作区或暂存区不干净；请先提交或清理：\n${status.trimEnd()}`);
		}

		for (const name of ["spec.md", "contract.md"]) {
			const file = `.scratch/${slug}/${name}`;
			const tracked = await git(root, ["ls-files", "--error-unmatch", "--", literal(file)]);
			if (tracked.code !== 0) {
				throw new Error(`缺少已提交并被跟踪的 ${file}（spec 与 contract 必须先提交到集成分支）：${root}`);
			}
		}

		return new HyperGit(root, branch, slug);
	}

	/**
	 * Rebuild the Git surface of a paused run from its checkpoint without
	 * touching the repository. The integration checkout and every recorded
	 * ticket worktree already exist on disk, so nothing is created, committed,
	 * or re-validated; a fresh run token keeps retries of never-started tickets
	 * on new branches while already-created worktrees keep their own.
	 */
	static adopt(root: string, branch: string, slug: string, worktrees: readonly (readonly [string, TicketWorktree])[]): HyperGit {
		const adopted = new HyperGit(root, branch, slug);
		for (const [ticket, tree] of worktrees) adopted.worktrees.set(ticket, { branch: tree.branch, cwd: tree.cwd });
		return adopted;
	}

	/** Current integration HEAD commit SHA. */
	async head(): Promise<string> {
		return (await mustGit(this.root, ["rev-parse", "HEAD"])).trim();
	}

	/**
	 * Stage and commit exactly the implementation `.md` files phase 1 published
	 * under `.scratch/<slug>/implementation/`. Refuses when anything else is
	 * staged; when the ticket files already match HEAD the current HEAD is
	 * returned without creating an empty commit.
	 */
	async commitTickets(): Promise<string> {
		const files = await this.#implementationFiles();
		if (files.length === 0) {
			throw new Error(`实现票据目录中没有 *.md 票据文件：.scratch/${this.#slug}/implementation`);
		}
		await this.#rejectForeignStaged(files);
		return this.#commitStagedPaths(files, `Publish implementation tickets for ${this.#slug}`);
	}

	/**
	 * Create the ticket worktree used by every execution attempt of that ticket.
	 * The branch is named uniquely per run and ticket, based on the integration
	 * branch's tip at call time, and lives in an OS-temp directory outside the
	 * repository. A repeated call for the same ticket returns the same worktree
	 * so retries keep their work. Creation waits for the integration-checkout
	 * lock, so a concurrent merge can never base a branch on a half-merged tip.
	 */
	async createTicket(ticket: string): Promise<TicketWorktree> {
		const existing = this.worktrees.get(ticket);
		if (existing !== undefined) return existing;
		return this.#withLock(async () => {
			const raced = this.worktrees.get(ticket);
			if (raced !== undefined) return raced;
			return this.#createTicket(ticket);
		});
	}

	/** Body of `createTicket`, already holding the integration-checkout lock. */
	async #createTicket(ticket: string): Promise<TicketWorktree> {
		const current = await this.#currentBranch();
		if (current !== this.branch) {
			throw new Error(`集成分支已切换（期望 ${this.branch}，实际 ${current ?? "detached HEAD"}），拒绝创建票据工作树`);
		}
		const base = await this.head();
		const branch = await this.#freshTicketBranch(ticket);

		const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), WORKTREE_PREFIX));
		let added = false;
		try {
			await mustGit(this.root, ["worktree", "add", "-b", branch, directory, base]);
			added = true;
			const cwd = await fs.realpath(directory);
			const checkedOut = (await mustGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
			if (checkedOut !== branch) {
				throw new Error(`票据工作树未检出预期分支（期望 ${branch}，实际 ${checkedOut || "detached HEAD"}）：${cwd}`);
			}
			const tree: TicketWorktree = { branch, cwd };
			this.worktrees.set(ticket, tree);
			return tree;
		} catch (error) {
			// Leave nothing behind when creation failed before the worktree was recorded.
			if (added) await git(this.root, ["worktree", "remove", "--", directory]);
			await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
			throw error;
		}
	}

	/**
	 * Merge one ticket worktree's branch into the captured integration branch
	 * with `--no-ff`, after re-checking that the checkout is still on that branch
	 * with a clean tree and index. The whole cycle — merge, abort, reverse merge —
	 * runs inside this run's FIFO lock, so concurrent tickets serialise on the
	 * integration checkout and each caller sees the tip the previous one left.
	 *
	 * A conflicting integration-side merge is aborted first, leaving the
	 * integration branch exactly where it was, and the same integration commit is
	 * then merged into the ticket worktree: unresolved conflicts always stay in
	 * the original ticket worktree for the integration agent, never in the
	 * integration checkout and never in a new worktree. `syncAfterSuccess` also
	 * merges that integration commit into the ticket worktree when the
	 * integration-side merge succeeded, so the first integration attempt starts
	 * from the tip this call produced. Failures that are not conflicts throw: they
	 * must never be reported as a completed merge.
	 */
	async mergeTicket(worktree: TicketWorktree, syncAfterSuccess: boolean): Promise<MergeTicketResult> {
		const owned = this.#owned(worktree);
		return this.#withLock(async () => {
			await this.assertClean();
			const merged = await git(this.root, [
				"merge",
				"--no-ff",
				"-m",
				`Merge ticket branch ${owned.branch}`,
				`refs/heads/${owned.branch}`,
			]);
			if (merged.code === 0) {
				const head = await this.head();
				if (!syncAfterSuccess) return { merged: true, conflicts: false, head };
				return { merged: true, conflicts: await this.#syncTicket(owned, head), head };
			}
			const output = firstLines(merged.stderr || merged.stdout) || "无输出";
			if (!(await this.#mergeInProgress(this.root))) {
				throw new Error(`合并 ${owned.branch} 失败（退出码 ${merged.code}）：${output}`);
			}
			const aborted = await git(this.root, ["merge", "--abort"]);
			if (aborted.code !== 0) {
				throw new Error(
					`合并 ${owned.branch} 冲突后无法中止集成分支合并（退出码 ${aborted.code}）：${firstLines(aborted.stderr || aborted.stdout) || "无输出"}；请手工处理：${this.root}`,
				);
			}
			const head = await this.head();
			return { merged: false, conflicts: await this.#syncTicket(owned, head), head };
		});
	}

	/**
	 * Merge the integration commit this call settled on into the ticket worktree,
	 * fast-forwarding when the ticket branch is behind. A conflicting sync is left
	 * in the ticket worktree for the integration agent to resolve and commit, and
	 * reports `true`; every other failure throws, because the integration commit
	 * is not in the ticket worktree and the caller must not treat it as merged.
	 */
	async #syncTicket(owned: TicketWorktree, head: string): Promise<boolean> {
		await this.assertTicketClean(owned);
		const result = await git(owned.cwd, [
			"merge",
			"-m",
			`Merge integration branch ${this.branch} into ${owned.branch}`,
			head,
		]);
		if (result.code === 0) return false;
		if (await this.#mergeInProgress(owned.cwd)) return true;
		throw new Error(
			`无法把集成分支 ${this.branch}（${head}）同步到票据工作树（退出码 ${result.code}）：${firstLines(result.stderr || result.stdout) || "无输出"}（${owned.cwd}）`,
		);
	}

	/**
	 * Commit only the explicitly given repository-relative paths. Refuses
	 * preexisting staged edits outside that set; when the paths already match
	 * HEAD the current HEAD is returned without creating an empty commit.
	 */
	async commitFiles(files: readonly string[], message: string): Promise<string> {
		if (typeof message !== "string" || message.trim() === "") {
			throw new Error("提交信息不能为空");
		}
		const paths = [...new Set(files.map((file) => this.#relativePath(file)))];
		await this.#rejectForeignStaged(paths);
		if (paths.length === 0) return this.head();
		return this.#commitStagedPaths(paths, message);
	}

	/**
	 * HEAD commit SHA of one ticket worktree created by this run; the SHA the
	 * integration accept records and re-verifies before merging.
	 */
	async ticketHead(worktree: TicketWorktree): Promise<string> {
		const owned = this.#owned(worktree);
		return (await mustGit(owned.cwd, ["rev-parse", "HEAD"])).trim();
	}

	/** The ticket worktree must still be on its captured branch with a clean worktree and index. */
	async assertTicketClean(worktree: TicketWorktree): Promise<void> {
		const owned = this.#owned(worktree);
		const current = (await git(owned.cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])).stdout.trim();
		if (current !== owned.branch) {
			throw new Error(`票据工作树已切换分支：期望 ${owned.branch}，实际 ${current || "detached HEAD"}（${owned.cwd}）`);
		}
		if (await this.#mergeInProgress(owned.cwd)) {
			throw new Error(`票据工作树仍有未完成的合并：请先解决冲突并提交，或中止合并（${owned.cwd}）`);
		}
		const status = await mustGit(owned.cwd, ["status", "--porcelain"]);
		if (status.trim() !== "") {
			throw new Error(`票据工作树不干净（${owned.branch}）：\n${status.trimEnd()}`);
		}
	}

	/**
	 * The integration checkout must still be on the captured branch, with no
	 * merge in progress and a clean tree and index.
	 */
	async assertClean(): Promise<void> {
		if (await this.#mergeInProgress(this.root)) {
			throw new Error(`集成分支仍有未完成的合并：请先解决冲突并提交，或中止合并（${this.root}）`);
		}
		const current = await this.#currentBranch();
		if (current !== this.branch) {
			throw new Error(`集成分支已切换（期望 ${this.branch}，实际 ${current ?? "detached HEAD"}）（${this.root}）`);
		}
		const status = await mustGit(this.root, ["status", "--porcelain"]);
		if (status.trim() !== "") {
			throw new Error(`集成分支工作区或暂存区不干净（${this.branch}）：\n${status.trimEnd()}`);
		}
	}

	/**
	 * Best-effort removal of this run's worktrees. A worktree is removed only
	 * when it lives under the OS temp root, is clean, and its branch is already
	 * an ancestor of the integration branch; its branch is never deleted. Every
	 * kept worktree (dirty, unmerged, or unremovable) is reported as a warning.
	 */
	async cleanup(): Promise<string[]> {
		const warnings: string[] = [];
		const { branches, paths } = registeredWorktrees(await mustGit(this.root, ["worktree", "list", "--porcelain"]));
		for (const [ticket, tree] of [...this.worktrees]) {
			const ref = `refs/heads/${tree.branch}`;
			const registeredPath = branches.get(ref);
			if (registeredPath === undefined) {
				const detached = await this.#registeredPathFor(paths, tree.cwd);
				if (detached !== undefined) {
					warnings.push(`票据 ${ticket} 的工作树已脱离票据分支 ${tree.branch}，保留：${detached}`);
					continue;
				}
				// Already gone (removed by hand); nothing left to clean for this ticket.
				this.worktrees.delete(ticket);
				continue;
			}
			if (!(await underTempWorktreeRoot(registeredPath))) {
				warnings.push(`票据 ${ticket} 的工作树不在系统临时目录（${registeredPath}），已跳过`);
				continue;
			}
			const ancestor = await git(this.root, ["merge-base", "--is-ancestor", ref, `refs/heads/${this.branch}`]);
			if (ancestor.code !== 0) {
				warnings.push(`票据 ${ticket} 的分支尚未合并进 ${this.branch}，保留工作树与分支：${tree.branch}`);
				continue;
			}
			let dirty: string;
			try {
				dirty = (await mustGit(registeredPath, ["status", "--porcelain"])).trim();
			} catch (error) {
				warnings.push(`票据 ${ticket}（${tree.branch}）的工作树不可用（${errorText(error)}），已跳过`);
				continue;
			}
			if (dirty !== "") {
				warnings.push(
					`票据 ${ticket}（${tree.branch}）的工作树有未提交改动，保留（不使用 --force）：${registeredPath}`,
				);
				continue;
			}
			const removed = await git(this.root, ["worktree", "remove", "--", registeredPath]);
			if (removed.code !== 0) {
				const detail = firstLines(removed.stderr || removed.stdout) || `退出码 ${removed.code}`;
				warnings.push(`票据 ${ticket} 的工作树删除失败，已保留：${detail}`);
				continue;
			}
			this.worktrees.delete(ticket);
		}
		return warnings;
	}

	/** The registered worktree path that resolves to `cwd`, when git still lists it. */
	async #registeredPathFor(paths: readonly string[], cwd: string): Promise<string | undefined> {
		for (const candidate of paths) {
			try {
				const [left, right] = await Promise.all([fs.realpath(candidate), fs.realpath(cwd)]);
				if (left === right || (process.platform === "win32" && left.toLowerCase() === right.toLowerCase())) {
					return candidate;
				}
			} catch {
				// Missing or unreadable paths simply do not match.
			}
		}
		return undefined;
	}

	/** Existing implementation markdown files, repository-relative and sorted. */
	async #implementationFiles(): Promise<string[]> {
		const relative = `.scratch/${this.#slug}/implementation`;
		const absolute = path.join(this.root, relative);
		let names: string[];
		try {
			names = await fs.readdir(absolute);
		} catch (error) {
			throw new Error(`找不到实现票据目录：${relative}（phase 1 尚未发布票据；${errorText(error)}）`);
		}
		const files: string[] = [];
		for (const name of names) {
			if (!name.toLowerCase().endsWith(".md")) continue;
			const stat = await fs.stat(path.join(absolute, name)).catch(() => undefined);
			if (stat?.isFile() !== true) continue;
			files.push(`${relative}/${name}`);
		}
		return files.sort();
	}

	/** Throw when the index holds staged paths outside `allowed`. */
	async #rejectForeignStaged(allowed: readonly string[]): Promise<void> {
		const current = await this.#currentBranch();
		if (current !== this.branch)
			throw new Error(`集成分支已切换：期望 ${this.branch}，实际 ${current ?? "detached HEAD"}`);
		if (await this.#mergeInProgress(this.root)) throw new Error("集成分支仍有未完成的合并，不能提交报告或票据。");
		const result = await git(this.root, ["diff", "--cached", "--name-only", "-z", "--no-renames", "HEAD"]);
		if (result.code !== 0) {
			throw new Error(
				`git diff --cached 执行失败（退出码 ${result.code}）：${firstLines(result.stderr || result.stdout) || "无输出"}`,
			);
		}
		const permit = new Set(allowed);
		const foreign = result.stdout.split("\0").filter((file) => file !== "" && !permit.has(file));
		if (foreign.length > 0) {
			throw new Error(`暂存区存在与本次提交无关的改动，已拒绝：${foreign.join("、")}`);
		}
	}

	/**
	 * Stage and commit exactly these already-validated repository-relative
	 * paths with literal pathspecs. When the staged content matches HEAD the
	 * current HEAD is returned without creating an empty commit. Callers must
	 * pass at least one path, after `#rejectForeignStaged` accepted the index.
	 */
	async #commitStagedPaths(paths: readonly string[], message: string): Promise<string> {
		const pathspecs = paths.map(literal);
		await mustGit(this.root, ["add", "--", ...pathspecs]);
		const diff = await git(this.root, ["diff", "--cached", "--quiet", "HEAD", "--", ...pathspecs]);
		if (diff.code === 0) return this.head();
		if (diff.code !== 1) {
			throw new Error(
				`git diff --cached 执行失败（退出码 ${diff.code}）：${firstLines(diff.stderr || diff.stdout) || "无输出"}`,
			);
		}
		await mustGit(this.root, ["commit", "-m", message, "--", ...pathspecs]);
		return this.head();
	}

	/** Validate and normalize one explicit repository-relative path. */
	#relativePath(file: string): string {
		if (typeof file !== "string" || file === "" || file.includes("\0")) {
			throw new Error(`文件路径必须是非空字符串：${JSON.stringify(file)}`);
		}
		if (path.isAbsolute(file) || file.startsWith("/") || /^[A-Za-z]:/.test(file)) {
			throw new Error(`文件路径必须是仓库相对路径，不能是绝对路径：${file}`);
		}
		if (file.includes("\\")) {
			throw new Error(`文件路径必须使用 / 作为分隔符的仓库相对路径：${file}`);
		}
		const segments = file.split("/");
		if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
			throw new Error(`文件路径不能包含空、"." 或 ".." 片段：${file}`);
		}
		return file;
	}

	/** Unique branch name for one ticket in this run, based on the run token. */
	async #freshTicketBranch(ticket: string): Promise<string> {
		const stem = ticket.replace(/\.md$/i, "");
		const readable =
			stem
				.replace(/[^A-Za-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "")
				.slice(0, 32) || "ticket";
		const digest = createHash("sha256").update(ticket).digest("hex").slice(0, 6);
		// The slug is a valid path segment but not necessarily a valid ref component.
		const slugPart = this.#slug.replace(/\.\.+/g, ".").replace(/\.lock$/i, "-lock");
		for (let attempt = 0; attempt < 4; attempt++) {
			const token = attempt === 0 ? this.#runToken : `${this.#runToken}${attempt}`;
			const branch = `hyper/${slugPart}/${readable}-${digest}-${token}`;
			const probe = await git(this.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
			if (probe.code === 0) continue;
			if (probe.code === 1) return branch;
			throw new Error(`无法检查票据分支是否存在（退出码 ${probe.code}）：refs/heads/${branch}`);
		}
		throw new Error(`无法生成唯一的票据分支名：${ticket}`);
	}

	/** Branch currently checked out at `root`, or undefined on detached HEAD. */
	async #currentBranch(): Promise<string | undefined> {
		const result = await git(this.root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
		if (result.code !== 0) return undefined;
		const name = result.stdout.trim();
		return name === "" ? undefined : name;
	}

	/** True while a merge left MERGE_HEAD behind (conflict or stop). */
	async #mergeInProgress(cwd: string): Promise<boolean> {
		return (await git(cwd, ["rev-parse", "--quiet", "--verify", "MERGE_HEAD"])).code === 0;
	}

	/**
	 * Run one action with exclusive use of the integration checkout, queued behind
	 * every earlier caller in call order. The lock is released even when the action
	 * throws, so one failed merge never wedges the tickets that follow it.
	 */
	async #withLock<T>(action: () => Promise<T>): Promise<T> {
		const previous = this.#queue;
		let release!: () => void;
		this.#queue = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await action();
		} finally {
			release();
		}
	}

	/** The same worktree object must have been created by this run. */
	#owned(worktree: TicketWorktree): TicketWorktree {
		for (const candidate of this.worktrees.values()) {
			if (candidate.branch === worktree.branch && candidate.cwd === worktree.cwd) return candidate;
		}
		throw new Error(`该工作树不属于本次运行（未由 createTicket 创建）：${worktree.branch}`);
	}
}
