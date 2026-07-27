---
name: backtracer
description: Trace user stories and design patterns from resolved wayfinder tickets back across the map — surfacing missing tickets, layer gaps, and asymmetry before they become bugs. Use after a wayfinder ticket is resolved.
---

A wayfinder map charts decisions one ticket at a time. Each resolved ticket has a design document (in `design/`) and a lighthouse document (in `lighthouse/`). The lighthouse document contains user stories with "so that" clauses and invariants declaring patterns the decision aligns with. Backtracer **traces** these signals across the entire map: every "so that" clause, every pattern statement, every implicit dependency in ticket bodies. Where a signal doesn't land on a corresponding ticket, that's a gap.

Backtracer does not judge whether a gap matters — it traces and reports. The human judges.

## Process

### 1. Load the trace sources

Load the wayfinder map (label `wayfinder:map`). Read the map body, then fetch:

- **Resolved tickets**: all tickets from **Decisions so far**. For each, read its design ticket body and its lighthouse document.
- **Open tickets**: all child issues not in Decisions so far. Read each body.

Lighthouse documents must follow the format defined in **/lighthouse**'s [SKILL.md](../lighthouse/SKILL.md) (the `<lighthouse-template>`). If a lighthouse document doesn't follow this format, still read the design ticket body — body-level trace (Step 2c) runs on every ticket regardless.

Completion criterion: map body + every design ticket body + every lighthouse document loaded and ready.

### 2. Extract signals

Extract three kinds of signals. These are mechanical extractions — pattern match, don't interpret.

**a) Intent signals** — from each lighthouse document's `## 用户故事` section:

For each "so that" clause, extract the **key noun phrases and verb phrases** — the concrete things the user wants and the actions they enable. Examples:

| "so that" clause | Extracted signals |
|---|---|
| "so that existing callers (CLI, scan, tests) need no changes" | `CLI`, `scan`, `tests`, `callers unchanged` |
| "so that users can operate the strategy from the command line" | `command line`, `operate strategy` |
| "so that the engine can iterate day-by-day and bar-by-bar" | `iterate day-by-day`, `iterate bar-by-bar` |

Discard connectors ("the", "a", "can", "is") — keep only the nouns and verbs that would appear in a ticket title or body.

**b) Pattern signals** — from each lighthouse document's `## 不变量` section:

For each invariant that declares pattern alignment (e.g. "new engine types follow the same conventions"), extract:

- The **pattern name** — what existing category this aligns with (e.g. "daily engine")
- The **surface items** — the concrete things that category has (e.g. bat scripts, dashboard cards, CLI entry, config directory)

**c) Dependency signals** — from every ticket body (resolved and open):

Scan each design ticket's body for words that imply a prerequisite action. Key patterns:

| If a ticket body contains… | It implies a dependency on… |
|---|---|
| `scan`, `parameter scan`, `grid search` | a runnable backtest producing standardised output |
| `generate`, `produce`, `output`, `save` | the thing being generated already exists |
| `load`, `read`, `fetch`, `query` | the data source already exists |
| `dashboard`, `UI`, `web` | a running service with an endpoint |
| `analyse`, `report`, `summarise` | the raw results already exist |

For each implied dependency, extract the dependency name as a signal.

Completion criterion: every lighthouse document processed for intent and pattern signals. Every design ticket body processed for dependency signals.

### 3. Trace signals across the map

For each extracted signal, search **all design ticket bodies** (resolved and open). A signal is **covered** if at least one ticket body contains the signal's key terms. A signal with no match is a **gap**.

Exception: if the signal appears only in the same ticket that produced it, it is NOT self-covered — the trace looks for a *different* ticket.

**Peer symmetry trace**: for each pattern signal, collect all surface items from the pattern name (e.g. "daily engine" → bat, dashboard, CLI, config). Then collect all surface items from tickets belonging to the new concept (e.g. design tickets tagged or titled with the new engine type). Items present in the pattern but absent from the new concept are **peer asymmetry gaps**.

**Layer trace**: for each dependency signal, search for a design ticket whose body or title describes delivering that dependency. No match → **layer gap**.

**Layer-integrity trace**: for each design ticket body, check whether its content describes actions belonging to a different layer than the ticket's stated purpose. A scan ticket describing nested loops is an engine-layer action → **layer violation**.

Completion criterion: every signal traced. Three lists built — covered, gaps, violations.

### 4. Report gaps

Present a gap report. Use this exact format:

```
## Trace Report — <ticket title>

### Intent gaps
- **Missing operational surface**: "<signal>" from "<so that clause>" → no ticket covers it
  Peers that have it: <list>
- **Missing dependency**: "<signal>" from "<so that clause>" → no ticket delivers it

### Layer gaps
- **Missing prerequisite**: ticket <name> implies dependency on "<signal>" → no ticket exists for it

### Layer violations
- **Wrong layer**: ticket <name> contains <action> — belongs in <layer>, not <current layer>

### Peer asymmetry
- **Missing from <new concept>**: <surface item> — present in <pattern name> but absent here
```

Group gaps by type. Don't merge — a signal that appears in both Intent and Layer sections stays in both. The user sees every angle.

Completion criterion: every gap listed under exactly one or more of the four gap types above.

### 5. Resolve gaps

For each gap, ask the user: "Create a ticket for this?" The user responds with one of:

- **Yes** → create a child issue of the map, wire its blocking edges
- **No** → record the reason, move on
- **Fog** → add to the map's **Not yet specified** if it's in scope but not yet sharp enough to ticket

After resolving all gaps, update the map: remove any **Not yet specified** entries that the new tickets have made specifiable.

Completion criterion: every gap is in one of three terminal states — ticket created, user declined, or deferred to fog.
