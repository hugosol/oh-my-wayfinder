# wayfinder

## wayfinder/SKILL.md

### answer-recording

The resolution is recorded in the lighthouse document, not as a tracker comment.

```diff
-The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
+The answer isn't part of the body; it's recorded in the lighthouse document (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
```

### blocking-evidence

Use recorded outcomes, not closure alone, to satisfy prerequisites.

```diff
-Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.
+Use the tracker’s native dependency relationship where available, otherwise its body convention. A ticket is **unblocked** only when every blocker is resolved and its recorded outcome satisfies the prerequisite. A confirmed decision may remove an unnecessary dependency with its reason recorded. Apply the Out of scope dependency review before treating any disposed blocker as cleared. The **frontier** is the open, unblocked, unclaimed children.
```

### decision-tickets-section

Distinguish completed planning decisions from delivered production implementation.

```diff
+## Decision tickets vs implementation tickets
+
+This map produces **decision tickets**: planning artifacts that capture decisions. Each asks "what should we decide?" Decision tickets live in `.scratch/<feature>/decision/` and use the Decision ticket status vocabulary (`open` → `claimed` → `resolved`).
+
+A `resolved` decision ticket records a completed decision or confirmed out-of-scope disposition. It makes no claim about production delivery; research or prototype code may be evidence. Later implementation does not change this status.
+
+**Implementation tickets** are a different artifact, produced later by `/to-tickets` from the to-spec document. They live in `.scratch/<feature>/implementation/` and use the Implementation ticket status vocabulary (`ready-for-agent` → `in-progress` → `closed`). Implementation tickets are consumed by `/implement`.
+
+| | Decision ticket | Implementation ticket |
+|---|---|---|
+| Produced by | `/wayfinder` | `/to-tickets` |
+| Directory | `decision/` | `implementation/` |
+| Question | What should we decide? | What should we build? |
+| Statuses | `open` → `claimed` → `resolved` | `ready-for-agent` → `in-progress` → `closed` |
+| `resolved` means | Decision or disposition recorded; delivery tracked separately | N/A; use `closed` |
+| `closed` means | N/A; use `resolved` | Code implemented, tested, merged |
+
+Decision tickets use only `open`, `claimed`, and `resolved`. Triage labels belong to implementation tickets, not decision tickets or the map.
+
 ## Fog of war
```

### out-of-scope-lighthouse-decision

The trigger for ruling a ticket out of scope is a lighthouse decision.

```diff
-Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
+When the user confirms an existing ticket is outside the destination or no longer needed, record that disposition and its reason in the ticket body. Run lighthouse to record the confirmed disposition, set `Status: resolved`, and link the ticket with its reason from the map’s **Out of scope**, not **Decisions so far**. Then run the mandatory backtracer step against that updated map. This resolves the disposition, not the original question.
+
+Before selecting the next frontier ticket, review every dependent: keep an unsatisfied prerequisite blocked, wire a replacement provider when available, or remove the dependency only when a confirmed decision makes it unnecessary. Record the reason on the dependent. If the dependent is itself no longer needed, obtain confirmation and apply this same disposition procedure. A resolved out-of-scope ticket never satisfies a prerequisite merely by its status.
```

### work-through-step-0

Load the tracker vocabulary before choosing a ticket so decision and implementation statuses stay separate.

```diff
+0. **Load the tracker conventions.** Read `docs/agents/issue-tracker.md`. Use the decision-ticket lifecycle above, independently of whether implementation triage is installed.
+
 1. Load the **map**: the low-res view, not every ticket body.
```

### grilling-opening-brief

Orient the human to the ticket and its settled constraints after claiming it, before the first grilling question. Shift resolution to step 4; the following mapping continues at step 5.

```diff
-3. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".
+3. **Opening brief — grilling tickets only.** Before the first grilling question, read the ticket's Question and scan the map's Decisions-so-far for relevant decisions. Follow relevant links to the source tickets and lighthouse documents.
+
+   Present a short brief to the user:
+   - **Topic:** What this ticket must decide and how it serves the Destination.
+   - **Settled decisions:** Only confirmed decisions that constrain or inform this ticket, each with its source link and implication for this discussion. If none are relevant, say so.
+
+   Then ask the first grilling question.
+4. Resolve it. **Zoom as needed**: fetch the full body of any related or closed ticket on demand; call the Skill tool for whichever skills the `## Notes` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".
```

### work-through-steps-5-to-7

Steps 5-7 make lighthouse and backtracer mandatory, replacing upstream's comment-and-close step after the opening brief and resolution.

```diff
-4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
-5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
+5. Write the discussion results to the decision ticket body. Then call the Skill tool with "lighthouse". This is MANDATORY and NON-BYPASSABLE. Set the local decision ticket’s `Status: resolved`, and append a context pointer to the map’s Decisions-so-far. For a confirmed out-of-scope disposition, use the Out of scope procedure instead of recording an ordinary answer.
+   - The `lighthouse` skill reads the decision ticket body and the conversation context; confirm the draft with the user, then write it to `lighthouse/<NN>-<slug>.md`.
+   - If `lighthouse` is unavailable, STOP. Do not proceed.
+   - The one-line gist for the map's Decisions-so-far comes from the `## Decision` field.
+6. **Call the Skill tool with "backtracer".** This is MANDATORY and NON-BYPASSABLE.
+   - Backtracer reads the map, decision tickets, and lighthouse documents, checks coverage and symmetry, and reports gaps.
+   - Let backtracer own gap follow-up. Honor its recorded outcomes and ticket handoffs in Step 7 rather than creating duplicate tickets.
+   - If `backtracer` is unavailable, STOP. Do not proceed.
+7. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. This includes any tickets backtracer surfaced and the user confirmed. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
```

### prototype-worktree-asset

The Prototype ticket type links a worktree asset and writes no spec.

```diff
-- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
+- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". It hands back a `prototype/<name>` worktree holding the chosen result and a `VERDICT.md`; link that worktree path as the asset. Use when "how should it look" or "how should it behave" is the key question.
```
