---
name: to-tickets
description: Break an approved contract into a set of tracer-bullet tickets, each declaring its blocking edges and the promises it delivers, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
disable-model-invocation: true
---

# To Tickets

Break an approved contract into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it and the promises it **delivers**.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a contract path, an issue number or URL) as an argument, fetch it and read its full body and comments. The contract links the spec it came from, so read the spec too.

**A ticket set is cut from an approved contract.** If no contract exists for this work, stop and tell the user to run `/to-contract` first. Do not reconstruct the promises or the seams here — a ticket set built without them is guesswork.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

State what each ticket delivers, in the contract's terms:

- **`Delivers: P1, P2`** — the promises this ticket makes observable.
- **`enabling: unblocks P3`** — for a ticket that delivers no promise of its own (scaffolding, walking skeleton, prefactor). An enabling ticket earns its place by unblocking a promise, not by existing.

Every promise in the contract must be delivered by at least one ticket, and every ticket must either deliver a promise or be labelled enabling.

When a promise spans more than one ticket, **one of those tickets owns writing its tests** — name the owner when the promise is split, so the test does not fall between two tickets. Ownership is per test case; the promise completes as a whole. If no single ticket can observe the promise on its own, either designate one verification ticket (blocked by every contributing ticket) to own the tests, or write the test early on the first ticket and let it stay red until the last contributor lands.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **Delivers**: the contract promise IDs this ticket makes observable — or the promise it unblocks, for an enabling slice
- **What it delivers**: the end-to-end behaviour this ticket makes work

For every promise that spans more than one ticket, also show a **coverage partition** — its coverage items mapped to the ticket and the test owner, so no item is orphaned and none is claimed twice:

<coverage-partition>

Promise P3 — coverage partition

| Coverage item      | Ticket | Test owner |
|--------------------|--------|------------|
| nested directories | 02     | 02         |
| empty directory    | 03     | 03         |
| permission error   | 04     | 04         |

</coverage-partition>

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Is every promise in the contract delivered by at least one ticket — and does every ticket either deliver a promise or earn its place as an enabling slice?
- For every promise that spans tickets: does each coverage item have exactly one owner ticket — no orphan, no duplicate — and does the promise name who writes its tests?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/setup-matt-pocock-skills` configured; the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/implementation/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise; the tickets are agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

<local-ticket-template>

# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

**Delivers:** P1, P2 (or "enabling: unblocks P3")

**Test owner for:** P3 (omit this line unless this ticket writes tests for a promise it does not itself complete)

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None (can start immediately)".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Delivers

- P1, P2 (or "enabling: unblocks P3")
- Test owner for P3 (omit this line unless this ticket writes tests for a promise it does not itself complete)

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)".

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
