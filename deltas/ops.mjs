// Shared op logic for the delta overlay: parsing `deltas/mappings/<skill>.md` and applying
// the ops it describes to upstream text.
//
// Pure text processing: no filesystem, no process, no git. `build.mjs` (which regenerates
// `skills/`) and `preview.mjs` (which renders the mappings for humans) both import it, so
// the viewer cannot disagree with the build about what an op does.
//
// The format is described in docs/adr/0002-typed-anchored-ops.md and README.md "Sources & build".

export const INSERT_MARKER = '<oh-my-wayfinder:insert>';
const FIELD_NAMES = new Set(['anchor', 'find', 'content', 'insert']);
const FIELD_HEADER = /^([a-z]+):(?: (.*))?$/;

// A malformed mapping document. `line` is 1-based; `opId` is the enclosing op's id when the
// error happens inside one, so callers can reproduce the `path:line (op id): message` shape.
export class MappingError extends Error {
  constructor(line, opId, message) {
    super(message);
    this.name = 'MappingError';
    this.line = line;
    this.opId = opId;
  }
}

// An op that cannot be applied to the text it targets: anchor missing or ambiguous, find
// missing or ambiguous, or edits that overlap. `message` is complete and user-facing, and
// already names the op and the skill it failed on.
export class OpError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OpError';
  }
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

export function shorten(text, max = 48) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

// Parse one mapping document. `text` is the document's contents; `listed` is the set of
// whitelisted target paths from manifest.json; `skill` is the bare skill name (`wayfinder`).
// Returns `{ "<skill>/<file>": [op, ...] }`. Throws MappingError on any malformed input.
// `onWarn(line, opId, message)` is called for advisory findings (non-minimal finds).
export function parseMappings({ skill, listed, text, onWarn }) {
  const lines = text.split('\n');
  const opsByFile = {};
  const ids = new Set();
  let file;
  let op;
  let fence;

  const invalid = (line, message) => {
    throw new MappingError(line, op ? op.id : undefined, message);
  };

  const warn = (line, message) => {
    if (onWarn) onWarn(line, op ? op.id : undefined, message);
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
    opsByFile[file].push({
      id: op.id,
      line: op.line,
      reason: op.prose.join('\n').trim(),
      anchor: op.anchor,
      replaces: op.replaces,
      insert: op.insert,
    });
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
      op = {
        id: `${skill}/${id}`,
        line: number,
        anchor: undefined,
        replaces: [],
        insert: undefined,
        pending: undefined,
        hasBlock: false,
        prose: [],
      };
      continue;
    }
    if (/^\s*#/.test(line)) invalid(number, 'expected a ## target path or ### op heading');
    if (!op && line.trim() !== '') invalid(number, 'explanatory prose must belong to a ### op');
    if (op) op.prose.push(line);
  }

  if (fence) invalid(lines.length - 1, 'unterminated fenced block');
  finishOp(lines.length - 1);
  for (const [target, ops] of Object.entries(opsByFile)) {
    if (ops.length === 0) invalid(lines.length - 1, `target "${target}" has no ops; omit unchanged targets`);
  }
  return opsByFile;
}

// Locate an op in `text` and resolve its edits to absolute offsets in that text.
// The anchor (marker stripped) must occur exactly once; each find must occur exactly once
// inside the anchor; edits must not overlap. Returns `{ at, anchor, anchorLength, edits }`
// where `edits` are `{ start, end, text }` in `text` coordinates, sorted and disjoint.
// Throws OpError with a user-facing message otherwise.
export function resolveOp(text, op, skill) {
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
    throw new OpError(
      `op ${op.id}: its anchor was not found in upstream/${skill}. ` +
        `Upstream changed that text; review deltas/mappings/${skill}.md and re-specify the anchor.`,
    );
  }
  if (text.indexOf(anchor, at + 1) !== -1) {
    throw new OpError(`op ${op.id}: its anchor occurs more than once in upstream/${skill}; the anchor is ambiguous.`);
  }

  const edits = [];
  for (const replace of op.replaces) {
    const findAt = anchor.indexOf(replace.find);
    if (findAt === -1) {
      throw new OpError(`op ${op.id}: find ${JSON.stringify(replace.find)} was not found inside the anchor.`);
    }
    if (anchor.indexOf(replace.find, findAt + 1) !== -1) {
      throw new OpError(`op ${op.id}: find ${JSON.stringify(replace.find)} occurs more than once inside the anchor; it is ambiguous.`);
    }
    edits.push({ start: findAt, end: findAt + replace.find.length, text: replace.content });
  }
  if (insertAt !== -1) edits.push({ start: insertAt, end: insertAt, text: op.insert });

  for (let i = 0; i < edits.length; i += 1) {
    for (let j = i + 1; j < edits.length; j += 1) {
      const a = edits[i];
      const b = edits[j];
      if (a.start < b.end && b.start < a.end) {
        throw new OpError(`op ${op.id}: its edits overlap; an anchor's edits must be disjoint.`);
      }
    }
  }

  edits.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    at,
    anchor,
    anchorLength: anchor.length,
    edits: edits.map((edit) => ({ start: at + edit.start, end: at + edit.end, text: edit.text })),
  };
}

// Apply one op to `text`, returning the result. Throws OpError if the op does not fit.
export function applyOp(text, op, skill) {
  const { at, edits } = resolveOp(text, op, skill);
  let cursor = at;
  let out = text.slice(0, at);
  for (const edit of edits) {
    out += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}
