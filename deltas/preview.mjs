#!/usr/bin/env node
// Render every mapping op as a GitHub-style, human-readable diff: deltas/preview.html
//
//   node deltas/preview.mjs
//
// The output is one self-contained HTML file (no server, no network, no dependencies) that
// you open directly. It is a build artifact: deltas/preview.html is gitignored.
//
// The diff shown is the real one -- `upstream/<file>` to the regenerated `skills/<file>` --
// with every changed block attributed to the op(s) that produced it. That attribution comes
// from replaying the ops in memory through deltas/ops.mjs, the same code `build.mjs` uses, so
// the view cannot disagree with the build about what an op does. Each file is also compared
// against the committed `skills/` copy, and a mismatch is reported in the page header rather
// than hidden.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSERT_MARKER, MappingError, OpError, parseMappings, resolveOp } from './ops.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'deltas', 'preview.html');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function rel(path) {
  return relative(root, path).replaceAll('\\', '/');
}

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
  if (text.includes('\r')) text = text.replaceAll('\r\n', '\n');
  if (text.includes('\r')) fail(`${what} contains a bare CR byte, not a CRLF line ending: ${rel(path)}`);
  if (!text.endsWith('\n')) fail(`${what} must end with a newline: ${rel(path)}`);
  return text;
}

// ---------------------------------------------------------------------------
// Line diff (LCS). The mapped files are small (<= ~130 lines), so the full table is cheap.
// ---------------------------------------------------------------------------
function diffScript(a, b) {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * w + j] =
        a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const script = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      script.push({ t: 'eq', ai: i, bi: j });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      script.push({ t: 'del', ai: i });
      i += 1;
    } else {
      script.push({ t: 'ins', bi: j });
      j += 1;
    }
  }
  while (i < n) {
    script.push({ t: 'del', ai: i });
    i += 1;
  }
  while (j < m) {
    script.push({ t: 'ins', bi: j });
    j += 1;
  }
  return script;
}

// Intra-line word diff: mark the tokens that actually changed inside a modified line.
function tokenize(line) {
  return line.match(/\s+|[A-Za-z0-9_]+|[^A-Za-z0-9_\s]+/g) ?? [];
}

function pushPart(parts, text, eq) {
  if (text === '') return;
  const last = parts[parts.length - 1];
  if (last && last.eq === eq) last.text += text;
  else parts.push({ text, eq });
}

function wordDiff(aText, bText) {
  const a = tokenize(aText);
  const b = tokenize(bText);
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * w + j] =
        a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const aParts = [];
  const bParts = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushPart(aParts, a[i], true);
      pushPart(bParts, b[j], true);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      pushPart(aParts, a[i], false);
      i += 1;
    } else {
      pushPart(bParts, b[j], false);
      j += 1;
    }
  }
  while (i < n) pushPart(aParts, a[i], false), (i += 1);
  while (j < m) pushPart(bParts, b[j], false), (j += 1);
  return { a: aParts, b: bParts };
}

// Turn the script into unified rows, split rows, and changed blocks, each block carrying the
// set of op ids that produced its upstream-deleted and result-added lines.
function buildDiff(a, b, upOwners, resOwners) {
  const script = diffScript(a, b);
  const unified = [];
  const split = [];
  const blocks = [];
  let added = 0;
  let removed = 0;
  let i = 0;

  while (i < script.length) {
    if (script[i].t === 'eq') {
      const rowStart = unified.length;
      while (i < script.length && script[i].t === 'eq') {
        const { ai, bi } = script[i];
        unified.push({ k: 'eq', an: ai + 1, bn: bi + 1, text: a[ai], aParts: null, bParts: null });
        split.push({
          b: blocks.length,
          l: { k: 'eq', n: ai + 1, text: a[ai], parts: null },
          r: { k: 'eq', n: bi + 1, text: b[bi], parts: null },
        });
        i += 1;
      }
      blocks.push({ kind: 'eq', rowStart, rowCount: unified.length - rowStart, owners: [] });
      continue;
    }

    const rowStart = unified.length;
    const dels = [];
    const adds = [];
    while (i < script.length && script[i].t !== 'eq') {
      const step = script[i];
      if (step.t === 'del') dels.push(step.ai);
      else adds.push(step.bi);
      i += 1;
    }

    const owners = new Set();
    for (const ai of dels) for (const id of upOwners[ai]) owners.add(id);
    for (const bi of adds) for (const id of resOwners[bi]) owners.add(id);

    // Pair the k-th deleted line with the k-th added line so the two sides can be shown
    // side by side and word-diffed against each other.
    const pairs = [];
    const count = Math.max(dels.length, adds.length);
    for (let k = 0; k < count; k += 1) {
      const ai = k < dels.length ? dels[k] : null;
      const bi = k < adds.length ? adds[k] : null;
      if (ai !== null && bi !== null) {
        const wd = wordDiff(a[ai], b[bi]);
        pairs.push({ ai, bi, ap: wd.a, bp: wd.b });
      } else {
        pairs.push({ ai, bi, ap: null, bp: null });
      }
    }

    for (const pair of pairs) {
      if (pair.ai === null) continue;
      unified.push({ k: 'del', an: pair.ai + 1, bn: null, text: a[pair.ai], aParts: pair.ap, bParts: null });
      removed += 1;
    }
    for (const pair of pairs) {
      if (pair.bi === null) continue;
      unified.push({ k: 'add', an: null, bn: pair.bi + 1, text: b[pair.bi], aParts: null, bParts: pair.bp });
      added += 1;
    }
    for (const pair of pairs) {
      split.push({
        b: blocks.length,
        l: pair.ai === null ? null : { k: 'del', n: pair.ai + 1, text: a[pair.ai], parts: pair.ap },
        r: pair.bi === null ? null : { k: 'add', n: pair.bi + 1, text: b[pair.bi], parts: pair.bp },
      });
    }

    blocks.push({ kind: 'chg', rowStart, rowCount: unified.length - rowStart, owners: [...owners] });
  }

  return { unified, split, blocks, added, removed };
}

