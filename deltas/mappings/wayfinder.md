# wayfinder

## wayfinder/SKILL.md

### answer-recording

Confirmed answers live in Lighthouse; the ticket retains compressed discussion and a resume point.

```op
anchor: |
  The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.
find: on resolution
content: in the lighthouse document
find: Assets created while resolving a ticket are linked from the issue
content: The ticket retains compact discussion and a handoff; evidence assets are linked
```

### confirmed-result-index

Index confirmed outcomes, including partial results, without turning the map into an open-ticket work list.

```op
anchor: |-
  The whole map at low resolution, loaded once per session. Open tickets are **not** listed: they are open child issues, found by query.
find: tickets are **not** listed: they are open child issues, found by query
content: work is found by tracker query; confirmed results may be indexed even while their source tickets remain unfinished
```

### partial-result-links

Keep the existing index shape, changing the meaning from closed tickets to confirmed results.

```op
anchor: |-
  <!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

  - [<closed ticket title>](link): <one-line gist of the answer>
find: one line per closed ticket
content: confirmed results, with their confirmed scope and Lighthouse link; source tickets may remain unfinished
find: <closed ticket title>
content: <confirmed result or topic>
```

### processing-type-storage

Retain upstream’s type-only classification while using the local tracker’s Type field.

```op
anchor: |
  Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)). `wayfinder:` labels are the only labels a map and its tickets carry, never a triage label like `ready-for-agent`: they are decisions, not implementation work.
find: carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)). `wayfinder:` labels are the only labels a map and its tickets carry, never a triage label like `ready-for-agent`: they are decisions, not
content: records its processing type (`research`, `prototype`, `grilling`, or `task`; see [Ticket Types](#ticket-types)): a `Type:` field locally, a `wayfinder:<type>` label on remote trackers. A remote map and its tickets carry only `wayfinder:` labels; triage belongs to
```

### blocking-evidence

Use recorded outcomes, not closure alone, to satisfy prerequisites.

```op
anchor: |
  Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.
find: Blocking uses the tracker's **native** dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children, the edge of the known.
content: Use the tracker’s native dependency relationship where available, otherwise its body convention. A ticket is **unblocked** when every blocker is resolved and its recorded outcome satisfies the prerequisite. For an out-of-scope blocker, complete the dependency review in [Out of scope](#out-of-scope) before advancing. The **frontier** is the open, unblocked, unclaimed children.
```

### decision-ticket-lifecycle

Keep the decision lifecycle here; leave storage and implementation vocabulary to the tracker.

```op
anchor: |
  <oh-my-wayfinder:insert>## Fog of war
insert: |
  ## Decision tickets

  Wayfinder tickets resolve planning questions; implementation tickets deliver production behavior. Follow the configured tracker for storage. Decision tickets use only these states:

  | Status   | Meaning                                                 |
  | -------- | ------------------------------------------------------- |
  | open     | Unclaimed                                               |
  | claimed  | Being worked                                            |
  | resolved | Decision or confirmed out-of-scope disposition recorded |

  Research and prototype code may support a decision. Production delivery is tracked by implementation tickets; it does not change this status. Triage applies only to implementation tickets.

```

### out-of-scope-disposition

Owns the confirmed scope-disposition procedure and its dependent review. Lighthouse is called here for the disposition; the procedure enters the shared tracing step supplied by `backtracer-on-resolution`, then returns to its caller. Record the disposition under Out of scope, not Decisions-so-far.

