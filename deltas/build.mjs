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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--check');
const check = args.includes('--check');

const INSERT_MARKER = '<oh-my-wayfinder:insert>';
const FIELD_NAMES = new Set(['anchor', 'find', 'content', 'insert']);
const FIELD_HEADER = /^([a-z]+):(?: (.*))?$/;

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

function countOccurrences(text, needle) {
  let found = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    found += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return found;
}

function commonPrefixLength(a, b) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[n] === b[n]) n += 1;
  return n;
}

function commonSuffixLength(a, b, prefix) {
  let n = 0;
  const max = Math.min(a.length, b.length) - prefix;
  while (n < max && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

function isSpaceChar(c) {
  return c === undefined || /\s/.test(c);
}

// A find carries more than it owns when it shares leading or trailing text with its
// content: that shared text is context, not owned. This returns the change region itself
// when it is a strict, unique, word-boundary narrowing of find; otherwise undefined.
// An ambiguous change region needs human judgement about which context to keep, so it is
// left alone rather than replaced with an arbitrary fragment.
function narrowerEdit(anchor, find, content) {
  if (content === '') return undefined;
  let prefix = commonPrefixLength(find, content);
  let suffix = commonSuffixLength(find, content, prefix);
  if (prefix + suffix >= Math.min(find.length, content.length)) return undefined;
  while (prefix > 0 && !isSpaceChar(find[prefix - 1]) && !isSpaceChar(find[prefix])) prefix -= 1;
  while (suffix > 0 && !isSpaceChar(find[find.length - suffix]) && !isSpaceChar(find[find.length - suffix - 1])) suffix -= 1;
  const narrowedFind = find.slice(prefix, find.length - suffix);
  if (narrowedFind === '' || narrowedFind === find) return undefined;
  if (!/\S/.test(narrowedFind)) return undefined;
  if (countOccurrences(anchor, narrowedFind) !== 1) return undefined;
  const narrowedContent = content.slice(prefix, content.length - suffix);
  if (narrowedFind === narrowedContent) return undefined;
  return { find: narrowedFind, content: narrowedContent };
}

function shorten(text, max = 48) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function readMappings(skill, listed) {
  const path = join(root, 'deltas', 'mappings', `${skill}.md`);
  const lines = readText(path, 'mapping document').split('\n');
  const opsByFile = {};
  const ids = new Set();
  let file;
  let op;
  let fence;

  const invalid = (line, message) => {
    fail(`${rel(path)}:${line}${op ? ` (op ${op.id})` : ''}: ${message}`);
  };

  const warn = (line, message) => {
    console.warn(`warning: ${rel(path)}:${line}${op ? ` (op ${op.id})` : ''}: ${message}`);
  };

  function finishOp(line) {
    if (!op) return;
    if (!op.hasBlock) invalid(line, 'each op must contain exactly one fenced `op` block');
    if (op.anchor === undefined) invalid(line, 'the op needs an anchor');
    if (op.anchor === '') invalid(line, 'the anchor must not be empty');
    if (op.pending !== undefined) invalid(line, `find ${JSON.stringify(op.pending)} has no content`);
    if (op.replaces.length === 0 && op.insert === undefined) invalid(line, 'the op has no edits');
    const markers = countOccurrences(op.anchor, INSERT_MARKER);
    if (markers > 1) invalid(line, `the anchor carries ${markers} <oh-my-wayfinder:insert> markers; at most one is allowed`);
    if (markers === 1 && op.insert === undefined) invalid(line, 'the anchor carries an insert marker but the op has no insert');
    if (markers === 0 && op.insert !== undefined) invalid(line, 'the op has an insert but the anchor carries no insert marker');
    if (op.insert === '') invalid(line, 'the insert must not be empty');
    if (op.insert !== undefined && op.insert.includes(INSERT_MARKER)) invalid(line, 'the insert must not contain the insert marker');
    for (const replace of op.replaces) {
      if (replace.find === '') invalid(line, 'a find must not be empty');
      if (replace.find === replace.content) invalid(line, `find ${JSON.stringify(replace.find)} and its content are identical (a no-op)`);
      if (replace.find.includes(INSERT_MARKER) || replace.content.includes(INSERT_MARKER)) {
        invalid(line, 'a find and its content must not contain the insert marker');
      }
      const narrower = narrowerEdit(op.anchor, replace.find, replace.content);
      if (narrower) {
        warn(
          line,
          `find ${JSON.stringify(shorten(replace.find))} shares context with its content; it can be narrowed to ` +
            `${JSON.stringify(shorten(narrower.find))} so the content does not repeat text the patch does not own`,
        );
      }
    }
    opsByFile[file].push({ id: op.id, anchor: op.anchor, replaces: op.replaces, insert: op.insert });
    op = undefined;
  }

  if (lines[0] !== `# ${skill}`) invalid(1, `the document must start with "# ${skill}"`);

  for (let i = 1; i < lines.length - 1; i += 1) {
    const line = lines[i];
    const number = i + 1;

    if (fence) {
      if (line === fence) {
        fence = undefined;
        op.hasBlock = true;
        continue;
      }
      const header = FIELD_HEADER.exec(line);
      if (!header) {
        if (/^`{3,}/.test(line)) invalid(number, 'the closing fence must match the opening fence exactly');
        invalid(number, 'expected a field header (anchor, find, content or insert) or the closing fence');
      }
      const name = header[1];
      const rest = header[2] ?? '';
      if (!FIELD_NAMES.has(name)) invalid(number, `unknown field "${name}"; expected anchor, find, content or insert`);
      let value;
      if (rest === '|' || rest === '|-') {
        const parts = [];
        let j = i + 1;
        while (j < lines.length && lines[j] !== fence && !FIELD_HEADER.test(lines[j])) {
          const raw = lines[j];
          if (raw !== '' && !raw.startsWith('  ')) invalid(j + 1, 'every block-scalar line must be empty or indented two spaces');
          parts.push(raw === '' ? '' : raw.slice(2));
          j += 1;
        }
        value = parts.join('\n') + (rest === '|' ? '\n' : '');
        i = j - 1;
      } else {
        value = rest;
      }
      if (name === 'anchor') {
        if (op.anchor !== undefined) invalid(number, 'the op has more than one anchor');
        op.anchor = value;
        continue;
      }
      if (name === 'find') {
        if (op.pending !== undefined) invalid(number, `find ${JSON.stringify(op.pending)} has no content`);
        op.pending = value;
        continue;
      }
      if (name === 'content') {
        if (op.pending === undefined) invalid(number, 'content must follow a find');
        op.replaces.push({ find: op.pending, content: value });
        op.pending = undefined;
        continue;
      }
      if (name === 'insert') {
        if (op.insert !== undefined) invalid(number, 'the op has more than one insert');
        op.insert = value;
        continue;
      }
    }

    const opening = /^(`{3,})op$/.exec(line);
    if (opening) {
      if (!op) invalid(number, 'a fenced `op` block must belong to a ### op');
      if (op.hasBlock) invalid(number, 'each op must contain exactly one fenced `op` block');
      if (op.anchor !== undefined || op.replaces.length > 0 || op.insert !== undefined || op.pending !== undefined) {
        invalid(number, 'the fenced `op` block must hold every field');
      }
      fence = opening[1];
      continue;
    }
    if (/^`{3,}diff$/.test(line)) invalid(number, 'the diff-block format is gone; write an `op` block (see docs/adr/0002-typed-anchored-ops.md)');
    if (/^[ \t]*(`{3,}|~{3,})/.test(line)) invalid(number, 'expected an unindented `op` fence inside an op');
    if (line.startsWith('## ')) {
      finishOp(number);
      file = line.slice(3);
      if (!listed.has(file) || !file.startsWith(`${skill}/`)) {
        invalid(number, `target "${file}" is not in this skill's manifest.files whitelist`);
      }
      if (opsByFile[file]) invalid(number, `duplicate target heading "${file}"`);
      opsByFile[file] = [];
      continue;
    }
    if (line.startsWith('### ')) {
      finishOp(number);
      if (!file) invalid(number, 'a ### op must follow a ## target path');
      const id = line.slice(4);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
        invalid(number, 'op IDs must use lowercase letters, digits and single hyphens');
      }
      if (ids.has(id)) invalid(number, `duplicate op id ${skill}/${id}`);
      ids.add(id);
      op = { id: `${skill}/${id}`, anchor: undefined, replaces: [], insert: undefined, pending: undefined, hasBlock: false };
      continue;
    }
    if (/^\s*#/.test(line)) invalid(number, 'expected a ## target path or ### op heading');
    if (!op && line.trim() !== '') invalid(number, 'explanatory prose must belong to a ### op');
  }

  if (fence) invalid(lines.length - 1, 'unterminated fenced block');
  finishOp(lines.length - 1);
  for (const [target, ops] of Object.entries(opsByFile)) {
    if (ops.length === 0) invalid(lines.length - 1, `target "${target}" has no ops; omit unchanged targets`);
  }
  return opsByFile;
}

function applyOp(text, op, skill) {
  const raw = op.anchor;
  const markerAt = raw.indexOf(INSERT_MARKER);
  let anchor = raw;
  let insertAt = -1;
  if (markerAt !== -1) {
    anchor = raw.slice(0, markerAt) + raw.slice(markerAt + INSERT_MARKER.length);
    insertAt = markerAt;
  }

  const at = text.indexOf(anchor);
  if (at === -1) {
    fail(
      `op ${op.id}: its anchor was not found in upstream/${skill}. ` +
        `Upstream changed that text; review deltas/mappings/${skill}.md and re-specify the anchor.`,
    );
  }
  if (text.indexOf(anchor, at + 1) !== -1) {
    fail(`op ${op.id}: its anchor occurs more than once in upstream/${skill}; the anchor is ambiguous.`);
  }

  const edits = [];
  for (const replace of op.replaces) {
    const findAt = anchor.indexOf(replace.find);
    if (findAt === -1) {
      fail(`op ${op.id}: find ${JSON.stringify(replace.find)} was not found inside the anchor.`);
    }
    if (anchor.indexOf(replace.find, findAt + 1) !== -1) {
      fail(`op ${op.id}: find ${JSON.stringify(replace.find)} occurs more than once inside the anchor; it is ambiguous.`);
    }
    edits.push({ start: findAt, end: findAt + replace.find.length, text: replace.content });
  }
  if (insertAt !== -1) edits.push({ start: insertAt, end: insertAt, text: op.insert });

  for (let i = 0; i < edits.length; i += 1) {
    for (let j = i + 1; j < edits.length; j += 1) {
      const a = edits[i];
      const b = edits[j];
      if (a.start < b.end && b.start < a.end) {
        fail(`op ${op.id}: its edits overlap; an anchor's edits must be disjoint.`);
      }
    }
  }

  edits.sort((a, b) => a.start - b.start || a.end - b.end);

  let cursor = 0;
  let edited = '';
  for (const edit of edits) {
    edited += anchor.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  edited += anchor.slice(cursor);

  return text.slice(0, at) + edited + text.slice(at + anchor.length);
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
    text = applyOp(text, op, file.split('/')[0]);
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
