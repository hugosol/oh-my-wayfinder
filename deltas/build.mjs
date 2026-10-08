#!/usr/bin/env node
// Regenerate the overlay files listed in deltas/manifest.json from upstream/.
//
//   node deltas/build.mjs          write the generated files
//   node deltas/build.mjs --check  verify the committed files match the sources
//
// The build is pure text processing: it never shells out and never touches git.
// manifest.json holds the files whitelist: only these paths are read from upstream/
// and written to skills/. Each deltas/mappings/<skill>.md holds that skill's mappings:
//   ## target path, ### op id, explanatory prose, then one fenced `op` block per op.
// An op is one anchor plus the edits that apply inside it:
//   - `find:`/`content:` pairs replace find with content;
//   - the anchor may carry one <oh-my-wayfinder:insert> marker, and the `insert:` content
//     lands at that position.
// Every edit resolves against the anchor's original text, so their order in the block does
// not matter and they may not overlap. The anchor (marker stripped) must occur exactly once
// in the target, or the build fails and a human re-specifies it; ops run in document order.
// Anything else under upstream/ is ignored. Files under the generated skill directories that
// are not in the whitelist are removed, so the overlay stays exactly the whitelist.
// upstream/ may carry CRLF (it is copied by hand from an upstream checkout) and is normalized
// on read; deltas/ and skills/ must be LF.
//
// Parsing and applying ops live in deltas/ops.mjs, shared with deltas/preview.mjs (the
// human-readable view of the same mappings), so the viewer and the build cannot disagree
// about what an op does.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOp, MappingError, OpError, parseMappings } from './ops.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--check');
const check = args.includes('--check');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function rel(path) {
  return relative(root, path).replaceAll('\\', '/');
}

if (unknown.length > 0) fail(`unknown argument(s): ${unknown.join(' ')} (usage: node deltas/build.mjs [--check])`);

function readText(path, what) {
  if (!existsSync(path)) fail(`${what} is missing: ${rel(path)}`);
  const text = readFileSync(path, 'utf8');
  if (text.includes('\r')) fail(`${what} contains CR bytes; every file must use LF line endings: ${rel(path)}`);
  if (!text.endsWith('\n')) fail(`${what} must end with a newline: ${rel(path)}`);
  return text;
}

function readUpstream(path, what) {
  if (!existsSync(path)) fail(`${what} is missing: ${rel(path)}`);
  let text = readFileSync(path, 'utf8');
  if (text.includes('\r')) {
    text = text.replaceAll('\r\n', '\n');
    if (text.includes('\r')) fail(`${what} contains a bare CR byte, not a CRLF line ending: ${rel(path)}`);
    console.log(`note: normalized CRLF to LF while reading ${rel(path)}`);
  }
  if (!text.endsWith('\n')) fail(`${what} must end with a newline: ${rel(path)}`);
  return text;
}

function readMappings(skill, listed) {
  const path = join(root, 'deltas', 'mappings', `${skill}.md`);
  const text = readText(path, 'mapping document');
  try {
    return parseMappings({
      skill,
      listed,
      text,
      onWarn: (line, opId, message) => {
        console.warn(`warning: ${rel(path)}:${line}${opId ? ` (op ${opId})` : ''}: ${message}`);
      },
    });
  } catch (error) {
    if (error instanceof MappingError) {
      fail(`${rel(path)}:${error.line}${error.opId ? ` (op ${error.opId})` : ''}: ${error.message}`);
    }
    throw error;
  }
}

function walkFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

function walkDirs(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    found.push(...walkDirs(full), full);
  }
  return found;
}

const manifest = JSON.parse(readText(join(root, 'deltas', 'manifest.json'), 'manifest'));

const files = manifest.files;
if (!Array.isArray(files) || files.length === 0) fail('manifest.files must be a non-empty array of paths');
for (const file of files) {
  if (typeof file !== 'string' || file === '' || file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) {
    fail(`manifest.files contains an invalid relative path: ${JSON.stringify(file)}`);
  }
}

const generatedDirs = [...new Set(files.map((file) => file.split('/')[0]))];
const listed = new Set(files);
const opsByFile = {};
for (const skill of generatedDirs) {
  Object.assign(opsByFile, readMappings(skill, listed));
}

let written = 0;
let verified = 0;

for (const file of files) {
  let text = readUpstream(join(root, 'upstream', file), `upstream source ${file}`);

  for (const op of opsByFile[file] ?? []) {
    try {
      text = applyOp(text, op, file.split('/')[0]);
    } catch (error) {
      if (error instanceof OpError) fail(error.message);
      throw error;
    }
  }

  if (!text.endsWith('\n')) fail(`the generated ${file} does not end with a newline`);

  const targetPath = join(root, 'skills', file);
  const opCount = (opsByFile[file] ?? []).length;

  if (check) {
    if (!existsSync(targetPath)) fail(`skills/${file} is missing; run: node deltas/build.mjs`);
    const current = readFileSync(targetPath, 'utf8');
    if (current === text) {
      console.log(`ok       skills/${file}`);
      verified += 1;
      continue;
    }
    const currentLines = current.split('\n');
    const generatedLines = text.split('\n');
    let line = 0;
    while (line < currentLines.length && line < generatedLines.length && currentLines[line] === generatedLines[line]) line += 1;
    fail(
      `skills/${file} is out of date with upstream/ + deltas/ ` +
        `(first difference at line ${line + 1}). Run: node deltas/build.mjs`,
    );
  }

  if (existsSync(targetPath) && readFileSync(targetPath, 'utf8') === text) {
    console.log(`unchanged skills/${file}`);
    continue;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, text, 'utf8');
  console.log(`wrote     skills/${file}  (${opCount} op${opCount === 1 ? '' : 's'}, ${Buffer.byteLength(text)} bytes)`);
  written += 1;
}

// The generated skill directories hold exactly the whitelist.
const extras = [];
for (const dir of generatedDirs) {
  const base = join(root, 'skills', dir);
  if (!existsSync(base)) continue;
  for (const path of walkFiles(base)) {
    const relPath = relative(join(root, 'skills'), path).split(sep).join('/');
    if (!listed.has(relPath)) extras.push({ relPath, path });
  }
}

if (check) {
  if (extras.length > 0) {
    fail(
      `the generated skill directories contain files that are not listed in manifest.files: ` +
        `${extras.map((extra) => extra.relPath).join(', ')}. Run: node deltas/build.mjs`,
    );
  }
} else {
  for (const extra of extras) {
    rmSync(extra.path);
    console.log(`removed   ${extra.relPath}  (not listed in manifest.files)`);
    written += 1;
  }
  for (const dir of generatedDirs) {
    const base = join(root, 'skills', dir);
    if (!existsSync(base)) continue;
    for (const empty of walkDirs(base)) {
      if (readdirSync(empty).length === 0) rmSync(empty, { recursive: true });
    }
  }
}

if (check) console.log(`\n${verified} file(s) verified against upstream/ + deltas/`);
else console.log(`\n${written} file(s) written`);
