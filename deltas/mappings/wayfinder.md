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

### local-ticket-handoff

Own local recovery and publication boundaries; a ticket keeps its working context while Lighthouse owns approved policy.

```op
anchor: |-
  <oh-my-wayfinder:insert>## Ticket Types
insert: |
  ### Local ticket handoff
  
  On the local Markdown tracker, each decision ticket owns its question, exploration and recovery context. Keep one `## Handoff` before its Question: confirmed-result links, remaining questions and the next ready question, relevant reasons/rejected branches, evidence limits and pending findings. Approved policy belongs in its Lighthouse; other tickets consume that authority when they start or resume.
  
  At a publication boundary for the ticket you are working, consolidate its legacy resume/handoff sections into this current entry; a claim alone leaves the legacy layout in place. Preserve unanswered scope, unique reasons and evidence; retire obsolete resume points and use linked history for prior full text. A gap added to another ticket preserves its existing recovery context.
  
  ### Publication
  
  During ordinary grilling, keep new confirmations and approved revisions in the current conversation. Persistent documents may lag until the user requests pause, saved progress or a switch, or the whole ticket is ready for completion or confirmed disposition. Claim/status operations remain immediate; publication waits for that boundary. At that boundary, publish the accumulated confirmed changes through Lighthouse, update the working ticket's Handoff and compact evidence once, reconcile the map's gist/links, then trace the published changes. Each policy has one Lighthouse authority; revise its original topic rather than copying it into consumer tickets. Other sessions see the last publication, so publish before handing them work that requires a new choice.
  
  Complete publication when confirmed choices and revisions are recoverable at their authorities, candidates remain unanswered, and the working ticket's recovery point and map navigation agree with them.
  
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
  0. **Load the tracker conventions.** Read `docs/agents/issue-tracker.md` for storage and fields; use the [decision lifecycle](#decision-tickets) and [local handoff](#local-ticket-handoff) for this map. Consult the [local tracker template](../setup-matt-pocock-skills/issue-tracker-local.md) only for a conflicting storage convention; preserve project-specific fields and paths.

```

### user-named-question

Default frontier selection stays unchanged; a user may name an input-ready question inside a still-blocked ticket.

```op
anchor: |-
  2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
find: use it
content: check its claim and the specific question's inputs. On the local Markdown tracker you may discuss a ready part while preserving its other blockers; this does not unblock the whole ticket. Respect another session's claim
```

### processing-type-read

Read the recorded processing type before working. This starts Step 3; the following context, frontier and brief ops append at the same upstream resolution anchor in document order, before `recorded-type-work` replaces it.

```op
anchor: |-
  <oh-my-wayfinder:insert>3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
insert: |-
  3. **Read the processing type:** the local ticket’s `Type:` field, or its `wayfinder:<type>` label on a remote tracker (see [Ticket Types](#ticket-types)).
```

### grilling-context-reuse

Load the current recovery entry and question-relevant authorities for starting or resuming grilling. Append after `processing-type-read` at the unchanged upstream resolution anchor; keep frontier recomputation and the displayed brief in their own ops.

```op
anchor: |-
  <oh-my-wayfinder:insert>3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
insert: |-
   Before starting or resuming grilling, read the ticket's fields, Question and current Handoff, then the Lighthouse topics needed by that question and its prerequisites, including published parts of unfinished tickets. Use the map index and dependency links to select those authorities. Reuse available context without rereading it; follow history/evidence links only for a concrete ambiguity or changed premise. For a legacy ticket, locate its latest applicable recovery point and read from it; leave its layout unchanged until that ticket's next publication boundary.
```

### grilling-frontier-refresh

Recompute the saved frontier against intervening results and route missing cross-ticket choices through Pause. Append after `grilling-context-reuse` at the same upstream resolution anchor, before the opening brief.

```op
anchor: |-
  <oh-my-wayfinder:insert>3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
insert: |-
   Compare the saved stopping point with intervening results and recompute this ticket’s frontier. If the missing choice belongs to another ticket, identify that prerequisite and offer the Pause detour rather than deciding its scope under this claim. A design input need not be implemented, but one available input does not settle every prerequisite.
```

### grilling-opening-brief

Display only a one-sentence decision goal using the project glossary, then enter grilling. Append after `grilling-frontier-refresh` at the unchanged upstream resolution anchor; the leading paragraph break and trailing newline preserve the existing Step 3 layout.

```op
anchor: |-
  <oh-my-wayfinder:insert>3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
insert: |
  
  
     Read the relevant project `GLOSSARY.md` if available (follow `GLOSSARY-MAP.md` when present). Using its canonical terms, give only a one-sentence brief on what this ticket needs to decide and what that answer enables toward the Destination, followed immediately by the first grilling round. Other ticket types skip the brief.
```

### recorded-type-work

Work using the recorded processing type. Adjust the step number after `processing-type-read` adds Step 3; preserve upstream Zoom and skill selection. The preceding insertions must run before this op replaces their shared upstream anchor.

```op
anchor: |-
  3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the type.
find: |-
  3. Resolve it as the type its `wayfinder:<type>` label names (see [Ticket Types](#ticket-types)). Read the label, not just the body: the body never states the
content: |-
  4. Work using its recorded
```

### grilling-pause-trigger

Route user pause, save-progress and switch requests through Pause, preserving their authorization boundary. Insert before upstream Zoom, independently of the processing-type replacement; `grilling-pause` owns the pause procedure.

```op
anchor: |-
  <oh-my-wayfinder:insert> **Zoom as needed**:
insert: |-
   Keep ordinary grilling rounds in this interview step, using the current conversation until a [publication boundary](#publication). A confirmed answer or approved revision alone stays in the interview; enter Step 5 when the whole ticket is ready for completion or confirmed disposition. A user request to pause, save progress or switch goes through [Pause](#pause). It authorizes publication, not execution of the Destination or approval of unanswered branches. Keep a disputed premise as a question until the user settles it.
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
     - **Ordinary answer:** call the Skill tool with "lighthouse" to publish the accumulated confirmed changes under [Publication](#publication), then save this ticket's [Handoff](#local-ticket-handoff) and compact evidence and reconcile the map gist/link. Set `Status: resolved` only when the ticket’s whole scope is decided or has confirmed dispositions, with no disputed prerequisite; otherwise use [Pause](#pause). If lighthouse is unavailable, stop before changing status.
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

Reuse Backtracer's gap-question assignments when adding newly surfaced tickets and returning from scope dispositions. Preserve upstream’s fog graduation. This becomes step 7 after the processing-type read and shared tracing insertions.

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

### map-invalidation-boundary

Backtracer owns gap/conflict diagnosis and authorized gap-question assignments; an upstream result does not authorize bulk consumer mutation. Scope changes use the explicit disposition procedure.

```op
anchor: |-
  If the decision invalidates other parts of the map, update or delete those tickets.
find: |-
  If the decision invalidates other parts of the map, update or delete those tickets.
content: |-
  When the user confirms another ticket's question is invalidated, record that specific disposition in the affected ticket and reconcile only that question, its recovery entry and the map navigation; preserve unrelated context and claims.
```

### grilling-pause

Own the pause sequence once, after the work loop; completion and a user-named detour reuse its existing publication and tracing skills.

```op
anchor: |
  <oh-my-wayfinder:insert>The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.
insert: |
  ### Pause

  On the local Markdown tracker, when the user pauses, requests saved progress or switches, publish through [Publication](#publication) in this order before another grilling round or ticket. Other tracker setups do not provide this extended pause/publication loop:

  1. Call "lighthouse" to publish the conversation's accumulated confirmed choices and approved revisions at their authorities; reconcile the map gist/links with their partial scope. With no confirmed change, retain those documents.
  2. Execute only Step 6 of [Work through the map](#work-through-the-map), passing the published changes, evidence and unresolved conflicts to Backtracer. A pause hands off its confirmed gap questions rather than requiring another interview.
  3. Save the working ticket's [Handoff](#local-ticket-handoff) and compact evidence with the pause reason, result links, exact unanswered resume question and trace findings or pending work. Retire obsolete resume points while preserving candidates and unanswered scope. With no findings, retain the existing trace record instead of adding another empty report.
  4. Finish publication before setting your unfinished ticket `open` and clearing your claim; use sequential edits or one combined write. For saved progress without a pause or switch, keep the claim. Verify the saved recovery point and actual status/assignee fields, preserving other sessions' claims; then stop or return to Step 2 for the requested switch.
  
  Complete when [Publication](#publication) is complete, trace findings are recorded or handed off, and your claim is released for pause/switch or retained for saved progress. If saving/tracing cannot finish, retain the remaining work in Handoff and release your claim on a normal stop without declaring the pause complete. A pause leaves the unfinished ticket open; resuming or saving progress alone keeps its claim.

```

### prototype-worktree-asset

The Prototype ticket type links a worktree asset and writes no spec.

```op
anchor: |
  - **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
find: Links the prototype as an
content: It hands back a `prototype/<name>` worktree holding the chosen result and a `VERDICT.md`; link that worktree path as the
```