// Which op(s) produced each line: for the upstream side, the ops that deleted those
// characters; for the result side, the op whose edit wrote them.
function ownersByLine(text, ownersForChar) {
  const owners = text.split('\n').map(() => new Set());
  let line = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      continue;
    }
    const found = ownersForChar(i);
    if (found) for (const id of found) owners[line].add(id);
  }
  return owners.map((set) => [...set]);
}

// Replay every op over the upstream text, tracking per-character provenance so a changed
// block can be traced back to the op that caused it. `origins[i] >= 0` means ops[origins[i]]
// wrote the character; `origins[i] < 0` means it is the original upstream character at
// index `-1 - origins[i]`.
//
// The user maintains that ops never touch each other's output; if they ever do, the later
// op simply wins the attribution rather than corrupting it, and the block ends up owned by
// both ops.
function replay(ops, text, skill) {
  const deletedUpstream = new Map();
  let origins = [];
  for (let i = 0; i < text.length; i += 1) origins.push(-1 - i);
  let current = text;

  ops.forEach((op, index) => {
    let resolved;
    try {
      resolved = resolveOp(current, op, skill);
    } catch (error) {
      if (error instanceof OpError) fail(error.message);
      throw error;
    }

    for (const edit of resolved.edits) {
      for (let i = edit.start; i < edit.end; i += 1) {
        const origin = origins[i];
        if (origin >= 0) continue; // written by an earlier op: a rewrite, not an upstream deletion
        const upstreamIndex = -1 - origin;
        if (!deletedUpstream.has(upstreamIndex)) deletedUpstream.set(upstreamIndex, new Set());
        deletedUpstream.get(upstreamIndex).add(op.id);
      }
    }

    const outText = [];
    const outOrigins = [];
    let cursor = 0;
    for (const edit of resolved.edits) {
      outText.push(current.slice(cursor, edit.start));
      for (let i = cursor; i < edit.start; i += 1) outOrigins.push(origins[i]);
      outText.push(edit.text);
      for (let i = 0; i < edit.text.length; i += 1) outOrigins.push(index);
      cursor = edit.end;
    }
    outText.push(current.slice(cursor));
    for (let i = cursor; i < current.length; i += 1) outOrigins.push(origins[i]);
    current = outText.join('');
    origins = outOrigins;
  });

  return { text: current, origins, deletedUpstream };
}

function segmentize(text, marks) {
  const out = [];
  let cursor = 0;
  for (const mark of marks) {
    if (cursor < mark.start) out.push({ k: 'eq', s: text.slice(cursor, mark.start) });
    out.push({ k: mark.kind, s: text.slice(mark.start, mark.end) });
    cursor = mark.end;
  }
  if (cursor < text.length) out.push({ k: 'eq', s: text.slice(cursor) });
  return out;
}

// The op's own before/after: its anchor with each `find` marked, and the anchor after the
// edits are applied with the inserted/replaced text marked.
function opDisplay(op) {
  const raw = op.anchor;
  const markerAt = raw.indexOf(INSERT_MARKER);

  const marks = [];
  if (markerAt !== -1) marks.push({ start: markerAt, end: markerAt + INSERT_MARKER.length, kind: 'marker' });
  for (const replace of op.replaces) {
    const at = raw.indexOf(replace.find);
    if (at !== -1) marks.push({ start: at, end: at + replace.find.length, kind: 'find' });
  }
  marks.sort((x, y) => x.start - y.start);
  const anchorSegments = segmentize(raw, marks);

  const stripped = markerAt === -1 ? raw : raw.slice(0, markerAt) + raw.slice(markerAt + INSERT_MARKER.length);
  const edits = [];
  for (const replace of op.replaces) {
    const at = stripped.indexOf(replace.find);
    if (at !== -1) edits.push({ start: at, end: at + replace.find.length, text: replace.content });
  }
  if (markerAt !== -1) edits.push({ start: markerAt, end: markerAt, text: op.insert });
  edits.sort((x, y) => x.start - y.start || x.end - y.end);

  const afterSegments = [];
  let cursor = 0;
  for (const edit of edits) {
    if (cursor < edit.start) afterSegments.push({ k: 'eq', s: stripped.slice(cursor, edit.start) });
    if (edit.text !== '') afterSegments.push({ k: 'ins', s: edit.text });
    cursor = edit.end;
  }
  if (cursor < stripped.length) afterSegments.push({ k: 'eq', s: stripped.slice(cursor) });

  return { anchorSegments, afterSegments };
}

