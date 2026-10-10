---
name: backtracer
description: "Backtrace published Wayfinder results for upstream gaps and contradictions, or investigate a concrete conflict."
---

**Backtrace** the caller's published results and evidence through previously decided prerequisites to find gaps and contradictions, including published parts of unfinished tickets. Lighthouse carries approved policy between tickets; downstream tickets read it when they start or resume. Backtracer writes to a downstream ticket only to add a confirmed gap question it owns.

Backtracer traces and reports; the human judges whether a finding matters and how to resolve a conflict.

## Process

### 1. Load the trace sources

Read the map and identify this call's published changes, confirmation sources, evidence and concrete conflicts. With neither a changed result nor new conflict/evidence needing review, return without replaying the prior trace.

- **Upstream authorities**: follow the caller's prerequisite and result links through relevant previously decided topics. Read their current Lighthouse conclusions, including published parts of unfinished tickets.
- **Coverage**: query ticket titles, current questions, dependencies and actual statuses to locate providers and gap owners. Zoom a ticket's Handoff or evidence only to resolve a specific coverage ambiguity; history explains reasoning rather than creating current promises.
- **Reuse**: use sources already available in this call. Unrelated ticket discussions and Lighthouse documents stay outside the trace.

The Lighthouse format is defined in [its skill](../lighthouse/SKILL.md). For a linked legacy result without that format, use its ticket's current outcome and question as trace evidence.

Completion criterion: the changed-result scope and every relevant upstream prerequisite are identified; the needed authority topics and coverage scopes are available.

### 2. Extract signals

Extract three kinds of signals from the traced scope. These are mechanical extractions: pattern match, don't interpret.

**a) Intent signals**: from the traced Lighthouse topics' `## User stories` section:

For each "so that" clause, extract the **key noun phrases and verb phrases**: the concrete things the user wants and the actions they enable.

| "so that" clause                                               | Extracted signals                           |
| -------------------------------------------------------------- | ------------------------------------------- |
| "so that existing callers (CLI, scan, tests) need no changes"    | `CLI`, `scan`, `tests`, `callers unchanged`   |
| "so that users can operate the strategy from the command line"  | `command line`, `operate strategy`           |
| "so that the engine can iterate day-by-day and bar-by-bar"       | `iterate day-by-day`, `iterate bar-by-bar`    |

Discard connectors ("the", "a", "can", "is"). Keep the nouns and verbs that would appear in a ticket title or body.

**b) Pattern signals**: from the traced Lighthouse topics' `## Invariants` section:

For each invariant declaring pattern alignment, extract the **pattern name** and its **surface items** (e.g. "daily engine" → bat scripts, dashboard cards, CLI entry, config directory).

**c) Dependency signals**: from the caller and relevant upstream tickets:

Scan their current questions and outcomes for prerequisite actions; use the saved context to distinguish unanswered work from rejected or superseded exploration.

| If a ticket body contains…              | It implies a dependency on…                       |
| -------------------------------------- | ------------------------------------------------- |
| `scan`, `parameter scan`, `grid search` | a runnable backtest producing standardised output |
| `generate`, `produce`, `output`, `save` | the thing being generated already exists          |
| `load`, `read`, `fetch`, `query`         | the data source already exists                    |
| `dashboard`, `UI`, `web`                | a running service with an endpoint                |
| `analyse`, `report`, `summarise`        | the raw results already exist                     |

Completion criterion: every traced topic and upstream question is processed for its applicable signals.

### 3. Trace signals across the map

For each extracted signal, check the map's **current decision-question scopes** for a provider (resolved or open). A question already covering the signal is covered, not a new gap. An unresolved provider is not proof that the prerequisite is satisfied. A missing prerequisite or uncovered question is a **gap**; rejected branches and superseded text supply no current promise.

Exception: a signal appearing only in its producing ticket is not self-covered; find a different provider. An Out of scope ticket is disposition evidence, not a provider of its abandoned outcome. An in-scope dependency on it remains a gap unless a confirmed choice removes the requirement or another ticket provides it.

**Peer symmetry trace**: collect the surface items in a pattern, then those covered by tickets for the new concept. An absent item is a **peer asymmetry gap**.

**Layer trace**: locate a decision question providing each implied dependency. No provider → **layer gap**.

**Layer-integrity trace**: for the caller and traced upstream questions, check whether the content belongs to a different layer than the ticket's purpose. A scan ticket describing nested loops is an engine-layer action → **layer violation**.

**Conflict trace**: compare the caller's results/evidence with the traced upstream authorities. Report the contradictory statements, their sources and the exact question requiring a user ruling. Keep a disputed premise out of new final decisions; a fact or proposal does not authorize revising an approved choice. If a published spec/contract or active delivery relies on it, identify the affected handoff for reconsideration rather than treating document edits as a delivery update.

Completion criterion: every signal is covered or has a concrete gap/violation; each upstream contradiction identifies its authority and required ruling.

### 4. Report findings

Report actionable findings using the applicable sections below; omit empty sections. With no findings, return a short no-gap/no-conflict result without writing a new report.

```markdown
## Trace Report: <ticket title>

### Intent gaps
- **Missing operational surface**: "<signal>" from "<so that clause>" → no question covers it
  Peers that have it: <list>
- **Missing dependency**: "<signal>" from "<so that clause>" → no question provides it

### Layer gaps
- **Missing prerequisite**: ticket <name> implies dependency on "<signal>" → no provider

### Layer violations
- **Wrong layer**: ticket <name> contains <action>; belongs in <layer>, not <current layer>

### Peer asymmetry
- **Missing from <new concept>**: <surface item>; present in <pattern name> but absent here

### Conflicts
- **Contradictory upstream decision**: <old/new statements and authority links>
  Sources and scope: <confirmation/evidence>; required ruling: <question>
```

Group gaps by type; retain each applicable angle. Return findings to the caller for its working-ticket record; reconcile the same finding rather than appending unchanged reports.

Completion criterion: every finding has its sources, scope and unanswered question; an empty result needs no persistent report.

### 5. Assign gap questions

For each gap the user confirms needs follow-up, prefer an existing unresolved ticket whose decision scope owns the missing question. Add only that unanswered question and a source/evidence link, using its current Question or Handoff. Merge a repeated finding by topic; preserve other questions, recovery context, status and claim. Subject association alone is not ownership. With no new gap question, leave downstream tickets unchanged, including their legacy layout.

Conflicts remain reported questions until the user rules. An approved revision is published by the caller through [Lighthouse](../lighthouse/SKILL.md) at Wayfinder's [publication boundary](../wayfinder/SKILL.md#publication); Backtracer does not synchronize consumer inputs or revise policy. If a previously resolved upstream decision needs reopening, obtain the user's authorization for that specific question.

Completion criterion: each confirmed gap has an owner or remains in the follow-up batch; every conflict has an explicit pending or approved ruling. Downstream writes are limited to new gap questions.

### 6. Follow up on the remaining batch

For confirmed gap questions without a suitable owner, follow [Gap follow-up](GAP-FOLLOWUP.md). Return unapproved findings or pending conflict rulings to the caller; a pause need not force another interview. With no remaining confirmed gap batch, finish without a mode prompt.

Completion criterion: confirmed gap questions have follow-up outcomes or an owner, and pending findings/rulings are returned to the caller for its Handoff. A trace leaves publication and ticket lifecycle to Wayfinder.
