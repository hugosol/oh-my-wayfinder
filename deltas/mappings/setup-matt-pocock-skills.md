# setup-matt-pocock-skills

## setup-matt-pocock-skills/SKILL.md

### triage-labels-bullet

Triage vocabulary belongs to implementation tickets; decision lifecycle is fixed by the tracker.

```diff
-- **Triage labels**: the strings used for the five canonical triage roles
+- **Triage labels**: the strings used for implementation-ticket triage; decision tickets use only `open` / `claimed` / `resolved`
```

### section-b-defaults

Section B configures implementation triage, not decision-ticket lifecycle states.

```diff
-The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the overrides so `triage` applies existing labels instead of creating duplicates.
+Triage applies only to implementation tickets. Its defaults are `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`; implementation also tracks `in-progress` and `closed`. Decision tickets use only `open` / `claimed` / `resolved`, independently of triage. On **yes**, write the defaults as-is. Otherwise collect implementation triage-label overrides so `triage` uses existing labels instead of creating duplicates.
```

## setup-matt-pocock-skills/triage-labels.md

### triage-labels-body

Use separate decision and implementation vocabularies rather than mapping every ticket to the same five roles.

```diff
-The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.
+This repo uses two distinct ticket systems with separate status vocabularies.
 
-| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
-| -------------------------- | -------------------- | ---------------------------------------- |
-| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
-| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
-| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
-| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
-| `wontfix`                  | `wontfix`            | Will not be actioned                     |
+## Decision tickets (wayfinder)
 
-When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.
+Decision tickets are **planning artifacts** produced by `/wayfinder`. They live in `.scratch/<feature>/decision/`. Each decision ticket asks "what should we decide?" and its lighthouse document records the decision.
 
-Edit the right-hand column to match whatever vocabulary you actually use.
+| Status | Meaning |
+|--------|---------|
+| `open` | Not yet claimed by an agent |
+| `claimed` | Agent is actively working on this decision |
+| `resolved` | Decision or confirmed out-of-scope disposition recorded; production delivery is tracked separately. |
+
+These are the only decision-ticket states. Research and prototype code may be evidence; `resolved` makes no claim about production delivery and stays unchanged when implementation finishes. For an out-of-scope disposition, follow wayfinder’s Out of scope procedure, including dependency review.
+
+## Implementation tickets (to-tickets)
+
+Implementation tickets are produced by `/to-tickets`. They live in `.scratch/<feature>/implementation/`. Each implementation ticket is a tracer-bullet vertical slice that delivers working, testable behaviour.
+
+| Status | Meaning |
+|--------|---------|
+| `ready-for-agent` | Fully specified, ready for an AFK agent to implement |
+| `ready-for-human` | Requires human implementation |
+| `in-progress` | Agent is actively implementing |
+| `closed` | Code implemented, tested, and merged |
+
+### Implementation-only triage
+
+| Status | Meaning |
+|--------|---------|
+| `needs-triage` | Maintainer needs to evaluate this item |
+| `needs-info` | Waiting on reporter for more information |
+| `wontfix` | Will not be actioned |
+
+---
+
+When a skill mentions a triage role (e.g. "apply the AFK-ready triage label"), use the implementation-ticket vocabulary above. Triage labels do not apply to decision tickets or their map.
```

## setup-matt-pocock-skills/issue-tracker-local.md

### local-conventions

decision/ and implementation/ are separate ticket directories.

```diff
-- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
+- **Decision tickets** (planning): `.scratch/<feature-slug>/decision/<NN>-<slug>.md`, numbered from `01`
+  → Produced by `/wayfinder`. Use only `open` / `claimed` / `resolved`, as defined under Wayfinding operations below; triage installation is not required.
+- **Implementation tickets**: `.scratch/<feature-slug>/implementation/<NN>-<slug>.md`, numbered from `01`
+  → Produced by `/to-tickets`. Use Implementation ticket statuses from `triage-labels.md`.
```

### local-status-field

Keep lifecycle independent of implementation triage.

```diff
-- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
+- Record a `Status:` line near the top of each ticket. Decision tickets use the lifecycle below; only implementation tickets use triage roles from `triage-labels.md`.
```

### local-blocking

A resolved disposition is not evidence that a prerequisite was supplied.

```diff
-- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
+- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every listed decision ticket is `resolved` and its recorded outcome satisfies the prerequisite. For a blocker listed in the map’s Out of scope, follow wayfinder’s disposition dependency review; status alone never unblocks its dependents.
```

### local-publish

Publishing routes decision tickets to decision/ and implementation tickets to implementation/.

```diff
-Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).
+Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed). Decision tickets go in `decision/`; implementation tickets go in `implementation/`.
```

### local-map-and-child

Child tickets are decision tickets with the open/claimed/resolved vocabulary.

```diff
 - **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
-- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
+- **Decision ticket**: `.scratch/<effort>/decision/<NN>-<slug>.md`, numbered from `01`, with the question in the body. `Type:` records the processing method (`research`/`prototype`/`grilling`/`task`). `Status:` is only `open` (unclaimed), `claimed` (being worked), or `resolved` (decision or confirmed out-of-scope disposition recorded, independent of production delivery).
```

### local-frontier

Keep the planning frontier limited to decision tickets.

```diff
-- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
+- **Frontier**: scan `.scratch/<effort>/decision/` for files that are open, unblocked, and unclaimed; first by number wins.
```

### local-resolve

Resolve runs lighthouse and records the discussion in the ticket body.

```diff
-- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
+- **Resolve**: follow wayfinder’s mandatory lighthouse and backtracer steps after recording the outcome in the ticket body. Set `Status: resolved`. Ordinary answers go to the map’s Decisions-so-far; confirmed out-of-scope dispositions follow wayfinder’s Out of scope procedure, including dependency review.
```
