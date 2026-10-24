# Maintenance

[中文文档](./maintenance.cn.md)

This repository ships the eight reworked skills as a **delta overlay**: `upstream/` holds a snapshot of the original files, `deltas/mappings/*.md` describe every fork change as typed ops, and `skills/` is generated from the two. This guide covers the mechanics a maintainer needs — the manifest, the mapping format, the commands, and how to bump the snapshot. See the [README](../README.md) for what the repository is and how to install it, and the [upstream differences](./upstream-differences.md) for what the fork changes and why.

## Repository layout

| Path | Role |
| --- | --- |
| `upstream/` | Hand-copied snapshot of the eight upstream skill directories (`wayfinder`, `setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `ask-matt`, `prototype`, `code-review`, `tdd`). May carry CRLF; the build normalizes it on read. Files not listed in the manifest are ignored and never shipped. |
| [deltas/manifest.json](../deltas/manifest.json) | The `files` whitelist: the exact 17 files this repo ships for the eight skills. |
| `deltas/mappings/<skill>.md` | One mapping document per generated skill: the fork changes expressed as typed ops. The human review entry point; the eight documents are [wayfinder](../deltas/mappings/wayfinder.md), [setup-matt-pocock-skills](../deltas/mappings/setup-matt-pocock-skills.md), [to-spec](../deltas/mappings/to-spec.md), [to-tickets](../deltas/mappings/to-tickets.md), [ask-matt](../deltas/mappings/ask-matt.md), [prototype](../deltas/mappings/prototype.md), [code-review](../deltas/mappings/code-review.md) and [tdd](../deltas/mappings/tdd.md). |
| [deltas/build.mjs](../deltas/build.mjs) | Regenerates `skills/` from `upstream/` + mappings; `--check` verifies without writing. |
| [deltas/ops.mjs](../deltas/ops.mjs) | Op parsing and application, shared by the build and the preview so the two cannot disagree. |
| [deltas/check-upstream.mjs](../deltas/check-upstream.mjs) | Compares the snapshot with `mattpocock/skills`, over the GitHub API or a local checkout. |
| [deltas/preview.mjs](../deltas/preview.mjs) | Renders the mappings as a diff page (`deltas/preview.html`, gitignored). |
| `skills/` | The install artifact: generated files for the eight skills, plus the hand-written `lighthouse`, `backtracer`, `traverse`, `to-contract` and `test-audit`. |

## Generated files vs hand-written skills

`deltas/manifest.json` holds only a `files` array of `<skill>/<file>` paths. Only those paths are read from `upstream/` and written to `skills/`; the generated skill directories are derived from the first path segment.

- **Generated skills.** The eight reworked skills above. Their `skills/<skill>/` directories hold exactly the manifest whitelist and nothing else.
- **Hand-written skills.** [lighthouse](../skills/lighthouse/SKILL.md), [backtracer](../skills/backtracer/SKILL.md), [traverse](../skills/traverse/SKILL.md), [to-contract](../skills/to-contract/SKILL.md) and [test-audit](../skills/test-audit/SKILL.md) (including its suite reference) are native to this repository: not in the manifest, no `upstream/` counterpart, never touched by the build. Edit them directly.
- **Verbatim files.** A listed file with no mapping ops is copied from the snapshot byte for byte (after line-ending normalization). It is still generated, and still subject to the pruning below.

**Destructive pruning warning.** A writing build (`node deltas/build.mjs`) deletes every file inside a generated skill directory that is not in `manifest.files`, and removes the directories left empty. Never leave notes, scratch experiments or generated assets inside `skills/<skill>/` for one of the eight skills — they are removed without a prompt, including a committed file that upstream does not have. To ship an additional upstream file, copy it into `upstream/` and add it to the manifest.

## Edit mappings, not generated files

Never edit the 17 generated files under `skills/`: the next build overwrites them, or prunes them when they leave the manifest. Every change to a generated skill is expressed in `deltas/mappings/<skill>.md`, and the workflow is:

1. Edit the mapping document (one per skill; a skill whose files need no edits still needs its document).
2. Run `node deltas/build.mjs` to regenerate, or `node deltas/build.mjs --check` to verify without writing.
3. Inspect the regenerated result — `git diff skills/`, or the preview page.
4. Commit the mapping change together with the regenerated artifact.

A **mapping-only refactor** — renaming or splitting op IDs, moving prose, reordering ops without changing what they produce — must leave `skills/` byte for byte identical; after the rebuild, `git diff skills/` must be empty. That is how a review tells a structural cleanup from a behavior change, and a behavior change must show up as the corresponding `skills/` diff.

## One op, one behavior

Each op owns one independently changeable fork behavior, and its ID names that behavior rather than a step number or a location; two behaviors get two ops even when they touch the same region. During a snapshot bump each op either still applies (behavior untouched) or fails alone, so a human decides only the op whose anchor moved. Keep unrelated upstream wording outside the edits, and where a unique locator permits, outside the anchor too; prefer anchors in the snapshot over text generated by an earlier op, and state any necessary ordering dependency in the op's reason.

Re-specifying anchors for a new baseline and changing fork behavior are separate changes, so a diff never mixes "upstream reworded this" with "the fork decided something new" ([ADR 0002](./adr/0002-typed-anchored-ops.md)).

## Mapping document format

Each `deltas/mappings/<skill>.md` is a list of targets, each holding ops:

````text
# <skill>                      (must be exactly the skill name)
## <skill>/<file>              (a whitelisted target; omit targets with no ops)
### <op-id>                    (lowercase kebab-case, unique within the skill)
<reason prose: the fork behavior this op owns and why>

```op
anchor: |-
  <a span of upstream/<file> that must occur exactly once>
find: <text inside the anchor, occurring once>
content: <replacement; an empty value deletes the match>
insert: |-
  <text placed where the anchor carries the insert marker>
```
````

- **`anchor`** (required, non-empty) — a span of the upstream file that must occur exactly once. It gates the whole op: while it matches, every edit applies automatically; when upstream changes it, the build fails and names the op so a human re-specifies it.
- **`find` / `content`** — replaces `find` with `content`. `find` must occur exactly once inside the anchor (marker stripped); an empty `content` deletes the match; `find` and `content` that are identical are a no-op and fail. Pairs resolve against the anchor's original text, so their order in the block does not matter, and edits inside one op must not overlap.
- **`insert`** — places its content where the anchor carries the `<oh-my-wayfinder:insert>` marker, at most one marker per anchor. The marker is stripped before matching, so the anchor still reads as the literal upstream text around the insert point. A marker without an insert, or an insert without a marker, fails.
- **Block scalars** — `field: |` keeps one trailing newline, `field: |-` drops it; a short value may stay inline (`find: on resolution`). Indent every block-scalar line two spaces. Mapping documents are LF and end with a newline.
- **Ordering** — ops run in document order within a target, against the result of earlier ops.

Parse failures — a missing or duplicate field, a target outside the whitelist, a `find` without `content`, an op with no edits, an ID that is not lowercase kebab-case, a leftover diff-block, and other malformed input — fail the build, naming the mapping location and op. Advisory warnings (a `find` that shares word-boundary context with its content and can be narrowed) do not fail the build.

## Anchors and preserving upstream

- Keep upstream wording that the op does not own outside the edits, and outside the anchor where a unique locator permits.
- Keep `find` to the change itself, not the context around it: a wide `find` does not change what the build does (the anchor is the gate), but it repeats that context into `content` and hides what the op owns.
- Preserve upstream text verbatim in `anchor`/`find`. Keep Markdown tables column-aligned in their raw source, and column-align authored tables in `content:`/`insert:` and hand-written skills.
- Name fork-only sequence choices by their purpose (for example `mode`) when a word such as `branch` could be mistaken for a Git operation.
- Every file is LF: `.gitattributes` pins `* text=auto eol=lf`; the build fails on a bare CR and on a missing final newline.

## Commands

```bash
node deltas/build.mjs                         # regenerate skills/ and refresh deltas/preview.html
node deltas/build.mjs --check                 # verify committed skills/; writes and refreshes nothing
node deltas/preview.mjs                       # refresh only deltas/preview.html
node deltas/check-upstream.mjs                # list skills that differ from upstream HEAD
node deltas/check-upstream.mjs --verbose      # also list the differing files
node deltas/check-upstream.mjs --local <dir>  # compare against a local upstream checkout
```

**Build (`build.mjs`)** is pure text processing: no shell, no git, no network. A writing run also regenerates the preview, and a preview failure fails the build; `--check` stays read-only and reports the first differing line per file. The build normalizes CRLF from `upstream/` (with a note) and requires every other file, including the mappings, to be LF and to end with a newline.

**Snapshot check (`check-upstream.mjs`)** compares only the whitelisted files, normalizing the snapshot side (CRLF → LF) before hashing. By default it asks the GitHub API for `commits/HEAD` and a recursive tree — two unauthenticated requests per run (60 per hour; set `GITHUB_TOKEN` to raise the limit). `--local <dir>` compares against an existing checkout, for example `--local ../mattpocock-skills`, and stamps the report with that checkout's `HEAD`. Exit codes: `0` every skill matches, `1` at least one differs, `2` the comparison could not be made. The expected upstream layout is `skills/engineering/<skill>`: a different found path is reported as a note, and a skill whose directory or whitelisted files are missing upstream is reported as removed.

**Preview (`preview.mjs`)** writes `deltas/preview.html` (gitignored): one self-contained page — no server, no dependencies — showing every op as a GitHub-style diff from `upstream/<file>` to the regenerated `skills/<file>`, with each changed block tagged by the op(s) that produced it. Clicking a tag shows that op's reason, anchor and edits. It replays the ops through `deltas/ops.mjs`, the same code the build uses, and cross-checks the result against the committed `skills/` files, reporting any mismatch in the page header. Use it to review mappings without reading op blocks by hand.

## Updating the upstream snapshot

The current snapshot corresponds to `mattpocock/skills` commit `f3fc5632f401156837ee3872f14fe33ccf1024ea`. This is the single place the provenance is recorded; update it when the snapshot moves (the check output names the revision it compared against).

1. Copy all eight complete skill directories from the selected upstream checkout into `upstream/`, replacing the previous snapshot. Copying extra files is fine: the build ignores anything not in the manifest.
2. Adapt every mapping anchor and edit against the new baseline, preserving both upstream's fixes and the fork's approved semantics. Expect some ops to fail the build with a named anchor — that is the review point, not an accident.
3. Run `node deltas/build.mjs`, then inspect the regenerated diff (the preview page, or `git diff skills/`).
4. Run `node deltas/build.mjs --check`.
5. Run `node deltas/check-upstream.mjs --local <checkout>` to confirm the snapshot matches the checkout you copied from.
6. Exercise the affected workflow paths as a human scenario (below); the build cannot tell you the rules still work.

**EOF anchor blind spot.** An op whose anchor reaches the end of its file cannot detect text that upstream appends after that anchor: the anchor still matches once, so the appended text silently survives past the replacement. After every snapshot bump, read the regenerated `skills/` diff for text that survived past a replacement — the `completion` op in [deltas/mappings/tdd.md](../deltas/mappings/tdd.md) is anchored this way. A listed file that upstream removed fails the build.

## What the checks do not prove

- **`build.mjs --check`** proves that the committed `skills/` files are exactly what the mappings produce from the current `upstream/` snapshot. It says nothing about whether the snapshot is current, or whether the resulting rules behave correctly.
- **`check-upstream.mjs`** proves that the snapshot matches a given upstream revision for the whitelisted files, after line-ending normalization. It does not cover non-whitelisted files, and it does not say whether the mappings still express the fork's intent; remote HEAD can move after the run.
- Neither check compares the regenerated text with the fork's intent, and neither runs an agent. Behavior, ordering and human-facing prose need **human scenario verification**: exercise the affected workflow paths — for example, run the changed flow in a scratch repository and read what the skill actually does — and record the evidence as the ADRs do. A passing build check alone does not prove the snapshot is current, and a clean preview does not prove an op still owns the right behavior.

## Related

- [README](../README.md) — what the repository is, installation, and the flows.
- [Upstream differences](./upstream-differences.md) — what the fork changes.
- [ADR 0002: typed, anchored ops](./adr/0002-typed-anchored-ops.md) — why ops are anchor-gated; the other ADRs in `docs/adr/` record specific decisions.
- Code: [manifest](../deltas/manifest.json), [build.mjs](../deltas/build.mjs), [ops.mjs](../deltas/ops.mjs), [check-upstream.mjs](../deltas/check-upstream.mjs), [preview.mjs](../deltas/preview.mjs).
