# Upstream comparison blueprint

[中文文档](./upstream-differences.cn.md) · [Back to README](../README.md)

This blueprint answers two questions: **What does this fork change? How do changes spread across skills and mapping operations form one coherent design?**

It is not a calling tutorial or a second definition of execution rules. Use [Ask Matt](../skills/ask-matt/SKILL.md) to choose the next skill; use the owning skill and its linked protocols to execute a mechanism. Here, “upstream” means the snapshot stored in this repository, not the moving upstream HEAD. See the [maintenance guide](./maintenance.md) for provenance and updates.

## 1. Artifact semantics and responsibility boundaries

### What belongs in each artifact?

| Artifact | Question it answers | Boundary and authoritative entry |
|---|---|---|
| Map | Where are we going, where are confirmed results, and what remains unspecified or out of scope? | Low-resolution navigation, not a policy copy. [Wayfinder](../skills/wayfinder/SKILL.md#the-map) owns the map and its index structure. |
| Decision ticket | What must this ticket decide, how far has exploration gone, and how do we continue? | Owns the question, compact discussion, candidates/rejections, evidence limits, and recovery point—not cross-ticket policy authority. See [Local ticket handoff](../skills/wayfinder/SKILL.md#local-ticket-handoff). |
| Lighthouse | What is currently decided, why, under which conditions, and what does it constrain? | Single authority for approved policy; its source ticket may remain unfinished. Preferences explain rationale but do not automatically become guarantees. See [Lighthouse](../skills/lighthouse/SKILL.md). |
| Spec | Why does the work exist, what problem does it solve, and what is the proposed solution? | Holds requirements and settled implementation decisions; new seam approval moves to the contract. See [To-spec](../skills/to-spec/SKILL.md). |
| Contract | What is promised, at which seam is it observed, and how is it accepted? | Approved decision artifact, not a delivery-status ledger. Approved design is not delivered capability. See [To-contract](../skills/to-contract/SKILL.md). |
| Implementation ticket | Which promises does this work deliver, and which checks does it own? | Allocates contract work and acceptance requirements for execution; decision tickets are not production-delivery tickets. See [To-tickets](../skills/to-tickets/SKILL.md). |
| Retro records | What did this execution reveal about the environment or working practices? | OMP saves independent retrospective and execution outcomes. Suggestions are not applied automatically and are not acceptance evidence. Locations and limits are in the [extension guide](./spec-to-code.md). |

A decision ticket may reference another ticket's Lighthouse and receive a confirmed gap question it owns. What it does not carry is **copied cross-ticket policy as a second authority**; cross-ticket contact itself is not prohibited.

### Responsibilities of the new skills

- **Lighthouse** publishes confirmed choices and approved revisions as authoritative decision documents.
- **Backtracer** starts from published changes or a concrete conflict, traces relevant prerequisites, reports gaps/contradictions, and hands off confirmed gap questions.
- **Traverse** collects the entire map, tickets, and Lighthouse documents to audit the complete design tree, not just this change.
- **To-contract** turns a specification into approved promises, test seams, and acceptance arrangements.

These skills are handwritten sources with no mapping operations of their own. The flows below explain them together with the modified upstream skills.

## 2. Flow change: specification → contract → tickets → verification

**Upstream baseline:** To-spec chooses and confirms test seams before handing the specification to To-tickets; TDD implements test-first.

**Fork change:** seam approval moves from To-spec to the new To-contract skill. Ticket creation requires an approved contract, and execution receives explicit delivery and coverage responsibilities.

```text
Spec: requirements and solution
  → Contract: promises, observation seams, and acceptance arrangements
  → Implementation tickets: delivery allocation and test ownership
  → TDD: tests that detect violations, and verification evidence
```

This is one responsibility chain, not four unrelated skill changes:

- To-spec no longer makes new seam decisions; a seam already settled in conversation can be recorded as a fact.
- To-contract defines promises and their observations rather than restating the spec in another format.
- To-tickets assigns `Delivers`/enabling work and test ownership for split promises, reducing omissions and duplicate coverage.
- TDD uses the assigned ticket's acceptance criteria, coverage ownership, and approved seams. It follows upstream references for missing necessary details, not to routinely reconstruct the entire contract.
- Tests are designed around independent expectations and concrete plausible violations. Names and coverage IDs provide traceability, not proof. Completion distinguishes supporting evidence from unverified work.

### Implementation trace

| Ownership | Principal operations or source |
|---|---|
| Seam responsibility transfer | [To-spec mapping](../deltas/mappings/to-spec.md): [seam-handoff](../deltas/mappings/to-spec.md#seam-handoff), [testing-decisions](../deltas/mappings/to-spec.md#testing-decisions) |
| Contract and approval | New [To-contract](../skills/to-contract/SKILL.md) |
| Contract input and ticket responsibility | [To-tickets mapping](../deltas/mappings/to-tickets.md): [contract-input](../deltas/mappings/to-tickets.md#contract-input), [contract-gate](../deltas/mappings/to-tickets.md#contract-gate), [delivers](../deltas/mappings/to-tickets.md#delivers), [coverage-quiz](../deltas/mappings/to-tickets.md#coverage-quiz), [template-delivers-local](../deltas/mappings/to-tickets.md#template-delivers-local), [template-delivers-issue](../deltas/mappings/to-tickets.md#template-delivers-issue) |
| Execution brief and seam reuse | [TDD mapping](../deltas/mappings/tdd.md): [ticket-brief](../deltas/mappings/tdd.md#ticket-brief), [seam-approval](../deltas/mappings/tdd.md#seam-approval), [ask-when-unapproved](../deltas/mappings/tdd.md#ask-when-unapproved) |
| Test design and evidence | Same mapping: [tests-mocking-pointer](../deltas/mappings/tdd.md#tests-mocking-pointer), [loop-rules](../deltas/mappings/tdd.md#loop-rules), [completion](../deltas/mappings/tdd.md#completion), [acceptance-section](../deltas/mappings/tdd.md#acceptance-section), [red-flag-wording](../deltas/mappings/tdd.md#red-flag-wording), [external-interaction-note](../deltas/mappings/tdd.md#external-interaction-note), [behavior-under-test-real](../deltas/mappings/tdd.md#behavior-under-test-real), [deterministic-doubles](../deltas/mappings/tdd.md#deterministic-doubles) |
| Routing integration | [Ask Matt mapping](../deltas/mappings/ask-matt.md): [contract-gate](../deltas/mappings/ask-matt.md#contract-gate), [contract-context](../deltas/mappings/ask-matt.md#contract-context) |

The skills above and TDD's [tests.md](../skills/tdd/tests.md)/[mocking.md](../skills/tdd/mocking.md) own the complete rules.

## 3. Flow change: pause, save, switch, and resume grilling

**Upstream baseline:** the work loop selects a ticket, resolves it by type, and records completion. It lacks this fork's publication and recovery protocol for unfinished tickets.

**Fork change:** discussion can stop safely before the whole ticket is decided. Current recovery context and approved policy are stored separately instead of recovering through an ever-growing discussion history.

Pause/switch differs from simply saving progress: the former releases the unfinished ticket's claim after handoff; the latter retains it. A pause neither resolves the question nor approves unanswered branches. Resuming considers relevant results published in the meantime and recomputes what can proceed.

This flow uses the next section's **publication and backtrace loop**, then handles recovery and claims. It does not define another publication sequence or failure protocol here.

### Implementation trace

- Principal operations: [grilling-pause-trigger](../deltas/mappings/wayfinder.md#grilling-pause-trigger), [grilling-pause](../deltas/mappings/wayfinder.md#grilling-pause), [grilling-context-reuse](../deltas/mappings/wayfinder.md#grilling-context-reuse), [grilling-frontier-refresh](../deltas/mappings/wayfinder.md#grilling-frontier-refresh).
- Shared foundation: [local-ticket-handoff](../deltas/mappings/wayfinder.md#local-ticket-handoff).
- Authoritative rules: [Wayfinder Pause](../skills/wayfinder/SKILL.md#pause), [Local ticket handoff](../skills/wayfinder/SKILL.md#local-ticket-handoff).

## 4. Flow change: Lighthouse + Backtracer publication and backtrace

**Upstream baseline:** answers are recorded on ticket resolution; the map's decision index is organized around closed tickets.

**Fork change:** publication is separate from whole-ticket completion. Confirmed partial results can be indexed, consumed, and traced while their source ticket remains unfinished.

```text
Confirmed results → Lighthouse authority → map index and cross-ticket references
                              ↓
                  Backtracer traces prerequisites
                              ↓
           Human judgment → gap ownership or conflict ruling
```

Ordinary confirmations and approved revisions stay in the conversation until a publication boundary such as pause, save, switch, or ticket completion. Revisions update the original Lighthouse topic. Other tickets read that authority when starting/resuming; upstream results are not copied into consumer policy.

Backtracer traces relevant published topics, including parts of unfinished tickets—not only resolved tickets or the entire map on every call. An open ticket covering a question does not satisfy the prerequisite, but also should not cause a duplicate ticket. Backtracer diagnoses and assigns confirmed gap questions; it does not rule on conflicts, revise policy, or synchronize consumer copies.

### Implementation trace

- Publication authority and index: [answer-recording](../deltas/mappings/wayfinder.md#answer-recording), [local-ticket-handoff](../deltas/mappings/wayfinder.md#local-ticket-handoff), [confirmed-result-index](../deltas/mappings/wayfinder.md#confirmed-result-index), [partial-result-links](../deltas/mappings/wayfinder.md#partial-result-links), [lighthouse-on-resolution](../deltas/mappings/wayfinder.md#lighthouse-on-resolution).
- Trace integration and mutation boundary: [backtracer-on-resolution](../deltas/mappings/wayfinder.md#backtracer-on-resolution), [follow-up-ticket-handoffs](../deltas/mappings/wayfinder.md#follow-up-ticket-handoffs), [map-invalidation-boundary](../deltas/mappings/wayfinder.md#map-invalidation-boundary).
- New sources: [Lighthouse](../skills/lighthouse/SKILL.md), [Backtracer](../skills/backtracer/SKILL.md).
- Batch follow-up belongs to the shared [Gap follow-up](../skills/backtracer/GAP-FOLLOWUP.md), not a new copy in every caller.

### Supporting change: question-level progress and cross-ticket confirmation

A user can name an input-ready question within a blocked ticket without unblocking the entire ticket. When a discussion answers a question owned by another unfinished ticket, confirmation of the decision and target filename permits publication to that Lighthouse at the boundary—not a switch, claim, or mutation of the target's other scope. Existing claims remain respected; policy revisions still require explicit rulings.

Trace: [user-named-question](../deltas/mappings/wayfinder.md#user-named-question), [cross-ticket-confirmation](../deltas/mappings/wayfinder.md#cross-ticket-confirmation), [cross-ticket-filename](../deltas/mappings/wayfinder.md#cross-ticket-filename), [cross-ticket-claim-exception](../deltas/mappings/wayfinder.md#cross-ticket-claim-exception), with shared `grilling-frontier-refresh`. Authority: [Cross-ticket confirmation](../skills/wayfinder/SKILL.md#cross-ticket-confirmation).

## 5. Flow change: Traverse final audit

Upstream hands the cleared map to To-spec. This fork inserts Traverse after all tickets are resolved to check dependency coverage, peer symmetry, layer integrity, and boundary completeness across the entire design tree.

It is complementary global review, not simply a larger version of the same trace: Backtracer starts from changes; Traverse starts from the complete map. New unanswered questions must be settled or return the effort to planning. Resolved tickets alone do not prove design completeness.

- New authoritative source: [Traverse](../skills/traverse/SKILL.md).
- Router integration: [wayfinder-quality-loop](../deltas/mappings/ask-matt.md#wayfinder-quality-loop).
- Shared protocol: [Gap follow-up](../skills/backtracer/GAP-FOLLOWUP.md).

## 6. Extension capability: automated OMP execution and retrospectives

`/spec-to-code` is a separate OMP extension, not a new portable skill. With a prepared spec and approved contract, it creates tickets and dispatches TDD serially in dependency order.

Retro already exists upstream. The addition is **host-driven invocation and outcome retention**: every TDD execution, including failed executions and independent retries, has its own retrospective. Implementation and retrospective outcomes remain separate, suggestions are not applied automatically, and execution completion does not establish full acceptance.

There are no mapping operations for the extension itself:

- Extension entry: [entry.ts](../extensions/entry.ts).
- Retro orchestration and original-session invocation: [tdd-execution.ts](../extensions/implementation-node/tdd-execution.ts), [retro-host.ts](../extensions/implementation-node/retro-host.ts). Code owns the internal mechanism.
- Router introduction: [omp-automation](../deltas/mappings/ask-matt.md#omp-automation).
- Installation, configuration, output locations, and limits: [extension guide](./spec-to-code.md).

The independent [`/hyper-auto-coding`](./hyper-auto-coding.md) command borrows the upstream `implement-spec` dependency frontier and per-ticket worktrees, but the user prepares the integration branch with committed spec/contract inputs. It reuses Phase 1 unchanged, commits tickets, implements concurrently, releases dependencies on first merge, and reuses development worktrees for asynchronous integration tests and repairs with same-session conflict continuations. Only short bidirectional merge attempts are serialized. There is no automatic final overall verification; when needed, acceptance scope is supplied by an optional ordinary ticket, whose evidence may refer to an earlier tree while integration proceeds. There is no code-review or main-agent acceptance gate. Only ticket implementation executions get retro; reports are generated in OS temp and committed together at final draining. Success cleans worktrees while retaining branches. No new Phase 1 gate, retry-count policy, or interruption recovery. Sources: [`hyper-auto-coding/`](../extensions/hyper-auto-coding/) for scheduling and ticket-scoped acceptance, [`integration-node/`](../extensions/integration-node/) for per-ticket integration; implementation concurrency defaults to 4 and shares the existing configuration file with Jev.

Other agents can execute the portable workflow manually; copying skills does not provide OMP's host scheduling.

## 7. Decision lifecycle, scope, and migration implications

Decision tickets settle planning questions; implementation tickets deliver production behavior. Local decision statuses are `open → claimed → resolved`, while `Type` identifies the processing method. Triage applies only to implementation tickets. A resolved ticket may record approved out-of-scope disposition: that does not answer the abandoned question or satisfy dependent prerequisites.

| Change | Implementation trace |
|---|---|
| Lifecycle, type, and work entry | Wayfinder: [decision-ticket-lifecycle](../deltas/mappings/wayfinder.md#decision-ticket-lifecycle), [processing-type-storage](../deltas/mappings/wayfinder.md#processing-type-storage), [processing-type-read](../deltas/mappings/wayfinder.md#processing-type-read), [recorded-type-work](../deltas/mappings/wayfinder.md#recorded-type-work), [tracker-conventions](../deltas/mappings/wayfinder.md#tracker-conventions) |
| Outcomes, not closure alone, satisfy prerequisites | [blocking-evidence](../deltas/mappings/wayfinder.md#blocking-evidence), [out-of-scope-disposition](../deltas/mappings/wayfinder.md#out-of-scope-disposition) |
| Local storage and fields | [Setup mapping](../deltas/mappings/setup-matt-pocock-skills.md): `local-conventions`, `local-decision-handoff`, `local-status-field`, `local-blocking`, `local-publish`, `local-map-and-child`, `local-frontier`, `local-resolve` |
| Implementation triage and setup wording | Same mapping: `setup-choice-wording`, `triage-labels-bullet`, `section-b-defaults`, `triage-labels-body` |
| Implementation paths and routing | To-tickets' [local-path](../deltas/mappings/to-tickets.md#local-path) and Ask Matt's [local-path](../deltas/mappings/ask-matt.md#local-path) |

The extended Wayfinder pause/publication/backtrace loop currently targets the local Markdown tracker. GitHub/GitLab setups do not include this extended loop.

Existing local projects need attention: implementation tickets move from `.scratch/<feature>/issues/` to `.scratch/<feature>/implementation/`; decision tickets use a separate `decision/` directory. Replacing skills does not migrate tickets or project configuration. Rerun setup to review and confirm persistent configuration updates. Review legacy triage statuses on decision tickets individually rather than mechanically converting them to `resolved`.

Storage and fields belong to the [local tracker template](../skills/setup-matt-pocock-skills/issue-tracker-local.md); completion and dependency dispositions belong to [Wayfinder](../skills/wayfinder/SKILL.md).

## 8. Other local changes

| Change | Difference from upstream | Implementation trace |
|---|---|---|
| Opening brief | Grilling opens with the ticket's decision goal and contribution to the Destination, using canonical project terms; not a separate flow | [grilling-opening-brief](../deltas/mappings/wayfinder.md#grilling-opening-brief) |
| Prototype hand-back | Returns a worktree containing the chosen result and `VERDICT.md`, restores the working tree, and writes no spec/ticket here | [Prototype mapping](../deltas/mappings/prototype.md): `skill-hand-back-worktree`, `logic-hand-back-worktree`, `ui-hand-back-worktree`; mode/liftability wording: `prototype-mode-heading`, `prototype-mode-choice`, `logic-mode-routing`, `logic-module-liftability`, `ui-mode-routing`; Wayfinder's [prototype-worktree-asset](../deltas/mappings/wayfinder.md#prototype-worktree-asset) and Ask Matt's `prototype-worktree-detour`/`prototype-worktree-standalone` connect the route |
| Code review default | Reviews uncommitted changes against `HEAD`, including untracked files and respecting `.gitignore`; fixed points remain available, and the spec source must be explicit | [Code-review mapping](../deltas/mappings/code-review.md): `default-target`, `intro-line`, `capture-review-target`, `spec-source`, `standards-prompt-target`, `spec-prompt-target`; Ask Matt's [review-default](../deltas/mappings/ask-matt.md#review-default) |
| Routing vocabulary | Avoids Git-branch terminology for ordinary flow choices | [Ask Matt mapping](../deltas/mappings/ask-matt.md): `conversation-choice-wording`, `build-scope-choice-wording`, `phase-choice-wording` |

## Using the blueprint for maintenance

One flow may span several mappings, and one operation may provide shared support to several flows. This document groups complete changes; mappings group independently editable behaviors. Do not merge operations just to match chapter boundaries.

Find the flow, then follow its operation or handwritten-skill links to the owning source. Actual anchors, ordering dependencies, and edits remain defined in the mappings. Update both language versions of this blueprint when flows change. See the [maintenance guide](./maintenance.md) for editing and building.
