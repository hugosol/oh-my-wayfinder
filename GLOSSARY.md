# Automated Implementation

The OMP-only `/spec-to-code` and `/hyper-auto-coding` workflows turn approved specs into implementation tickets and execute them serially or around a local integration branch. They share vocabulary with the planning pipeline (`wayfinder` → `to-spec` → `to-contract` → `to-tickets`).

## Language

**Decision ticket**:
A planning artifact that resolves a question or records a confirmed decision not to pursue it. Research and prototype evidence may support it; production delivery is a separate concern.
_Avoid_: implementation ticket, implementation task

**Resolved decision**:
A recorded decision or confirmed out-of-scope disposition, not a claim about production delivery. A disposition does not supply the original question’s answer or satisfy dependencies on that answer.

**Triage**:
Classification and readiness assessment for implementation tickets, separate from the decision-ticket lifecycle.

**Implementation ticket**:
A tracer-bullet vertical slice cut from an approved contract; the unit phase 2 implements. Failed attempts may be followed by independent retries.
_Avoid_: issue, task (reserve those for a real tracker)

**Publish**:
Write the approved implementation tickets to the configured tracker; for a local tracker, one file per ticket under the feature's implementation directory.
_Avoid_: generate, save

**Ticket landed**:
A published implementation ticket file exists on disk. For a local tracker this is the deterministic evidence that phase 1 is done.
_Avoid_: tickets generated

**Phase 1**:
Turn the spec and its approved contract into published implementation tickets.

**Phase 2**:
Execute the published tickets in dependency order, then collect the outcomes of their execution attempts and retrospectives.

**Execution attempt**:
One TDD execution of one implementation ticket, with its own outcome and source session. A retry is a new execution attempt of the same ticket.
_Avoid_: ticket completion (an ended attempt need not satisfy acceptance)

**Retrospective**:
An additional, history-based assessment of one execution attempt, independent of that attempt's implementation outcome.
_Avoid_: review, acceptance verification

**Workflow settled**:
Every dispatched execution attempt and its retrospective has reached a known outcome, including failures or undelivered retrospectives. Settlement does not mean every ticket passed acceptance.

**Workflow pausing**:
New implementation attempts are no longer admitted, while already-started attempts, their retrospectives, and their ticket integrations are allowed to reach known outcomes.

**Workflow paused**:
No implementation attempt, retrospective, or ticket integration remains in flight, and new implementation attempts remain suspended until explicitly resumed. A paused workflow is not necessarily delivery complete or successful.

**Integration branch**:
The user-prepared development branch that receives the assembled delivery. It is distinct from the individual ticket branches and the repository's main branch.
_Avoid_: main, ticket branch

**Ticket integration**:
The process of bringing an implementation ticket's worktree branch into the integration branch, including integration testing, repairs, conflict resolution, and any further merge attempts needed to land the resulting changes. Integration does not certify later combinations of changes.

**Acceptance ticket**:
An optional ticket explicitly scoped to confirm specified behavior of the assembled delivery, with its scope, steps, and evidence stated in the ticket.

**Merged ticket**:
An implementation ticket whose work has first reached the integration branch. This releases its dependent tickets without claiming integration testing or repairs are complete.

**Integrated ticket**:
A merged implementation ticket whose integration testing and any resulting repairs and conflict resolution are complete, with all resulting changes merged into the integration branch. This does not certify later combinations of changes.

**Implementation frontier**:
The implementation tickets available to start because all their blocking tickets have been merged; those blockers need not yet be integrated.

**Delivery complete**:
All planned implementation tickets are integrated and delivery reports are committed. Retrospective delivery remains an independent outcome.
_Avoid_: workflow settled

**Jev mode**:
Turn-reply selection delegated to the judge chain instead of the built-in canned sequence. Off by default; the canned sequence is the deterministic alternative.
_Avoid_: judge mode
