#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const effects = [];
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Reject paths that alias or escape on Windows as well as POSIX.
function safePath(path, allowRoot = false) {
  if (allowRoot && path === '.') return path;
  if (typeof path !== 'string' || !path || path.split('/').some(part =>
    !part || part === '.' || part === '..' || /[\\:<>"|?*\x00-\x1f]/.test(part) ||
    /[. ]$/.test(part) || /^\.git$/i.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`unsafe relative path: ${JSON.stringify(path)}`);
  }
  return path;
}

function gitCheckout(path) {
  const checkout = resolve(root, path);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  Object.assign(env, { GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_TERMINAL_PROMPT: '0' });
  const git = args => {
    const result = spawnSync('git', ['-C', checkout, ...args], { env, maxBuffer: 256 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`${checkout}: git ${args[0]}: ${result.error?.message ?? result.stderr.toString().trim()}`);
    return result.stdout;
  };
  const top = git(['rev-parse', '--show-toplevel']).toString().trim();
  if (relative(realpathSync(checkout), realpathSync(top))) throw new Error(`${checkout}: expected Git worktree root`);
  const revision = git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim();
  const files = new Map();
  const tree = git(['ls-tree', '-rz', '--full-tree', revision]);
  for (const item of tree.toString('utf8').split('\0')) {
    if (!item) continue;
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/.exec(item);
    if (!match) throw new Error(`${checkout}: malformed Git tree entry`);
    files.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  const cache = new Map();
  const read = path => {
    safePath(path);
    const entry = files.get(path);
    if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      throw new Error(`${checkout}@${revision}: missing or non-regular file ${path}`);
    }
    if (!cache.has(entry.oid)) cache.set(entry.oid, git(['cat-file', 'blob', entry.oid]));
    return cache.get(entry.oid);
  };
  const directory = path => {
    safePath(path, true);
    const prefix = path === '.' ? '' : `${path}/`;
    const selected = [...files.keys()].filter(file => file.startsWith(prefix)).sort();
    if (!selected.length) throw new Error(`${checkout}@${revision}: missing or empty directory ${path}`);
    return selected.map(sourcePath => ({ sourcePath, path: safePath(sourcePath.slice(prefix.length)), bytes: read(sourcePath) }));
  };
  return { revision, read, directory };
}

function inspectDestination(path, directory) {
  safePath(path);
  const parts = path.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    const wantDirectory = i < parts.length - 1 || directory;
    if (stat.isSymbolicLink() || (wantDirectory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`${path}: destination contains a link or unexpected file type`);
    }
  }
}

function existingFiles(path) {
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      safePath(child);
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error(`${child}: non-regular destination`);
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  if (lstatSync(join(root, path), { throwIfNoEntry: false })) walk(path);
  return found;
}

function publish(path, bytes) {
  const target = join(root, path);
  if (lstatSync(target, { throwIfNoEntry: false })?.isFile() && readFileSync(target).equals(bytes)) return;
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    renameSync(temporary, target);
    effects.push(`write ${path}`);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node deltas/update-upstream.mjs\nSync all registered snapshots from local HEAD commits configured in paths.local.json. No fetch, build, or rollback. Do not run concurrently with updates/builds.');
    return;
  }
  if (args.length) throw new Error('Usage: node deltas/update-upstream.mjs (no arguments, or --help)');
  const config = json('paths.local.json');
  const baseline = json('upstream/revision.json');
  const sources = json('dependent-skills/sources.json');
  const manifest = json('deltas/manifest.json');
  if (sources.schemaVersion !== 1 || sources.hashAlgorithm !== 'sha256') throw new Error('unsupported sources schema or hash algorithm');
  const checkouts = new Map();
  for (const [id, source] of Object.entries(sources.sources)) {
    const path = config.sources?.[id];
    if (typeof path !== 'string' || !path.trim()) throw new Error(`paths.local.json: missing sources.${id}`);
    const checkout = gitCheckout(path);
    checkouts.set(id, checkout);
    source.revision = checkout.revision;
    delete source.worktreeNote;
    delete source.licenseNote;
  }
  const matt = checkouts.get('mattpocock-skills');
  if (!matt || baseline.repository !== sources.sources['mattpocock-skills'].repository) throw new Error('inconsistent Matt upstream repository records');
  baseline.revision = matt.revision;
  delete sources.resourceAudit;
  sources.copyPolicy = 'Verbatim regular-file bytes from pinned Git commits; no symlinks or submodules. Shared skills are independent copies in each collection.';
  const directories = [];
  const writes = [];
  for (const skill of new Set(manifest.files.map(path => safePath(path).split('/')[0]))) {
    directories.push({ path: `upstream/${skill}`, files: matt.directory(`${safePath(baseline.sourceRoot)}/${skill}`) });
  }
  for (const [collection, entries] of Object.entries(sources.collections)) {
    for (const entry of entries) {
      const destination = `dependent-skills/${safePath(collection)}/${safePath(entry.skill)}`;
      if (entry.destinationPath !== destination) throw new Error(`unexpected destination: ${entry.destinationPath}`);
      const checkout = checkouts.get(entry.source);
      if (!checkout) throw new Error(`unknown source: ${entry.source}`);
      const files = checkout.directory(entry.sourcePath);
      entry.files = files.map(file => ({ sourcePath: file.sourcePath, path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes) }));
      directories.push({ path: destination, files });
    }
  }
  for (const source of Object.values(sources.sources)) {
    if (!source.licenseSourcePath && !source.licenseDestinationPath) continue;
    if (source.licenseDestinationPath !== 'dependent-skills/LICENSE') throw new Error('unexpected license destination');
    const id = Object.keys(sources.sources).find(id => sources.sources[id] === source);
    const bytes = checkouts.get(id).read(source.licenseSourcePath);
    source.licenseSha256 = sha256(bytes);
    writes.push({ path: source.licenseDestinationPath, bytes });
  }
  const owned = [];
  const claim = path => {
    safePath(path);
    const key = path.toLowerCase();
    if (owned.some(other => key === other || key.startsWith(`${other}/`) || other.startsWith(`${key}/`))) throw new Error(`overlapping destinations: ${path}`);
    owned.push(key);
  };
  // Finish all source reads and destination checks before the first mutation.
  for (const directory of directories) {
    claim(directory.path);
    inspectDestination(directory.path, true);
    directory.oldFiles = existingFiles(directory.path);
    const names = new Map();
    for (const file of directory.files) {
      const parts = file.path.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const name = parts.slice(0, i).join('/');
        const key = name.toLowerCase();
        if (names.has(key) && names.get(key) !== name) throw new Error(`case-colliding source paths: ${directory.path}/${name}`);
        names.set(key, name);
      }
    }
  }
  writes.push({ path: 'upstream/revision.json', bytes: Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`) });
  writes.push({ path: 'dependent-skills/sources.json', bytes: Buffer.from(`${JSON.stringify(sources, null, 2)}\n`) });
  for (const file of writes) { claim(file.path); inspectDestination(file.path, false); }
  for (const directory of directories) {
    const keep = new Set(directory.files.map(file => `${directory.path}/${file.path}`));
    for (const path of directory.oldFiles) if (!keep.has(path)) {
      rmSync(join(root, path));
      effects.push(`remove ${path}`);
    }
    const prune = path => {
      if (!lstatSync(join(root, path), { throwIfNoEntry: false })) return;
      for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
        if (entry.isDirectory()) prune(`${path}/${entry.name}`);
      }
      if (path !== directory.path && readdirSync(join(root, path)).length === 0) {
        rmdirSync(join(root, path));
        effects.push(`remove directory ${path}`);
      }
    };
    prune(directory.path);
    for (const file of directory.files) publish(`${directory.path}/${file.path}`, file.bytes);
  }
  for (const file of writes) publish(file.path, file.bytes);
  for (const [id, checkout] of checkouts) console.log(`${id}: ${checkout.revision}`);
  console.log(effects.join('\n') || 'Snapshots and records already match.');
  console.log('Snapshot sync complete. Adapt mappings and run the build separately.');
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  console.error(effects.length ? `Partial update; no rollback. Completed file effects:\n${effects.join('\n')}` : 'No snapshot files or version records changed.');
  process.exitCode = 2;
}