```op
anchor: |
  Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
find: Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked; a scope boundary isn't a step on it.
content: |-
  When the user confirms an existing ticket is outside the destination or no longer needed:

  1. Record the disposition and reason in the ticket; call the Skill tool with "lighthouse". Clarify ambiguous summaries only and write the confirmed lighthouse before continuing. If the skill is unavailable, stop.
  2. Set `Status: resolved` and link the ticket with its reason under the map's **Out of scope**, not **Decisions so far**. This records the disposition, not an answer to the original question.
  3. Execute only Step 6 of [Work through the map](#work-through-the-map) against the updated map, including backtracer's gap follow-up. Return here for the dependency review below before continuing the main flow.
  4. Review every dependent. Record a replacement provider, a user-confirmed removal of the prerequisite, or the remaining blocker. Obtain confirmation before applying this disposition procedure to a dependent too.

  Complete when every affected dependent has a recorded dependency outcome. Unmet prerequisites remain blocked. Return to the calling step; when called from Step 5, continue at Step 7.
```

### tracker-conventions

Load the tracker vocabulary before choosing a ticket so decision and implementation statuses stay separate.

```op
anchor: |
  <oh-my-wayfinder:insert>1. Load the **map**: the low-res view, not every ticket body.
insert: |
  0. **Load the tracker conventions.** Read `docs/agents/issue-tracker.md` for storage and field conventions; use the [decision lifecycle](#decision-tickets) for this map.

```

### user-named-question

Default frontier selection stays unchanged; a user may name an input-ready question inside a still-blocked ticket.

```op
anchor: |-
  2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
find: use it
content: check its claim and the specific question's inputs. On the local Markdown tracker you may discuss a ready part while preserving its other blockers; this does not unblock the whole ticket. Respect another session's claim
```

### grilling-opening-brief

Owns the grilling-only opening brief after claiming the ticket and before resolution. Read the recorded type to determine whether this brief is required; show the ticket question and settled constraints. Anchor on the claim, independently of the following `recorded-type-work` edit.

```op
anchor: |-
  **Claim it**: assign it to yourself before any work.
  <oh-my-wayfinder:insert>
insert: |
  3. **Read the processing type:** the local ticket’s `Type:` field, or its `wayfinder:<type>` label on a remote tracker (see [Ticket Types](#ticket-types)). Before starting or resuming grilling, read the ticket’s latest handoff/discussion and relevant current Lighthouse conclusions, including confirmed parts of unfinished tickets. Reuse applicable decisions, rejected branches and their reasons, investigation findings and limits, and the user’s decision-relevant background. Follow evidence links for concrete ambiguities or changes, not to repeat settled exploration. Compare the saved stopping point with intervening results and recompute this ticket’s frontier. If the missing choice belongs to another ticket, identify that prerequisite and offer the Pause detour rather than deciding its scope under this claim. A design input need not be implemented, but one available input does not settle every prerequisite.

     For that brief, show:
     - **Topic:** The stopping point, what has changed, and what is ready to decide next toward the Destination.
     - **Settled decisions:** Only confirmed decisions that constrain or inform this ticket, each with its source link and implication for this discussion. If none are relevant, say so.

     Then ask the first grilling question. Other ticket types skip the brief.
```

### recorded-type-work

Work with the recorded processing type; a user pause returns to the caller before the tree is complete. Keep upstream Zoom and skill selection outside this edit.

```op
anchor: |-
  3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
find: |-
  3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
content: |-
  4. Work using its recorded type. When the user requests a pause, saved progress, or a switch, return through [Pause](#pause) instead of finishing the whole grilling tree. That request authorizes recording confirmed results and progress, not executing the Destination or approving unanswered branches.
```

### lighthouse-on-resolution

Owns the ordinary-resolution lighthouse gate: record the discussion, confirm and write the lighthouse before setting resolved, then update Decisions-so-far. Confirmed scope dispositions dispatch to `out-of-scope-disposition`. Shared tracing is owned by `backtracer-on-resolution`, not this op.

```op
anchor: |-
  4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
find: |-
  4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
content: |-
  5. **Record the outcome.** Before updating the ticket or map, choose the matching procedure:
     - **Confirmed out-of-scope disposition:** complete [Out of scope](#out-of-scope), then continue at Step 7; it includes Step 6.
     - **Ordinary answer:** save compact discussion and sources in the ticket, then call the Skill tool with "lighthouse" and write its confirmed update to the existing `lighthouse/<NN>-<slug>.md`. Reconcile the gist and link in Decisions-so-far. Set `Status: resolved` only when the ticket’s whole scope is decided or has confirmed dispositions, with no disputed prerequisite; otherwise use [Pause](#pause). If lighthouse is unavailable, stop before changing status.
```

