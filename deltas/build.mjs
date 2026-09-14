#!/usr/bin/env node
// Regenerate the overlay files under skills/ from upstream/ + deltas/.
//
//   node deltas/build.mjs          write the generated files
//   node deltas/build.mjs --check  verify the committed files match the sources
//
// An op id X resolves to deltas/X.expect.md (text that must occur exactly once in
// the upstream source) and deltas/X.fragment.md (its replacement, applied verbatim).
// An op that can no longer find its exact upstream text fails loudly: upstream moved
// the text, so the locator and the fragment must be reviewed by hand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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

const manifestPath = join(root, 'deltas', 'manifest.json');
const manifest = JSON.parse(readText(manifestPath, 'manifest'));

let written = 0;
let verified = 0;

for (const output of manifest.outputs) {
  const sourcePath = join(root, 'upstream', output.source);
  let text = readText(sourcePath, `upstream source ${output.source}`);

  for (const op of output.ops) {
    const expect = readText(join(root, 'deltas', `${op.id}.expect.md`), `op ${op.id} expect`);
    const fragment = readText(join(root, 'deltas', `${op.id}.fragment.md`), `op ${op.id} fragment`);

    const at = text.indexOf(expect);
    if (at === -1) {
      fail(
        `op ${op.id}: its expected upstream text was not found in upstream/${output.source}. ` +
          `Upstream changed that text; review deltas/${op.id}.expect.md and deltas/${op.id}.fragment.md.`,
      );
    }
    if (text.indexOf(expect, at + 1) !== -1) {
      fail(`op ${op.id}: its expected text occurs more than once in upstream/${output.source}; the locator is ambiguous.`);
    }
    if (expect === fragment) fail(`op ${op.id}: the fragment is identical to the expect text (no-op).`);

    text = text.slice(0, at) + fragment + text.slice(at + expect.length);
  }

  if (!text.endsWith('\n')) fail(`the generated ${output.target} does not end with a newline`);

  const targetPath = join(root, output.target);

  if (check) {
    if (!existsSync(targetPath)) fail(`${output.target} is missing; run: node deltas/build.mjs`);
    const current = readFileSync(targetPath, 'utf8');
    if (current === text) {
      console.log(`ok       ${output.target}`);
      verified += 1;
      continue;
    }
    const currentLines = current.split('\n');
    const generatedLines = text.split('\n');
    let line = 0;
    while (line < currentLines.length && line < generatedLines.length && currentLines[line] === generatedLines[line]) line += 1;
    fail(
      `${output.target} is out of date with upstream/ + deltas/ ` +
        `(first difference at line ${line + 1}). Run: node deltas/build.mjs`,
    );
  }

  if (existsSync(targetPath) && readFileSync(targetPath, 'utf8') === text) {
    console.log(`unchanged ${output.target}`);
    continue;
  }
  writeFileSync(targetPath, text, 'utf8');
  console.log(`wrote     ${output.target}  (${output.ops.length} op${output.ops.length === 1 ? '' : 's'}, ${Buffer.byteLength(text)} bytes)`);
  written += 1;
}

if (check) console.log(`\n${verified} file(s) verified against upstream/ + deltas/`);
else console.log(`\n${written} file(s) written`);