// ---------------------------------------------------------------------------
// Build the model
// ---------------------------------------------------------------------------
const manifest = JSON.parse(readText(join(root, 'deltas', 'manifest.json'), 'manifest'));
const files = manifest.files;
if (!Array.isArray(files) || files.length === 0) fail('manifest.files must be a non-empty array of paths');

const generatedDirs = [...new Set(files.map((file) => file.split('/')[0]))];
const listed = new Set(files);

const warnings = [];
const opsByFile = {};
for (const skill of generatedDirs) {
  const path = join(root, 'deltas', 'mappings', `${skill}.md`);
  const text = readText(path, 'mapping document');
  try {
    Object.assign(
      opsByFile,
      parseMappings({
        skill,
        listed,
        text,
        onWarn: (line, opId, message) => warnings.push({ file: rel(path), line, opId: opId ?? null, message }),
      }),
    );
  } catch (error) {
    if (error instanceof MappingError) {
      fail(`${rel(path)}:${error.line}${error.opId ? ` (op ${error.opId})` : ''}: ${error.message}`);
    }
    throw error;
  }
}

const drift = [];
const skills = [];
let opTotal = 0;

for (const skill of generatedDirs) {
  const skillFiles = [];
  for (const file of files.filter((f) => f.startsWith(`${skill}/`))) {
    const ops = opsByFile[file] ?? [];
    opTotal += ops.length;

    const upstream = readUpstream(join(root, 'upstream', file), `upstream source ${file}`);
    const replayed = replay(ops, upstream, skill);

    const targetPath = join(root, 'skills', file);
    if (!existsSync(targetPath)) {
      drift.push({ path: file, message: `skills/${file} is missing; run: node deltas/build.mjs` });
    } else if (readFileSync(targetPath, 'utf8') !== replayed.text) {
      drift.push({ path: file, message: `skills/${file} differs from the replayed ops; run: node deltas/build.mjs` });
    }

    const upLines = upstream.split('\n').slice(0, -1);
    const resLines = replayed.text.split('\n').slice(0, -1);
    const upOwners = ownersByLine(upstream, (i) => replayed.deletedUpstream.get(i));
    const resOwners = ownersByLine(replayed.text, (i) => {
      const origin = replayed.origins[i];
      return origin >= 0 ? [ops[origin].id] : null;
    });

    const { unified, split, blocks, added, removed } = buildDiff(upLines, resLines, upOwners, resOwners);

    const blockIndex = new Map();
    blocks.forEach((block, index) => {
      for (const id of block.owners) {
        if (!blockIndex.has(id)) blockIndex.set(id, []);
        blockIndex.get(id).push(index);
      }
    });

    const fileOps = ops.map((op) => {
      const display = opDisplay(op);
      return {
        id: op.id,
        line: op.line,
        reason: op.reason,
        anchorSegments: display.anchorSegments,
        afterSegments: display.afterSegments,
        edits: op.replaces.map((replace) => ({ find: replace.find, content: replace.content })),
        insert: op.insert ?? null,
        blocks: blockIndex.get(op.id) ?? [],
      };
    });

    skillFiles.push({
      path: file,
      ops: fileOps,
      unified,
      split,
      blocks,
      added,
      removed,
    });
  }
  skills.push({ name: skill, files: skillFiles });
}

const model = {
  generatedAt: new Date().toISOString(),
  stats: {
    skills: skills.length,
    files: files.length,
    ops: opTotal,
    warnings: warnings.length,
    drift: drift.length,
  },
  warnings,
  drift,
  skills,
};

// ---------------------------------------------------------------------------
// Assemble one self-contained document
// ---------------------------------------------------------------------------
const css = readText(join(root, 'deltas', 'preview.css'), 'preview stylesheet');
const client = readText(join(root, 'deltas', 'preview.client.js'), 'preview client script');
const json = JSON.stringify(model).replace(/</g, '\\u003c');

const html = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>oh-my-wayfinder &middot; mapping preview</title>',
  '<style>',
  css,
  '</style>',
  '</head>',
  '<body>',
  '<div id="app"></div>',
  '<script id="preview-data" type="application/json">',
  json,
  '</script>',
  '<script>',
  client,
  '</script>',
  '</body>',
  '</html>',
  '',
].join('\n');

writeFileSync(output, html, 'utf8');

console.log(
  `wrote     ${rel(output)}  (${skills.length} skill(s), ${files.length} file(s), ${opTotal} op(s), ` +
    `${warnings.length} warning(s), ${Buffer.byteLength(html)} bytes)`,
);
for (const item of warnings) {
  console.warn(`warning: ${item.file}:${item.line}${item.opId ? ` (op ${item.opId})` : ''}: ${item.message}`);
}
for (const item of drift) {
  console.warn(`warning: ${item.message}`);
}
