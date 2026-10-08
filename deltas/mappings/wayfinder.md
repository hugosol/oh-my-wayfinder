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
+Use the tracker’s native dependency relationship where available, otherwise its body convention. A ticket is **unblocked** when every blocker is resolved and its recorded outcome satisfies the prerequisite. For an out-of-scope blocker, complete the dependency review in [Out of scope](#out-of-scope) before advancing. The **frontier** is the open, unblocked, unclaimed children.
```

### decision-tickets-section

Keep the decision lifecycle here; leave storage and implementation vocabulary to the tracker.

```diff
-## Fog of war
+## Decision tickets
+
+Wayfinder tickets resolve planning questions; implementation tickets deliver production behavior. Follow the configured tracker for storage. Decision tickets use only these states:
+
+| Status | Meaning |
+|--------|---------|
+| open | Unclaimed |
+| claimed | Being worked |
+| resolved | Decision or confirmed out-of-scope disposition recorded |
+
+Research and prototype code may support a decision. Production delivery is tracked by implementation tickets; it does not change this status. Triage applies only to implementation tickets.
+
+## Fog of war
```

### out-of-scope-lighthouse-decision

Record confirmed dispositions separately from answers, with a complete dependency review before advancing.

```diff
-Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
+When the user confirms an existing ticket is outside the destination or no longer needed:
+
+1. Record the disposition and reason in the ticket; call the Skill tool with "lighthouse". Confirm its draft with the user and write the lighthouse document before continuing. If the skill is unavailable, stop.
+2. Set `Status: resolved` and link the ticket with its reason under the map's **Out of scope**, not **Decisions so far**. This records the disposition, not an answer to the original question.
+3. Execute only Step 6 of [Work through the map](#work-through-the-map) against the updated map, including backtracer's gap follow-up. Return here for the dependency review below before continuing the main flow.
+4. Review every dependent. Record a replacement provider, a user-confirmed removal of the prerequisite, or the remaining blocker. Obtain confirmation before applying this disposition procedure to a dependent too.
+
+Complete when every affected dependent has a recorded dependency outcome. Unmet prerequisites remain blocked. Return to the calling step; when called from Step 5, continue at Step 7.
```

### work-through-step-0

Load the tracker vocabulary before choosing a ticket so decision and implementation statuses stay separate.

```diff
+0. **Load the tracker conventions.** Read `docs/agents/issue-tracker.md` for storage and field conventions; use the [decision lifecycle](#decision-tickets) for this map.
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

Branch before recording outcomes; both paths complete lighthouse and share one backtracer step.

```diff
-4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
-5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
+5. **Record the outcome.** Branch before updating the ticket or map:
+   - **Confirmed out-of-scope disposition:** complete [Out of scope](#out-of-scope), then continue at Step 7; it includes Step 6.
+   - **Ordinary answer:** write the discussion results to the ticket body, then call the Skill tool with "lighthouse". Confirm its draft with the user and write it to `lighthouse/<NN>-<slug>.md` before setting `Status: resolved`. Append the lighthouse's `## Decision` gist and link to the map's Decisions-so-far. If lighthouse is unavailable, stop before changing status.
+6. **Trace the updated map.** Call the Skill tool with "backtracer"; if unavailable, stop. Complete its gap follow-up before proceeding. Carry its recorded outcomes and ticket handoffs into Step 7 rather than creating duplicate tickets.
+7. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. This includes any tickets backtracer surfaced and the user confirmed. If this reveals another out-of-scope ticket, obtain the user's confirmation, complete [Out of scope](#out-of-scope) for that ticket, and resume this step. If the decision invalidates other parts of the map, update or delete those tickets.
```

### prototype-worktree-asset

The Prototype ticket type links a worktree asset and writes no spec.

```diff
-- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
+- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". It hands back a `prototype/<name>` worktree holding the chosen result and a `VERDICT.md`; link that worktree path as the asset. Use when "how should it look" or "how should it behave" is the key question.
```
