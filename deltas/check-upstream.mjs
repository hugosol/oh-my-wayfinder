#!/usr/bin/env node
// Check whether the vendored snapshot under upstream/ still matches mattpocock/skills.
//
//   node deltas/check-upstream.mjs                compare against upstream HEAD over the GitHub API
//   node deltas/check-upstream.mjs --verbose      also list the differing files
//   node deltas/check-upstream.mjs --local <dir>  compare against a local upstream checkout
//
// Only the files listed in deltas/manifest.json are compared; anything else under a skill
// directory (for example agents/openai.yaml) is ignored. The snapshot side is normalized
// (CRLF -> LF) before hashing, because upstream/ is a hand-copied CRLF working tree while
// upstream commits LF.
//
// The API is called unauthenticated (60 requests/hour); it uses two requests per run, and
// GITHUB_TOKEN raises the limit.
//
// Exit codes: 0 = every skill matches, 1 = at least one skill differs,
//             2 = the comparison could not be made.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRepo = 'mattpocock/skills';
const upstreamLabel = `github.com/${upstreamRepo}`;
const apiBase = `https://api.github.com/repos/${upstreamRepo}`;
const usage = 'usage: node deltas/check-upstream.mjs [--verbose] [--local <dir>]';

class Failure extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'Failure';
    this.code = code;
  }
}

function fail(message, code = 2) {
  throw new Failure(message, code);
}

function display(path) {
  const pathFromRoot = relative(root, path);
  if (pathFromRoot === '' || pathFromRoot.startsWith('..')) return path.replaceAll('\\', '/');
  return pathFromRoot.replaceAll('\\', '/');
}

function readManifest() {
  const path = join(root, 'deltas', 'manifest.json');
  if (!existsSync(path)) fail(`manifest is missing: ${display(path)}`);
  const text = readFileSync(path, 'utf8');
  if (text.includes('\r')) fail(`manifest contains CR bytes; deltas/ must use LF line endings: ${display(path)}`);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    fail(`manifest is not valid JSON: ${error.message}`);
  }
  const files = manifest.files;
  if (!Array.isArray(files) || files.length === 0) fail('manifest.files must be a non-empty array of paths');
  for (const file of files) {
    if (typeof file !== 'string' || file === '' || file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) {
      fail(`manifest.files contains an invalid relative path: ${JSON.stringify(file)}`);
    }
    if (!file.includes('/')) fail(`manifest.files entry "${file}" is not <skill>/<file>`);
  }
  return files;
}

function readNormalized(path, what) {
  if (!existsSync(path)) fail(`${what} is missing: ${display(path)}`);
  let text = readFileSync(path, 'utf8');
  if (text.includes('\r')) {
    text = text.replaceAll('\r\n', '\n');
    if (text.includes('\r')) fail(`${what} contains a bare CR byte, not a CRLF line ending: ${display(path)}`);
  }
  return text;
}

function blobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`, 'utf8').update(bytes).digest('hex');
}

function parseArgs(args) {
  let verbose = false;
  let local;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--verbose') {
      verbose = true;
      continue;
    }
    if (arg === '--local') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`--local requires a directory (${usage})`);
      local = value;
      i += 1;
      continue;
    }
    fail(`unknown argument "${arg}" (${usage})`);
  }
  return { verbose, local };
}

async function fetchJson(url) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'oh-my-wayfinder-check-upstream' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  } catch (error) {
    fail(`request to ${url} failed: ${error.cause?.message ?? error.message}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = '';
    try {
      message = JSON.parse(body).message ?? '';
    } catch {
      message = body.trim();
    }
    fail(`the GitHub API returned ${response.status} for ${url}${message === '' ? '' : `: ${message}`}`);
  }
  try {
    return await response.json();
  } catch (error) {
    fail(`the GitHub API returned invalid JSON for ${url}: ${error.message}`);
  }
}

async function makeRemoteBackend() {
  const commit = await fetchJson(`${apiBase}/commits/HEAD`);
  const sha = commit?.sha;
  if (typeof sha !== 'string' || sha === '') fail(`the GitHub API returned no HEAD commit for ${upstreamRepo}`);
  const date = typeof commit.commit?.committer?.date === 'string' ? commit.commit.committer.date.slice(0, 10) : '';
  const tree = await fetchJson(`${apiBase}/git/trees/${sha}?recursive=1`);
  if (tree.truncated === true) fail(`the tree for ${sha} is truncated; compare against a local checkout with --local <dir> instead`);
  const entries = new Map();
  for (const entry of tree.tree ?? []) {
    if (entry !== null && typeof entry === 'object' && typeof entry.path === 'string') entries.set(entry.path, entry);
  }
  return {
    source: upstreamLabel,
    sha,
    date,
    findSkillDirs(skill) {
      const found = [];
      for (const entry of entries.values()) {
        if (entry.type !== 'tree') continue;
        if (entry.path.split('/').pop() === skill && entries.has(`${entry.path}/SKILL.md`)) found.push({ path: entry.path });
      }
      return found;
    },
    hashAt(dir, rest) {
      const entry = entries.get(`${dir.path}/${rest}`);
      if (entry === undefined) return undefined;
      if (entry.type !== 'blob' || typeof entry.sha !== 'string') fail(`unexpected tree entry for ${dir.path}/${rest}`);
      return entry.sha;
    },
  };
}

