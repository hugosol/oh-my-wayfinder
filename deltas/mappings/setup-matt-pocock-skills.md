# setup-matt-pocock-skills

## setup-matt-pocock-skills/SKILL.md

### triage-labels-bullet

Two ticket vocabularies instead of five canonical roles.

```diff
-- **Triage labels**: the strings used for the five canonical triage roles
+- **Triage labels**: the strings used for issue statuses, with separate vocabularies for decision tickets and implementation tickets
```

### section-b-defaults

Section B asks about the decision and implementation vocabularies plus the shared labels.

```diff
-The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the overrides so `triage` applies existing labels instead of creating duplicates.
+The defaults define two ticket systems with separate status vocabularies: Decision tickets (`open` / `claimed` / `resolved`) and Implementation tickets (`ready-for-agent` / `ready-for-human` / `in-progress` / `closed`), plus shared labels (`needs-triage` / `needs-info` / `wontfix`). On **yes**, write them as-is. Only if the user says no (usually because their tracker already uses other names) collect the overrides so `triage` applies existing labels instead of creating duplicates.
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
+| `resolved` | Decision made and recorded. **NO code has been written.** Code is written later from implementation tickets. |
+
+Decision tickets are NEVER implementation tasks. A `resolved` decision ticket means the decision is locked, not that code exists.
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
+## Shared (both ticket types)
+
+| Status | Meaning |
+|--------|---------|
+| `needs-triage` | Maintainer needs to evaluate this item |
+| `needs-info` | Waiting on reporter for more information |
+| `wontfix` | Will not be actioned |
+
+---
+
+When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from the appropriate ticket type's table above. Decision tickets and implementation tickets use **different** status vocabularies; never cross them.
```

## setup-matt-pocock-skills/issue-tracker-local.md

### local-conventions

decision/ and implementation/ are separate ticket directories.

```diff
-- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
+- **Decision tickets** (planning): `.scratch/<feature-slug>/decision/<NN>-<slug>.md`, numbered from `01`
+  → Produced by `/wayfinder`. Use Decision ticket statuses from `triage-labels.md`.
+- **Implementation tickets**: `.scratch/<feature-slug>/implementation/<NN>-<slug>.md`, numbered from `01`
+  → Produced by `/to-tickets`. Use Implementation ticket statuses from `triage-labels.md`.
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
+- **Decision ticket**: `.scratch/<effort>/decision/<NN>-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `open`/`claimed`/`resolved`.
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
+- **Resolve**: write the discussion results to the ticket body, then call the Skill tool with "lighthouse" to produce the lighthouse document in `lighthouse/`. Set `Status: resolved`, and append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
```
