#!/usr/bin/env node
// Regenerate the overlay files listed in deltas/manifest.json from upstream/.
//
//   node deltas/build.mjs          write the generated files
//   node deltas/build.mjs --check  verify the committed files match the sources
//
// The build is pure text processing: it never shells out and never touches git.
// manifest.json holds two things:
//   files  the whitelist: only these paths are read from upstream/ and written to skills/
//   ops    per file, the transforms applied to the upstream text. An op id X resolves to
//          deltas/X.expect.md (text that must occur exactly once in that file) and
//          deltas/X.fragment.md (its replacement, applied verbatim)
// Anything else under upstream/ is ignored. Files under the generated skill directories that
// are not in the whitelist are removed, so the overlay stays exactly the whitelist.
// upstream/ may carry CRLF (it is copied by hand from an upstream checkout) and is normalized
// on read; deltas/ and skills/ must be LF.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const opsByFile = manifest.ops ?? {};
for (const file of Object.keys(opsByFile)) {
  if (!files.includes(file)) fail(`manifest.ops references "${file}", which is not listed in manifest.files`);
}

const generatedDirs = [...new Set(files.map((file) => file.split('/')[0]))];
const listed = new Set(files);

let written = 0;
let verified = 0;

for (const file of files) {
  let text = readUpstream(join(root, 'upstream', file), `upstream source ${file}`);

  for (const op of opsByFile[file] ?? []) {
    const expect = readText(join(root, 'deltas', `${op.id}.expect.md`), `op ${op.id} expect`);
    const fragment = readText(join(root, 'deltas', `${op.id}.fragment.md`), `op ${op.id} fragment`);

    const at = text.indexOf(expect);
    if (at === -1) {
      fail(
        `op ${op.id}: its expected upstream text was not found in upstream/${file}. ` +
          `Upstream changed that text; review deltas/${op.id}.expect.md and deltas/${op.id}.fragment.md.`,
      );
    }
    if (text.indexOf(expect, at + 1) !== -1) {
      fail(`op ${op.id}: its expected text occurs more than once in upstream/${file}; the locator is ambiguous.`);
    }
    if (expect === fragment) fail(`op ${op.id}: the fragment is identical to the expect text (no-op).`);

    text = text.slice(0, at) + fragment + text.slice(at + expect.length);
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
