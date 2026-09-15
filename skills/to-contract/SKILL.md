---
name: to-contract
description: Turn a spec into an approved contract — the promise list and the seam decisions the build will be held to, for tickets, tests and QA to reference.
disable-model-invocation: true
---

# To Contract

Turn a spec into an **approved contract**: the promises this feature makes, and the seams at which they will be observed. This is the step between `to-spec` and `to-tickets`.

The contract is a **decision artifact**, not a narrative. The spec says why this work exists and what it is for; the contract says what is promised, where each promise becomes observable, and what stays free behind the seam. `/to-tickets` slices against it, acceptance tests and QA verify against it.

Do not write code, and do not re-interview the user about the requirement — the spec already holds that. The only questions this skill asks are the decision criteria in step 4.

## Loads

- Call the Skill tool with "codebase-design" before proposing any seam. It is the single owner of the **module / interface / seam / adapter / depth / leverage / locality** vocabulary and its principles — the deletion test, "the interface is the test surface", internal vs external seams, "one adapter means a hypothetical seam, two means a real one". Use its terms exactly; do not drift into "component", "service", "API" or "boundary".
- When the promises cross an external dependency, use codebase-design's dependency categories to choose the stand-in / adapter / mock shape.
- When two or more seam layouts are viable, use codebase-design's design-it-twice pattern to generate alternatives, then compare on depth, locality, and seam placement.
- Reading `CONTEXT.md` for domain vocabulary is a one-line habit. Call the Skill tool with "domain-modeling" only when a term is being resolved or an ADR is being written.
- **Seam placement rules live in this skill, deliberately:** prefer existing seams, take the highest seam that carries the promise, keep the count low (ideal one). They are not delegated to codebase-design. If a second skill ever needs them, move them then — lazy centralisation, not before.
- This skill depends on codebase-design staying model-invoked.

## Prerequisites

The issue tracker and triage vocabulary should have been provided by `/setup-matt-pocock-skills`. You need: the spec (issue or path), `CONTEXT.md`, the ADRs in the area you are touching, and the existing seams in the code.

If there is no spec, tell the user to run `/to-spec` first. Do not reconstruct one.

## Process

### 1. Read, and inherit

Read the spec in full — Problem Statement, Solution, User Stories, Implementation Decisions, Out of Scope, Further Notes.

List what is already decided upstream — the spec's Implementation Decisions, ADRs, resolved design tickets — and do not re-litigate it. In the contract, inherited decisions are facts, not questions.

### 2. Draft the promises

Distill the User Stories into **promises**: one observable result per line, deduplicated across stories. A promise is not a story — N stories may collapse into M promises.

For each promise record: the promise itself, its coverage, its source, the seam it is observed at, and — later, filled in by `/to-tickets` — what delivers it.

- **Expected outcomes come from the promise, never from the implementation.** A value recomputed the way the code computes it is tautological and proves nothing; expected values are independent literals, worked examples, or the spec itself.
- **Traverse past the literal spec.** For each capability, walk the existing system's symmetry (what does the sibling feature expose?), the dependencies it implies, and the six surfaces in step 3. Anything the spec did not say is marked `inferred` — that is where the human's attention goes.
- **Status is derived, not stored.** A promise is done when every ticket that delivers it is closed (later: when its acceptance test passes). Never hand-maintain a status column; generate a checklist from the contract and the tracker when the human asks for one.

### 3. Derive the seams

Promises are observed somewhere; that somewhere is a seam. Work in this order:

1. **Observations.** For each promise ask: who observes this, and where? That boundary is a candidate seam.
2. **Inventory.** List the seams the codebase already has — module interfaces, entry points, config, persistence, external dependencies, error surface.
3. **Diff.** Prefer existing seams, and take the **highest** seam that carries the promise. Fewer seams is better; the ideal number is one.
4. **Surface walk.** If the promise set touches them, walk the six surfaces so nothing operational is missed: **entry** (CLI / API / UI / library), **data and state** (schema, files, config), **external dependencies** (third party, time, randomness, filesystem), **errors and failure** (error types, exit codes, timeouts, retries), **output and observability** (stdout, reports, logs, metrics), **resources and concurrency** (ownership, resource bounds, cost envelope — usually attached to another seam rather than its own row).
5. **Collapse.** Merge seams that carry the same promises. Every new seam must earn its keep: name what actually varies across it.

