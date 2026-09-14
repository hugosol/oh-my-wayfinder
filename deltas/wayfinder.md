# wayfinder

## wayfinder/SKILL.md

### answer-recording

The resolution is recorded in the lighthouse document, not as a tracker comment.

```diff
-The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
+The answer isn't part of the body; it's recorded in the lighthouse document (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
```

### decision-tickets-section

Distinguish planning decisions from implementation tasks so a resolved decision never implies code exists.

```diff
+## Decision tickets vs implementation tickets
+
+This map produces **decision tickets**: planning artifacts that capture decisions. Each asks "what should we decide?" Decision tickets live in `.scratch/<feature>/decision/` and use the Decision ticket status vocabulary (`open` → `claimed` → `resolved`).
+
+A `resolved` decision ticket means the decision is locked. **NO code has been written.** Implementation is a separate phase.
+
+**Implementation tickets** are a different artifact, produced later by `/to-tickets` from the to-spec document. They live in `.scratch/<feature>/implementation/` and use the Implementation ticket status vocabulary (`ready-for-agent` → `in-progress` → `closed`). Implementation tickets are consumed by `/implement`.
+
+| | Decision ticket | Implementation ticket |
+|---|---|---|
+| Produced by | `/wayfinder` | `/to-tickets` |
+| Directory | `decision/` | `implementation/` |
+| Question | What should we decide? | What should we build? |
+| Statuses | `open` → `claimed` → `resolved` | `ready-for-agent` → `in-progress` → `closed` |
+| `resolved` means | Decision locked, no code | N/A; use `closed` |
+| `closed` means | N/A; use `resolved` | Code implemented, tested, merged |
+
+NEVER mark a decision ticket with an implementation ticket status, or vice versa. NEVER assume a resolved decision ticket means code exists.
+
 ## Fog of war
```

### out-of-scope-lighthouse-decision

The trigger for ruling a ticket out of scope is a lighthouse decision.

```diff
-Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
+Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a lighthouse decision), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
```

### work-through-step-0

Load the tracker vocabulary before choosing a ticket so decision and implementation statuses stay separate.

```diff
+0. **Load the tracker vocabulary.** Read `docs/agents/triage-labels.md` and `docs/agents/issue-tracker.md`.
+   - This map produces **decision tickets**: use the Decision ticket status vocabulary.
+   - Key: `resolved` means "Decision made, implementation pending"; NOT "code implemented".
+   - Decision tickets (in `decision/`) and implementation tickets (in `implementation/`) are different systems with **non-overlapping status vocabularies**.
+
 1. Load the **map**: the low-res view, not every ticket body.
```

### work-through-steps-4-to-6

Steps 4-6 make lighthouse and backtracer mandatory, replacing upstream's comment-and-close step.

```diff
-4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
-5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
+4. Write the discussion results to the decision ticket body. Then call the Skill tool with "lighthouse". This is MANDATORY and NON-BYPASSABLE. Close the decision ticket, and append a context pointer to the map's Decisions-so-far.
+   - The `lighthouse` skill reads the decision ticket body and the conversation context; confirm the draft with the user, then write it to `lighthouse/<NN>-<slug>.md`.
+   - If `lighthouse` is unavailable, STOP. Do not proceed.
+   - The one-line gist for the map's Decisions-so-far comes from the `## Decision` field.
+5. **Call the Skill tool with "backtracer".** This is MANDATORY and NON-BYPASSABLE.
+   - Backtracer reads the map, decision tickets, and lighthouse documents, checks coverage and symmetry, and reports gaps.
+   - The user confirms which gaps become new tickets.
+   - If `backtracer` is unavailable, STOP. Do not proceed.
+6. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. This includes any tickets backtracer surfaced and the user confirmed. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
```
