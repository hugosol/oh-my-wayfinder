---
name: backtracer
description: "Trace newly recorded Wayfinder conclusions for map gaps and conflicts, including partial results saved during a pause."
---

A Wayfinder map carries decision tickets and Lighthouse conclusions, including confirmed results from unfinished tickets. At a pause, completion, or concrete conflict, **trace** the caller's recorded results and evidence across the map. Keep the existing gap checks and also compare related current conclusions for contradictions.

Backtracer does not judge whether a gap matters. It traces and reports. The human judges.

## Process

### 1. Load the trace sources

Load the wayfinder map (label `wayfinder:map`). Read the map body, then fetch:

- **All child tickets**: read their current question, saved handoff/discussion, and actual status fields; index membership is not ticket status.
- **Current Lighthouse conclusions**: follow the map and ticket links, including confirmed parts of unfinished tickets. Use histories as evidence of reasoning, not current requirements.
- **This call**: identify the caller's new/changed results, confirmation sources, evidence, and any old assumption needing review. A call with no new choice can still investigate a conflict.

Lighthouse documents must follow the format defined in **/lighthouse**'s [SKILL.md](../lighthouse/SKILL.md) (the `<lighthouse-template>`). If a lighthouse document doesn't follow this format, still read the decision ticket body; body-level trace (Step 2c) runs on every ticket regardless.

Completion criterion: map body + every decision ticket body + every lighthouse document loaded and ready.

### 2. Extract signals

Extract three kinds of signals. These are mechanical extractions: pattern match, don't interpret.

**a) Intent signals**: from each lighthouse document's `## User stories` section:

For each "so that" clause, extract the **key noun phrases and verb phrases**: the concrete things the user wants and the actions they enable. Examples:

| "so that" clause                                               | Extracted signals                           |
| -------------------------------------------------------------- | ------------------------------------------- |
| "so that existing callers (CLI, scan, tests) need no changes"  | `CLI`, `scan`, `tests`, `callers unchanged` |
| "so that users can operate the strategy from the command line" | `command line`, `operate strategy`          |
| "so that the engine can iterate day-by-day and bar-by-bar"     | `iterate day-by-day`, `iterate bar-by-bar`  |

Discard connectors ("the", "a", "can", "is"). Keep only the nouns and verbs that would appear in a ticket title or body.

**b) Pattern signals**: from each lighthouse document's `## Invariants` section:

For each invariant that declares pattern alignment (e.g. "new engine types follow the same conventions"), extract:

- The **pattern name**: what existing category this aligns with (e.g. "daily engine")
- The **surface items**: the concrete things that category has (e.g. bat scripts, dashboard cards, CLI entry, config directory)

**c) Dependency signals**: from every ticket body (resolved and open):

Scan each ticket's current in-scope question and outcomes for words that imply a prerequisite action; use its handoff to distinguish unresolved work from rejected or superseded exploration. Key patterns:

| If a ticket body contains…              | It implies a dependency on…                       |
| --------------------------------------- | ------------------------------------------------- |
| `scan`, `parameter scan`, `grid search` | a runnable backtest producing standardised output |
| `generate`, `produce`, `output`, `save` | the thing being generated already exists          |
| `load`, `read`, `fetch`, `query`        | the data source already exists                    |
| `dashboard`, `UI`, `web`                | a running service with an endpoint                |
| `analyse`, `report`, `summarise`        | the raw results already exist                     |

For each implied dependency, extract the dependency name as a signal.

Completion criterion: every lighthouse document processed for intent and pattern signals. Every decision ticket body processed for dependency signals.

### 3. Trace signals across the map

For each extracted signal, search the **current scope of all decision tickets** (resolved and open). A matching in-scope ticket covers the topic; a signal with no match is a **gap**. Rejected branches and superseded text do not provide current promises. A matching unresolved ticket is a handoff location, not proof that its prerequisite has been satisfied.

