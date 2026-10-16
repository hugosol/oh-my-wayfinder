/**
 * Shared real-CLI Git fixtures for the hyper-auto-coding tests: temporary
 * repositories, ticket documents, and teardown. Production code spawns its own
 * `git` subprocesses, so nothing here is mocked.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface CliResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Real `git` for fixtures, returning the raw exit code and streams. */
export async function gitRaw(cwd: string, args: readonly string[]): Promise<CliResult> {
	const child = Bun.spawn(["git", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { code, stdout, stderr };
}

/** Real `git` for fixtures; returns trimmed stdout and fails instead of silently degrading a fixture. */
export async function git(cwd: string, ...args: string[]): Promise<string> {
	const result = await gitRaw(cwd, args);
	if (result.code !== 0) {
		throw new Error(
			`fixture git ${args.join(" ")} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
		);
	}
	return result.stdout.trim();
}

/** Write a fixture file, creating its parent directories. */
export async function write(file: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, content);
}

const roots: string[] = [];
const trees: string[] = [];

/** Create an OS-temp directory that `cleanupFixtures` removes. */
export async function tempDir(prefix: string): Promise<string> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	roots.push(directory);
	return directory;
}

/** Register an external ticket worktree directory for `cleanupFixtures`. */
export function trackTree(cwd: string): string {
	trees.push(cwd);
	return cwd;
}

/** Remove every tracked worktree and temp repository; call once from `afterEach`. */
export async function cleanupFixtures(): Promise<void> {
	await Promise.all(trees.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
	await Promise.all(roots.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
}

/** A temp repository on the branch under test, with committed input documents. */
export interface FixtureRepo {
	root: string;
	slug: string;
}

/**
 * Initialize a real temp repository on `branch` and commit its spec/contract
 * documents. Document contents stay per-fixture; `contract: false` omits
 * `contract.md` for the missing-input case.
 */
export async function initRepo(
	options: { slug?: string; branch?: string; spec?: string; contract?: string | false; prefix?: string } = {},
): Promise<FixtureRepo> {
	const root = await tempDir(options.prefix ?? "hyper-git-repo-");
	const slug = options.slug ?? "feature-x";
	await git(root, "init", "-q", "-b", options.branch ?? "integration");
	await git(root, "config", "user.email", "hyper-test@example.com");
	await git(root, "config", "user.name", "Hyper Test");
	await git(root, "config", "commit.gpgsign", "false");
	await git(root, "config", "core.autocrlf", "false");
	await write(path.join(root, ".scratch", slug, "spec.md"), options.spec ?? "# Spec\n");
	if (options.contract !== false)
		await write(path.join(root, ".scratch", slug, "contract.md"), options.contract ?? "# Contract\n");
	await git(root, "add", "--", `.scratch/${slug}`);
	await git(root, "commit", "-q", "-m", "spec and contract");
	return { root, slug };
}

/** One implementation ticket document under `.scratch/<slug>/implementation/`. */
export async function ticketFile(repo: FixtureRepo, name: string, content = `# ${name}\n`): Promise<string> {
	const relative = `.scratch/${repo.slug}/implementation/${name}`;
	await write(path.join(repo.root, relative), content);
	return relative;
}