Stopping rules:

- a promise with no seam is **untestable** — fix the promise, or raise the seam;
- a seam carrying no promise is implementation detail or speculation — move it out;
- needing two seams to verify one promise means the seams are **too low** — take the common entry point.

Never list private modules, file paths, or internal helpers. Those are internal seams, and they are the agent's business, not the contract's.

### 4. Propose, then ask for what only the human knows

For each seam decision, present one or two alternatives, the trade-off, a reversibility grade, and **your recommendation**. Be opinionated: the human wants a strong read, not a menu.

Reversibility decides who has to look:

- **low reversibility** (public API, error semantics, ownership and resource bounds, concurrency and cost envelope) → the human decides;
- **high reversibility** (internal seams, cheap to rewrite) → delegate, or approve in a batch.

The choice turns on facts that are not in the spec or the code. **Ask for them; do not guess.** At minimum:

- What will this area have to grow into over the next few months?
- Which constraints are non-negotiable — performance, concurrency, compliance, ownership, cost?
- How much rework is this version allowed to accept?

Iterate until the human approves the promise list and the seam decisions.

### 5. Record the decision

Record what was decided, which alternatives were rejected, and why. A rejection without a reason gets re-proposed in six months.

When a decision is hard to reverse, surprising without context, and the result of a real trade-off, offer an ADR: call the Skill tool with "domain-modeling".

### 6. Write the contract

Write it to `.scratch/<feature-slug>/contract.md` (or beside wherever this repo keeps per-feature scratch), and link it from the spec issue. Template:

<contract-template>

# Contract — <feature>

Source: <spec link or issue reference>

## Promises

| # | Promise (one observable result) | Coverage | Source | Seam |
|---|--------------------------------|----------|--------|------|
| P1 | | | story 4 / inferred | |

## Seam decisions

| Seam | Exposes | Hides | Alternatives considered | Reversibility |
|------|---------|-------|-------------------------|---------------|
| | | | | |

## Not yet specified

<!-- seams you can see coming but cannot state precisely yet. Do not pre-slice. -->

## Out of scope

<!-- inherited from the spec; the contract never adds to it -->

</contract-template>

One fact, one home: the spec owns the narrative and the scope; the contract owns the promises and the seams; the tickets own the slices. Do not restate user stories, prose rationale, or scope inside the contract.

### 7. Report coverage

Close with checks, not prose:

- every promise maps to at least one seam — list any exception;
- every seam carries at least one promise — list any exception;
- all six surfaces walked — say which were not relevant, and why;
- what remains in **Not yet specified**.

## Rules

- **Never decide what you cannot see.** Seams the next slice does not touch go to *Not yet specified* — a contract that pre-decides everything is a waterfall plan.
- **Seams are hypotheses.** When implementation disproves one, change the contract, and take it to an ADR if it is hard to reverse. Never let code and contract drift silently.
- **The contract is not a plan.** It says what is promised and where it is observable; it never says in what order to build.
- **No paths, no private names.** They go stale, and they are not promises.
- **No duplication.** Reference the spec and the stories by link and number; never copy them in.

## Upstream deltas this skill assumes

- **`to-spec`** — the seam sketch and the seam half of Testing Decisions move here. Leave in the spec: the narrative, the scope, the implementation decisions, and a pointer to prior art for tests.
- **`to-tickets`** — each ticket gains one line, `Delivers: P1, P2` (or `enabling: unblocks P3`). Its quiz gains one question (does every promise have a ticket, and does every ticket either deliver a promise or earn its place as an enabling slice?) and, for a promise that spans tickets, a coverage-partition table naming the ticket that owns each coverage item and the tests. A promise completes only when every ticket declaring it is closed and its tests pass.
- **`implement` and `tdd`** — unchanged. The contract's seams are the "pre-agreed seams"; the promise list is where acceptance tests are written from. If `/to-tickets` is run with no contract, it should stop and ask for one.

## What comes next

Tell the user to run `/to-tickets .scratch/<feature-slug>/contract.md`. The contract's source and seam table are what make the tickets' acceptance criteria and blocking edges honest.

When the work later disproves a seam or a promise, revise the contract first, then re-open the affected tickets — never the other way round.
