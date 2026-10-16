# `/hyper-auto-coding`: asynchronous delivery around an integration branch

[中文文档](./hyper-auto-coding.cn.md) · [Serial workflow](./spec-to-code.md) · [Repository README](../README.md)

`/hyper-auto-coding <slug>` is an OMP-only command that starts the workflow. `/hyper-auto-coding pause` and `/hyper-auto-coding resume` are the only controls that suspend and continue it; see [Pausing and resuming](#pausing-and-resuming). It reuses `/spec-to-code` Phase 1 unchanged, implements tickets concurrently in per-ticket branches/worktrees, and tests and repairs integrations asynchronously. Only short Git operations in the shared integration checkout are serialized. The old command remains serial and does not orchestrate worktrees.

## Install and prepare

Follow the [extension install guide](./spec-to-code.md#install) using the same `extensions/entry.ts` entry, and copy `implementation-node/`, `integration-node/`, `spec-to-code/`, `hyper-auto-coding/`, and `agents/` together. This entry registers both commands; do not load it twice.

Required: this repository's `to-tickets` and `tdd` skills, plus the blocking `tdd` agent; `code-review` is no longer required. Retros use the installed upstream `retro` and `writing-for-agents` unchanged; missing either reports an undelivered retro without changing implementation outcomes. Implementations use the installed TDD agent's model; helpers use the host task agent's model settings.

Before starting:

1. Create and check out a local integration branch, not `main`/`master` or detached HEAD.
2. Commit `.scratch/<slug>/spec.md`, `contract.md`, and related input documents to it.
3. Keep the working tree and index clean, with a usable local Git commit identity.

All Git operations are local: no push, PR, or merge to main. The command does not create the integration branch, stash changes, or commit unrelated edits. The slug is a single safe path segment.

## Configuration

The concurrency limit shares `extensions/spec-to-code/config.json` with Jev and is read once at extension load:

```json
{
  "jev": { "enabled": false },
  "hyperAutoCoding": { "maxParallelTickets": 4 }
}
```

`maxParallelTickets` is a positive integer, defaulting to 4. It limits simultaneous ticket implementations, not integration children or retros. Reload after changing configuration. `/spec-to-code` remains serial.

## Execution

### Phase 1: reuse ticket cutting

The existing `/to-tickets` activation, automatic answers, Jev decisions, 15-intervention budget, and ticket-file transition are unchanged. No new whole-ticket-set publication gate is added: existing nonempty tickets end Phase 1 under the original rules. The command then commits only implementation ticket files before Phase 2.

### Phase 2: implementation and background integration

The main agent reads published tickets and registers the execution dependency graph, without recutting tickets. It schedules only: it does not judge whether report evidence is sufficient or manually accept/confirm each ticket. Children own their acceptance; normal completion counts as success, without interpreting report prose.

- First execution creates a ticket branch and an OS-temp worktree from the current integration tip.
- A fresh TDD child implements, validates, and promptly commits its ticket, without an extra integration-tip synchronization stage. Ending implementation automatically starts background integration, outside implementation slot limits.
- TDD and integration are different sessions taking sequential ownership of the same worktree and branch. They do not write code concurrently. No extra integration worktree is created.
- The first successful merge releases downstream tickets immediately, before integration tests or repairs finish. Status lists implementation in `active` and background integration separately in `integrating`.
- Failed implementations can retry with a fresh implementer in the original branch/worktree, retaining progress. The retry task begins with the previous rejection reason verbatim and asks the implementer to address it first, preserve existing work, and avoid repeating completed work that needs no rerun; the previous implementation report remains available as handoff context. An original TDD session already running retro is not continued for implementation.

### The short bidirectional merge critical section

Attempts queue FIFO. The lock covers:

1. Attempting to merge the development branch into the integration branch.
2. On conflict, aborting that merge in the integration checkout to restore a clean shared workspace.
3. On the first attempt, whether successful or conflicting, merging the integration commit fixed inside this critical section back into the original development branch. Later attempts do this only on conflict. The reverse merge may leave unresolved conflicts in the development worktree.
4. Releasing the lock after these Git operations, before any agent handles code.

Never release the lock with an unresolved merge in the integration checkout. Ticket-worktree creation coordinates with this same lock rather than inspecting a half-completed merge. The lock never waits for an agent, tests, or repairs.

### One integration child closes the loop

The first attempt always starts a fresh integration child, distinct from the original TDD session. In the original development worktree it resolves existing conflicts, runs the project's global test suite, fixes issues directly, and commits. These global tests remain part of ticket integration. Additional acceptance work—such as complex scripts, cross-ticket checks, or real-device smoke—belongs in an explicitly scoped ticket when desired, not in an automatic final gate.

Then the workflow attempts to merge the result back: success (including no new commits) ends integration. A conflict triggers the abort/reverse-sync critical section, followed by a continuation of the exact same integration child outside the lock. That child resolves and commits, and the workflow queues another attempt. Later success does not trigger another full validation pass; subsequent rounds do not mandate a full test rerun. The child reads code and judges conflict resolutions itself, without main-agent approval or a fixed retry limit.

Integration HEAD advancing is not a rejection condition: clean merges proceed without chasing new HEADs or reacceptance. Background repair and conflict handling do not pause other tickets' dispatch or merges. Only after processing ends and all resulting changes are merged is a ticket **integrated**; its first merge only makes it **merged**.

### Optional acceptance tickets

When final or cross-ticket acceptance is useful, `/to-tickets` can produce a ticket whose own text defines the scope, steps, and evidence. It is optional and is handled like every other ticket: ordinary dependency scheduling, a dedicated worktree, ticket execution, integration tests, and merge. The workflow never creates a separate verifier or fixer and does not judge ticket reports.

Dependencies release after a blocking ticket's first successful merge, while its integration tests and repairs may still be running. An acceptance ticket can therefore run against an earlier tree; later clean merges do not trigger another acceptance pass. This is an accepted tradeoff for parallel development, not a hidden delivery gate.

## Retrospectives and report commits

Only explicitly enrolled ticket implementations get retro, including first attempts, failures, and retries. Integration, conflict continuations, auxiliary agents, and retrospectives themselves do not.

Every implementation ending starts asynchronous retro in the original TDD session, without waiting for merge, once per execution. Integration takes the worktree in a different session; retro only assesses history and proposes advice, without editing code or operating Git. Retro outcomes remain independent of implementation outcomes.

Reports are generated outside the Git checkout in a unique OS-temp directory (`%TEMP%` on Windows, otherwise the runtime OS-temp location). There is no per-merge report movement.

After all ticket integration processing, `finish`:

1. Waits for all retro success/failure terminal outcomes.
2. Publishes reports and records into the integration checkout and commits only explicit output files.
3. Safely removes clean, merged original ticket worktrees while retaining local ticket branches and the integration branch.
4. Returns the final commit, report paths, independent retro outcomes, and cleanup warnings.

Final outputs:

```text
.scratch/<slug>/retro/<ticket-file>/<execution-id>.json
.scratch/<slug>/retro/<ticket-file>/<execution-id>.md
.scratch/<slug>/execution/<run-directory>/*.md
.scratch/<slug>/execution/<run-directory>/workflow.json
```

Retro Markdown exists only for delivered retros; failure records are still committed. Implementation, every integration round, fix, and verification reports and execution states are retained. Published report pointers are rebased to final locations. Main-agent acceptance decisions are no longer generated.

Copy or commit failures preserve temporary artifacts and report errors, without rerunning implementation or claiming everything is committed. Dirty, unmerged, or unsafe-to-remove worktrees are retained with warnings, never force-removed.

## Orchestration surface and limits

`hyper_auto_coding` exposes only `plan`, `dispatch`, `collect`, `finish`, and read-only `status`. `dispatch` returns after starting implementation. Implementation completion or failure, the first merge releasing dependencies, and integration completion or failure request a `collect` check; progress between calls is retained until the next call. `collect` returns the latest state immediately when progress is pending, otherwise waits for the next change. Notifications coalesce into one check; changes after a check starts are not cleared at its end and remain pending for the next check. Overlapping `collect` calls share one check, and waiting does not hold the orchestration guard or block `dispatch`. The main agent retains the existing result-handling and dispatch logic; no automatic dispatcher is added. Integration and conflict continuations are automatic; native task calls must not bypass the workflow to dispatch tickets.

Status includes `temporaryDir`, `active`, `integrating`, the merge-released `ready` frontier, each ticket's first `mergedHead`, report paths, and the pause `mode` with its `checkpoint` path. `finish` returns a delivery summary, not a status snapshot.

One workflow runs through the extension at a time. It assumes a session completes all tickets; interruption, cancellation, and recovery from an arbitrary interruption are not implemented — only the explicit `pause`/`resume` commands below suspend and continue a workflow. Execution errors are recorded honestly; the normal-exit-is-success assumption adds no report-content acceptance logic.

## Pausing and resuming

Workflow control is command-only: `/hyper-auto-coding pause` and `/hyper-auto-coding resume`. There is no natural-language or `hyper_auto_coding`-action equivalent, and the main agent cannot pause or resume itself.

### `pause`: stop fresh work, drain, checkpoint

`pause` applies to the Phase 2 workflow owned by the current session that has not finished; with no such workflow it reports an error. It acknowledges immediately and drains in the background, never holding the command open:

1. It closes admission of new implementation attempts in the owning session immediately, including retries of failed tickets. No later `dispatch` starts an implementation.
2. Work already in flight continues to a known outcome and is never aborted: running TDD implementations, their retrospectives, background integrations, and conflict continuations all finish, and an implementation already running may still start its own background integration child.
3. Once nothing remains in flight, the workflow writes a checkpoint of state-machine-relevant data and becomes **paused**; the completion notice reports the checkpoint path. It does not finish: it publishes no reports, removes no worktrees, and makes no final commit, even when every ticket is already integrated and no retrospective is pending.

`pause` resolves with the paused snapshot. Asking again while a drain is still running joins that same drain instead of starting a second one, and the command is rejected when the workflow is already paused or already finished.

`hyper_auto_coding` `action=status` reports the pause `mode`: `running` while new attempts are still admitted, `pausing` once the gate is closed but work is still draining, and `paused` after the checkpoint exists; it also reports the `checkpoint` path, which exists on every status call even while running. While `mode` is `pausing` or `paused`, `plan`, `dispatch`, and `finish` are refused: only `status` and `collect` remain usable, the main agent keeps calling `collect` until the drain ends, then ends its turn and waits for the user to resume. Pausing aborts nothing, so `collect` still observes implementations, retrospectives, and integrations reaching their normal outcomes.

### `resume`: unlock and continue

`resume` returns a paused workflow to the idle state and makes it schedulable again, in two situations:

- In the same session, immediately after the pause completed, it unlocks the live workflow.
- After reopening the original session and running `/hyper-auto-coding resume` there, it loads the checkpoint and restores the paused workflow. It does not re-run Phase 1, recut tickets, or commit tickets again.

`resume` takes no slug: the checkpoint is addressed by the current session. It only continues a workflow that is paused — a workflow that is still running or draining, or a session with no live pause and no loadable checkpoint, is rejected instead of starting anything. `resume` resolves with the running-mode snapshot and deletes the checkpoint file, so a pause that has already been resumed cannot be restored again. Resuming delivers the restored snapshot to the session right away, and the next `collect` returns immediately instead of waiting; from there the main agent continues as usual: if the dependency graph is not registered yet it plans first, otherwise it dispatches the remaining ready tickets, and calls `finish` once all ticket integration has completed. Restored state keeps the integrated dependency evidence, execution, retrospective, and report ledger, and recorded failures, so `finish` can still produce the same delivery summary it would have produced without the pause.

### Assumptions and limits

- The checkpoint lives outside the repository, under the OS temp directory, as a per-session `hyper-auto-coding-pause-*.json` file whose name is deterministic (`HyperWorkflow.checkpointPath(sessionId)`), so it never enters the integration branch or a commit.
- It is a temporary aid, not durable storage: OS temp cleanup, or terminating the process before the drain finishes, leaves nothing to restore, and `resume` validates and repairs nothing beyond loading that file.
- Pausing assumes the existing artifacts remain available: ticket worktrees and branches, the integration branch and its checkout, and the run's report temp directory. Resume neither copies nor repairs the environment, and performs no extra Git validation.
- Pause/resume cover a deliberate suspension, not an arbitrary interruption: they do not recover a workflow whose host died mid-flight, do not recreate missing artifacts, and do not transfer a checkpoint to another session or slug.
- Pausing does not stop an in-flight ticket, its retrospective, or its integration, and does not by itself change what `finish` later publishes.

## Sources

- [Approved decision and trade-offs](./adr/0004-asynchronous-ticket-integration.md)
- [Shared command entry and Phase 1](../extensions/entry.ts)
- [Orchestration tool and main-agent instructions](../extensions/hyper-auto-coding/agent-tools.ts)
- [Workflow scheduling and report publication](../extensions/hyper-auto-coding/workflow.ts)
- [Ticket integration state, merge attempts, and conflict continuation](../extensions/integration-node/ticket-integration.ts)
- [Local Git and worktrees](../extensions/hyper-auto-coding/git.ts)
- [Fresh sessions and integration continuations](../extensions/hyper-auto-coding/subagent-host.ts)
- [Original TDD-session retro](../extensions/implementation-node/retro-host.ts), [execution records and final draining](../extensions/implementation-node/tdd-execution.ts)