Exception: if the signal appears only in the same ticket that produced it, it is NOT self-covered; the trace looks for a *different* ticket. A ticket listed in the map’s Out of scope is disposition evidence, not a provider of its original proposed outcome. Ignore its abandoned promises when tracing coverage; an in-scope dependency on them remains a gap unless a confirmed decision removes the requirement or another ticket provides it.

**Peer symmetry trace**: for each pattern signal, collect all surface items from the pattern name (e.g. "daily engine" → bat, dashboard, CLI, config). Then collect all surface items from tickets belonging to the new concept (e.g. decision tickets tagged or titled with the new engine type). Items present in the pattern but absent from the new concept are **peer asymmetry gaps**.

**Layer trace**: for each dependency signal, search for a decision ticket whose body or title describes delivering that dependency. No match → **layer gap**.

**Layer-integrity trace**: for each decision ticket body, check whether its content describes actions belonging to a different layer than the ticket's stated purpose. A scan ticket describing nested loops is an engine-layer action → **layer violation**.

**Conflict trace.** Compare this call's results and evidence with related current Lighthouse conclusions in the same scope. State the concrete old/new contradiction and its actual consumers; association alone is not a dependency. A new fact or proposal is not approval to replace an earlier choice. Keep unresolved contradictions as questions and pause new decisions relying on the disputed premise.

Completion criterion: every signal traced; covered, gaps, violations, and any concrete conflicts identified.

### 4. Report gaps

Present a gap report. Use this exact format:

```
## Trace Report: <ticket title>

### Intent gaps
- **Missing operational surface**: "<signal>" from "<so that clause>" → no ticket covers it
  Peers that have it: <list>
- **Missing dependency**: "<signal>" from "<so that clause>" → no ticket delivers it

### Layer gaps
- **Missing prerequisite**: ticket <name> implies dependency on "<signal>" → no ticket exists for it

### Layer violations
- **Wrong layer**: ticket <name> contains <action>; belongs in <layer>, not <current layer>

### Peer asymmetry
- **Missing from <new concept>**: <surface item>; present in <pattern name> but absent here
```

Group gaps by type. Don't merge. A signal that appears in both Intent and Layer sections stays in both. The user sees every angle. For conflicts, add a **Conflicts** section with the old/new statements, confirmation or evidence sources, scope, affected consumers, and what remains to decide.

Completion criterion: every gap listed under its gap types and every concrete conflict reported with its sources and affected scope.

### 5. Reuse existing tickets

For findings the user confirms need follow-up, prefer an existing unresolved ticket whose decision scope owns the finding. Show the proposed owner and reason in the report. Append established constraints and unanswered questions with their source evidence; preserve the ticket's unresolved status. Related subject matter alone is not ownership. Assigning a finding is a handoff, not a resolution.

For confirmed changes, call Lighthouse to update the original authority, retain the old-to-new reason/source, and reconcile affected ticket questions, references, handoffs, and map gist. The new source ticket links that authority. Only reopen a resolved ticket when it now has an unanswered question; unrelated conclusions stay unchanged. A tentative proposal stays in discussion and leaves current approved text intact. Ask only about undecided consequences, not an already explicit choice.

If an exported spec/contract or active implementation relies on a disputed or changed result, stop the affected handoff and identify what must be reconsidered through the existing approval flow; document edits do not update a running delivery.

Completion criterion: confirmed changes are reconciled; every finding has an owner or remains in the batch, and unresolved conflicts cannot support a new final decision.

### 6. Follow up on the remaining batch

If findings remain without a suitable owner, follow [Gap follow-up](GAP-FOLLOWUP.md) to select and execute their follow-up. If all findings have been assigned or no findings need follow-up, finish without a mode prompt.

Completion criterion: every finding needing follow-up has recorded outcomes or a ticket handoff, including assignments from Step 5. Return these to the caller for its final handoff; a trace neither closes the source ticket nor recursively starts another pause.