function indexSkillDirs(upstreamRoot, skills) {
  const index = new Map(skills.map((skill) => [skill, []]));
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (index.has(entry.name) && existsSync(join(full, 'SKILL.md'))) index.get(entry.name).push(full);
      walk(full);
    }
  }
  walk(upstreamRoot);
  return index;
}

function describeCheckout(dir) {
  if (!existsSync(join(dir, '.git'))) return undefined;
  const run = (args) => spawnSync('git', args, { encoding: 'utf8' });
  const sha = run(['-C', dir, 'rev-parse', 'HEAD']);
  if (sha.error || sha.status !== 0) return undefined;
  const date = run(['-C', dir, 'log', '-1', '--format=%cs']);
  return { sha: sha.stdout.trim(), date: date.error || date.status !== 0 ? '' : date.stdout.trim() };
}

function makeLocalBackend(upstreamRoot, skills) {
  const dirsBySkill = indexSkillDirs(upstreamRoot, skills);
  const head = describeCheckout(upstreamRoot);
  return {
    source: `local checkout ${display(upstreamRoot)}`,
    sha: head?.sha ?? '',
    date: head?.date ?? '',
    findSkillDirs(skill) {
      return dirsBySkill.get(skill).map((dir) => ({ path: relative(upstreamRoot, dir).replaceAll('\\', '/'), dir }));
    },
    hashAt(dir, rest) {
      const path = join(dir.dir, ...rest.split('/'));
      if (!existsSync(path)) return undefined;
      return blobSha(readNormalized(path, `upstream file ${rest}`));
    },
  };
}

async function main() {
  const { verbose, local } = parseArgs(process.argv.slice(2));
  const files = readManifest();
  const skills = [...new Set(files.map((file) => file.split('/')[0]))].sort();
  const entriesBySkill = new Map(skills.map((skill) => [skill, files.filter((file) => file.startsWith(`${skill}/`))]));

  let backend;
  if (local === undefined) {
    backend = await makeRemoteBackend();
  } else {
    const upstreamRoot = resolve(local);
    if (!existsSync(upstreamRoot) || !statSync(upstreamRoot).isDirectory()) fail(`--local directory not found: ${display(upstreamRoot)}`);
    backend = makeLocalBackend(upstreamRoot, skills);
  }

  const stamp = backend.sha === '' ? '' : ` @ ${backend.sha}${backend.date === '' ? '' : ` (${backend.date})`}`;
  const results = [];
  const notes = [];

  for (const skill of skills) {
    const entries = entriesBySkill.get(skill);
    const matches = backend.findSkillDirs(skill);
    if (matches.length > 1) fail(`"${skill}" is ambiguous upstream: ${matches.map((match) => match.path).join(', ')}`);
    if (matches.length === 0) {
      notes.push(`"${skill}" has no directory containing a SKILL.md upstream`);
      results.push({ skill, details: entries.map((entry) => ({ entry, status: 'removed' })) });
      continue;
    }

    const dir = matches[0];
    const expectedAt = `skills/engineering/${skill}`;
    if (dir.path !== expectedAt) notes.push(`"${skill}" is at ${dir.path} upstream (expected ${expectedAt})`);

    const details = [];
    for (const entry of entries) {
      const rest = entry.slice(skill.length + 1);
      const localPath = join(root, 'upstream', ...entry.split('/'));
      const localHash = blobSha(readNormalized(localPath, `snapshot file upstream/${entry}`));
      const upstreamHash = backend.hashAt(dir, rest);
      if (upstreamHash === undefined) {
        details.push({ entry, status: 'removed' });
        continue;
      }
      if (upstreamHash !== localHash) details.push({ entry, status: 'modified' });
    }
    results.push({ skill, details });
  }

  for (const note of notes) console.log(`note: ${note}`);

  const updated = results.filter((result) => result.details.length > 0);
  if (updated.length === 0) {
    console.log(`all ${skills.length} skill(s) up to date with ${backend.source}${stamp}`);
    return;
  }

  for (const result of updated) {
    console.log(result.skill);
    if (!verbose) continue;
    for (const detail of result.details) {
      console.log(detail.status === 'removed' ? `  removed upstream ${detail.entry}` : `  modified ${detail.entry}`);
    }
  }
  console.log(`${backend.source}${stamp}: ${updated.length} of ${skills.length} skill(s) updated`);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  if (error instanceof Failure) {
    console.error(`error: ${error.message}`);
    process.exitCode = error.code;
  } else {
    console.error(`error: ${error.stack ?? error.message}`);
    process.exitCode = 2;
  }
}