### backtracer-on-resolution

Owns the mandatory backtracer call after the outcome is recorded on the map, including unavailable-skill stopping and completed gap follow-up. Both ordinary resolutions and `out-of-scope-disposition` reach this shared step. Insert before the upstream follow-up step is edited by `follow-up-ticket-handoffs`, which consumes the trace outcomes without retracing.

```op
anchor: |-
  <oh-my-wayfinder:insert>5. Add newly-surfaced tickets (create-then-wire);
insert: |
  6. **Trace the updated map.** Call the Skill tool with "backtracer"; if unavailable, stop. Complete its gap follow-up before proceeding. Carry its recorded outcomes and ticket handoffs into Step 7 rather than creating duplicate tickets.
```

### follow-up-ticket-handoffs

Owns reconciliation of backtracer handoffs with newly surfaced tickets and the return from further scope dispositions. Preserve upstream’s fog graduation and invalidation guidance. This becomes step 7 after the opening brief and shared tracing insertions.

```op
anchor: |-
  5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route.
find: |-
  5.
content: |-
  7.
find: |-
  If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route.
content: |-
  This includes any tickets backtracer surfaced and the user confirmed. If this reveals another out-of-scope ticket, obtain the user's confirmation, complete [Out of scope](#out-of-scope) for that ticket, and resume this step.
```

### grilling-pause

Own the pause sequence once, after the work loop; completion and a user-named detour reuse its existing publication and tracing skills.

```op
anchor: |
  <oh-my-wayfinder:insert>The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.
insert: |
  ### Pause

  On the local Markdown tracker, when the user pauses or switches, perform these steps in order before asking another grilling round or starting another ticket. Other tracker setups do not provide this extended pause/publication loop:

  1. Save a compact handoff in the decision ticket's existing discussion/Comments: confirmed-result links; rejected branches, reasons and reconsideration conditions; relevant investigation conclusions, sources and limits; the user's decision-relevant reasons/background; and unanswered questions, answer scope, pause reason and resume point. Preserve question meaning, not just a round number. Tentative preferences stay tentative; complete chat replay is unnecessary.
  2. Call "lighthouse" and write confirmed updates, reconciling map gist/links with their partial scope. With no new confirmed choice, keep the existing Lighthouse unchanged; proposals and conflicting evidence remain available in the ticket for tracing.
  3. Execute only Step 6 of [Work through the map](#work-through-the-map), passing this pause's results, evidence and unresolved conflicts to Backtracer. Follow-up may hand findings to appropriate tickets; the pause does not require another interview to settle them all.
  4. Refresh and save the final handoff with trace outcomes or pending work. Await those writes before setting your own unfinished ticket `open` and clearing your claim; use sequential edits or one combined write, not concurrent edits to the same ticket. Reread its saved handoff, status and assignee to confirm the pause is durable. Only then stop, or return to Step 2 to claim the user’s next ticket and discuss its ready question. Do not alter another session’s claim.

  Complete when the results and final resume point are saved, Backtracer has run with findings resolved or handed off, and your unfinished-ticket claim is released. If saving/tracing cannot finish, record the remaining steps and release your claim on a normal stop without declaring the pause complete. Resuming alone keeps the claim: release it only on a later pause or completion. A pause never supplies unanswered choices or counts as a resolution.

```

### prototype-worktree-asset

The Prototype ticket type links a worktree asset and writes no spec.

```op
anchor: |
  - **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
find: Links the prototype as an
content: It hands back a `prototype/<name>` worktree holding the chosen result and a `VERDICT.md`; link that worktree path as the
```
