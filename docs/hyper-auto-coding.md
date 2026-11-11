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

## Optional local multi-repository mode

The current repository is the **coordinator repository**: it holds the spec, contract, global ticket files, reports, retrospectives, and cleanup records. To include other local Git repositories, supply `.scratch/<slug>/repositories.json` in the coordinator (Phase 1 may create it):

```json
{
  "repositories": [
    { "id": "frontend", "path": "." },
    { "id": "backend", "path": "../backend" }
  ]
}
```

This is the manifest schema: a nonempty `repositories` array of `{ "id": string, "path": string }` entries. IDs match `[A-Za-z0-9][A-Za-z0-9_-]*` and are unique. Paths are absolute or relative to the coordinator Git root; exactly one must resolve to the coordinator. Entries must identify distinct Git repositories: aliases sharing a Git common directory are rejected. Every target needs a clean working tree/index, a usable Git identity, and a checked-out named integration branch other than `main`/`master`. Only the coordinator needs spec/contract inputs. All repository checks happen before implementation begins.

With no manifest, the sole repository ID is `coordinator` and existing single-repository behavior is preserved. In a single-entry manifest the declared ID is the sole default instead. Multi-repository tickets must include `**Repositories:** frontend, backend` with nonempty comma-separated manifest IDs; single-repository tickets may omit it. Ticket filenames/IDs, dependency graph, and implementation slots remain global, not per repository. A development ticket targets exactly one repository; an integration/acceptance ticket may target several and its owner may modify any listed repository. This local-only mode adds no push, remote orchestration, scheduling gate, or change to serial `/spec-to-code`.

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

The existing `/to-tickets` activation, automatic answers, Jev decisions, 15-intervention budget, and ticket-file transition are unchanged. No new whole-ticket-set publication gate is added: existing nonempty tickets end Phase 1 under the original rules. The command then commits the implementation ticket files together with the optional `repositories.json` and the slug's `contract.md` (whose "Delivering work" mapping Phase 1 fills in), and refuses to start Phase 2 while anything else is still tracked or untracked, because every later integration merge requires a fully clean integration checkout.

### Phase 2: implementation and background integration

The main agent reads published tickets and registers the execution dependency graph, without recutting tickets. It schedules only: it does not judge whether report evidence is sufficient or manually accept/confirm each ticket. Children own their acceptance; normal completion counts as success, without interpreting report prose.

- First dispatch creates one ticket branch and OS-temp worktree per listed repository, from each repository's current integration HEAD at dispatch time. Retries reuse all original branches/worktrees.
- A fresh TDD child implements, validates, and promptly commits its ticket, without an extra integration-tip synchronization stage. Ending implementation automatically starts background integration, outside implementation slot limits.
- Each implementation attempt uses one TDD session; each integration attempt uses one later integration session. They take sequential ownership of all the ticket's original repository worktrees and branches and do not write code concurrently. An integration retry starts a fresh integration session without another TDD execution. No extra integration worktree is created.
- Only after every listed repository has its first successful merge are downstream tickets released, before integration tests or repairs finish. An unchanged repository counts as merged without an empty commit. Status lists implementation in `active` and background integration separately in `integrating`.
- Failed implementations can retry with a fresh implementer in the original branch/worktree, retaining progress. The retry task begins with the previous rejection reason verbatim and asks the implementer to address it first, preserve existing work, and avoid repeating completed work that needs no rerun; the previous implementation report remains available as handoff context. An original TDD session already running retro is not continued for implementation.

### The short bidirectional merge critical section

Attempts queue FIFO. The lock covers:

1. Attempting to merge the development branch into the integration branch.
2. On conflict, aborting that merge in the integration checkout to restore a clean shared workspace.
3. On the first attempt, whether successful or conflicting, merging the integration commit fixed inside this critical section back into the original development branch. Later attempts do this only on conflict. The reverse merge may leave unresolved conflicts in the development worktree.
4. Releasing the lock after these Git operations, before any agent handles code.

Never release the lock with an unresolved merge in the integration checkout. Ticket-worktree creation coordinates with this same lock rather than inspecting a half-completed merge. The lock never waits for an agent, tests, or repairs.

### One integration child per attempt closes the loop

The first attempt always starts one fresh integration child, distinct from the original TDD session, owning all original repository worktrees. It resolves existing conflicts, runs each listed repository's global test suite plus any explicitly required cross-repository checks, fixes issues directly, and commits in the affected repositories. These global tests remain part of ticket integration. Additional acceptance work—such as complex scripts, cross-ticket checks, or real-device smoke—belongs in an explicitly scoped ticket when desired, not in an automatic final gate.

Then the workflow attempts to merge the result back: success (including no new commits) ends integration. A conflict triggers the abort/reverse-sync critical section, followed by a continuation of the exact same integration child outside the lock. That child resolves and commits, and the workflow queues another attempt. Later success does not trigger another full validation pass; subsequent rounds do not mandate a full test rerun. The child reads code and judges conflict resolutions itself, without main-agent approval or a fixed retry limit.

Integration HEAD advancing is not a rejection condition: clean merges proceed without chasing new HEADs or reacceptance. Background repair and conflict handling do not pause other tickets' dispatch or merges. Only after processing ends and all resulting changes are merged is a ticket **integrated**; its first merge only makes it **merged**.

### Retrying a failed integration

Use `hyper_auto_coding` with `action=retry_integration` only when a ticket's implementation succeeded but its integration is `failed`. Reuse the `tickets` array with exactly one registered ticket ID (replace the example filename with the target ticket):

```json
{
  "action": "retry_integration",
  "tickets": ["01-example.md"]
}
```

The call starts background integration and returns without rerunning TDD or implementation. It reuses all original repository worktrees and branches, existing report paths, and the first `mergedHeads`; earlier successful merges are neither reset nor rolled back. A fresh integration agent receives the previous integration error and report context rather than continuing the failed agent's session.

This is the full ordinary integration process, not a merge-only retry: the agent may resolve conflicts, run the required checks, repair code, commit, and automatically merge the results. No manual merge is required. The state transitions from `failed` to `integrating`, then to `integrated` or `failed`. Success still requires completed integration testing and all resulting repairs and conflict resolutions merged into every corresponding integration branch; neither starting the retry nor an earlier first merge counts as success.

Observe progress and outcomes with `status` (read-only) and `collect`, as for the initial integration. A retry is refused while the workflow is `pausing` or `paused`, or while that ticket already has an integration attempt in flight. It does not apply to failed implementations, tickets that are already integrated, or integrations that have not failed.

### Optional acceptance tickets

When final, cross-ticket, or cross-repository acceptance is useful, `/to-tickets` can produce an integration/acceptance ticket whose own text defines the target repository IDs, scope, required checks and run steps against those worktrees, approved seams, test ownership, and evidence for each promise. Development tickets own their single-repository behavior; the cross-repository ticket owns observation across its listed repositories, not merely running each repository's suite. Acceptance tickets are optional for other deliveries; when the contract includes cross-repository behavior, `/to-tickets` must assign an explicit cross-repository integration/acceptance ticket whose checks pass in each participating repository. It is handled like every other ticket: ordinary dependency scheduling, original worktrees in its listed repositories, ticket execution, integration tests, and merges. The workflow never creates a separate verifier or fixer and does not judge ticket reports.

Dependencies release after a blocking ticket's first successful merge in every listed repository, while its integration tests and repairs may still be running. An acceptance ticket can therefore run against an earlier tree; later clean merges do not trigger another acceptance pass. This is an accepted tradeoff for parallel development, not a hidden delivery gate.

## Above-input dual-layer progress

The widget appears only after a command passes startup checks and starts a workflow; ordinary conversations have no widget. Phase 1 shows ticket preparation. Phase 2 uses one layered bar: solid `█` cells represent successful integration, while shaded `░` cells beyond that portion represent ended TDD work not yet integrated; `·` marks the remainder. No blank row is added below the widget. Separate `TDD ended ended/total` and `integrated integrated/total` counts share the same denominator.

The total counts distinct published implementation tickets, including optional acceptance tickets published as ordinary implementation tickets. Execution counts use each ticket's latest TDD attempt, including successful and failed endings, without waiting for retro. A retry retracts that ticket's execution count until it ends and never increases the total. Solid progress requires `integrated`; the first merge is insufficient. Background changes refresh the widget without waiting for another main-agent tool call.

Pausing retains the bar and labels its state. Reopening the original session restores its display; `resume` recomputes live progress from the existing pause checkpoint. New-session takeover and arbitrary crash recovery are not supported; a display snapshot is not an execution checkpoint. Final progress remains until another workflow starts or the session switches. Full progress does not skip retrospectives or other existing finish requirements. Interactive terminals render above the input; RPC presentation is client-dependent.

## Retrospectives and report commits

Only explicitly enrolled ticket implementations get retro, including first attempts, failures, and retries. Integration, conflict continuations, auxiliary agents, and retrospectives themselves do not.

Every implementation ending starts asynchronous retro in the original TDD session, without waiting for merge, once per execution. Integration takes the worktree in a different session; retro only assesses history and proposes advice, without editing code or operating Git. Retro outcomes remain independent of implementation outcomes.

Reports are generated outside the Git checkout in a unique OS-temp directory (`%TEMP%` on Windows, otherwise the runtime OS-temp location). There is no per-merge report movement. Retrospectives are staged in `retro/`, and cleanup attempts in the same run directory's `cleanup/`.

Each truly integrated ticket immediately releases scheduling and starts detached cleanup, without blocking other tickets. The first merge is not a cleanup trigger: integration testing, repairs, and the final merge must have ended. Cleanup waits only for that ticket's retrospective to reach a terminal outcome, then resumes its original implementation (TDD + retro) session and afterward its original integration session, sequentially, to remove ticket-owned rebuildable artifacts. This includes ticket-owned external build directories such as a `target` directory outside the worktree, but excludes shared caches, source files, and delivery reports. These are cleanup-only continuations, not new implementation, integration, or retrospective attempts. Each failure warns and skips the failed step without changing the integration outcome or preventing later cleanup steps. Safe removal of the ticket's repository worktrees follows; this run's ticket-branch identity is retained.

After all ticket integration processing, `finish`:

1. Waits for all retro success/failure terminal outcomes and all detached ticket cleanup to settle before releasing the original sessions.
2. Publishes all reports, retrospectives, and records centrally into the coordinator integration checkout and commits only explicit output files. Report heads are keyed by repository ID.
3. Retries this run's remaining worktrees across all repositories, then safely deletes its merged ticket branches only when their worktrees are gone. A residual worktree keeps its branch; every user integration branch is retained.
4. Best-effort publishes and separately commits `cleanup.json`, recording early attempts, final retries, branch cleanup, and residual resources. Cleanup-report write or commit failures only warn and do not block completion.
5. Cleans temporary artifacts and returns the delivery commit, cleanup-report commit if successful, report paths, independent retro outcomes, and residual resources and warnings.

Final outputs:

```text
.scratch/<slug>/retro/<ticket-file>/<execution-id>.json
.scratch/<slug>/retro/<ticket-file>/<execution-id>.md
.scratch/<slug>/execution/<run-directory>/*.md
.scratch/<slug>/execution/<run-directory>/workflow.json
.scratch/<slug>/execution/<run-directory>/cleanup.json
```

Retro Markdown exists only for delivered retros; failure records are still committed. Implementation, every integration round, fix, and verification reports and execution states are retained. Published report pointers are rebased to final locations. Main-agent acceptance decisions are no longer generated.

Delivery/retro report copy or commit failures preserve temporary artifacts and report errors, without rerunning implementation or claiming everything is committed. Cleanup and its supplementary report are best-effort: `cleanup.json` is not a completion gate. A failed commit can leave that report uncommitted or staged; the result identifies its path without forcibly resetting the index. Dirty, unmerged, or unsafe-to-remove worktrees are retained with warnings, never force-removed. Artifact cleanup is best-effort and uses the original sessions' ticket context, without an artifact registry or historical cleanup scan. Safe worktree and branch cleanup considers only this run's recorded resources, not historical leftovers; cleanup history and branch identities survive pause checkpoints.

## Orchestration surface and limits

`hyper_auto_coding` exposes only `plan`, `dispatch`, `retry_integration`, `collect`, `finish`, and read-only `status`. `dispatch` returns after starting implementation. Implementation completion or failure, the first merge releasing dependencies, and integration completion or failure request a `collect` check; progress between calls is retained until the next call. `collect` returns the latest state immediately when progress is pending, otherwise waits for the next change. Notifications coalesce into one check; changes after a check starts are not cleared at its end and remain pending for the next check. Overlapping `collect` calls share one check, and waiting does not hold the orchestration guard or block `dispatch`. The main agent retains the existing result-handling and dispatch logic; no automatic dispatcher is added. Integration and conflict continuations are automatic; native task calls must not bypass the workflow to dispatch tickets.

Status includes `temporaryDir`, `active`, `integrating`, the merge-released `ready` frontier, repository-keyed ticket worktrees and first `mergedHeads`, report paths, and the pause `mode` with its `checkpoint` path. `finish` returns a delivery summary, not a status snapshot.

A failure isolates the affected dependency chain; independent tickets can continue. A merge already completed in another repository is not rolled back: there is no cross-repository transaction or rollback. Later clean merges do not require another full validation pass.

One workflow runs through the extension at a time. It assumes a session completes all tickets; interruption, cancellation, and recovery from an arbitrary interruption are not implemented — only the explicit `pause`/`resume` commands below suspend and continue a workflow. Execution errors are recorded honestly; the normal-exit-is-success assumption adds no report-content acceptance logic.

## Pausing and resuming

Workflow control is command-only: `/hyper-auto-coding pause` and `/hyper-auto-coding resume`. There is no natural-language or `hyper_auto_coding`-action equivalent, and the main agent cannot pause or resume itself.

### `pause`: stop fresh work, drain, checkpoint

`pause` applies to the Phase 2 workflow owned by the current session that has not finished; with no such workflow it reports an error. It acknowledges immediately and drains in the background, never holding the command open:

1. It closes admission of new implementation attempts in the owning session immediately, including retries of failed tickets. No later `dispatch` starts an implementation.
2. Work already in flight continues to a known outcome and is never aborted: running TDD implementations, their retrospectives, background integrations, and conflict continuations all finish, and an implementation already running may still start its own background integration child.
3. It also drains all detached ticket cleanup, including cleanup started by integrations during the drain, before releasing the original sessions or writing the checkpoint. Once nothing remains in flight, the workflow writes a checkpoint of state-machine-relevant data and becomes **paused**; the completion notice reports the checkpoint path. It does not run finish: it publishes no reports, deletes no ticket branches, and makes no final commit, even when every ticket is already integrated and no retrospective is pending. Tickets integrated during the drain still follow the ticket-local retro wait, sequential original-session artifact cleanup, and safe worktree removal described above.

`pause` resolves with the paused snapshot. Asking again while a drain is still running joins that same drain instead of starting a second one, and the command is rejected when the workflow is already paused or already finished.

`hyper_auto_coding` `action=status` reports the pause `mode`: `running` while new attempts are still admitted, `pausing` once the gate is closed but work is still draining, and `paused` after the checkpoint exists; it also reports the `checkpoint` path, which exists on every status call even while running. While `mode` is `pausing` or `paused`, `plan`, `dispatch`, `retry_integration`, and `finish` are refused: only `status` and `collect` remain usable, the main agent keeps calling `collect` until the drain ends, then ends its turn and waits for the user to resume. Pausing aborts nothing, so `collect` still observes implementations, retrospectives, integrations, and background ticket cleanup reaching their normal outcomes.

### `resume`: unlock and continue

`resume` returns a paused workflow to the idle state and makes it schedulable again, in two situations:

- In the same session, immediately after the pause completed, it unlocks the live workflow.
- After reopening the original session and running `/hyper-auto-coding resume` there, it loads the checkpoint and restores the paused workflow. It does not re-run Phase 1, recut tickets, or commit tickets again.

`resume` takes no slug: the checkpoint is addressed by the current session. It only continues a workflow that is paused — a workflow that is still running or draining, or a session with no live pause and no loadable checkpoint, is rejected instead of starting anything. `resume` resolves with the running-mode snapshot and deletes the checkpoint file, so a pause that has already been resumed cannot be restored again. Resuming delivers the restored snapshot to the session right away, and the next `collect` returns immediately instead of waiting; from there the main agent continues as usual: if the dependency graph is not registered yet it plans first, otherwise it dispatches the remaining ready tickets, and calls `finish` once all ticket integration has completed. Restored state keeps the integrated dependency evidence, execution, retrospective, and report ledger, and recorded failures, so `finish` can still produce the same delivery summary it would have produced without the pause.

### Assumptions and limits

- The version-2 checkpoint retains every repository's integration baseline, ticket worktree/branch identity, first-merge evidence, reports, and cleanup history under the same session owner. It does not change the global pause/drain behavior. Version-1 checkpoints are not migrated: finish existing paused workflows with the old version before upgrading; the new version cannot resume an old checkpoint.
- The checkpoint lives outside the repository, under the OS temp directory, as a per-session `hyper-auto-coding-pause-*.json` file whose name is deterministic (`HyperWorkflow.checkpointPath(sessionId)`), so it never enters the integration branch or a commit.
- It is a temporary aid, not durable storage: OS temp cleanup, or terminating the process before the drain finishes, leaves nothing to restore, and `resume` validates and repairs nothing beyond loading that file.
- Pausing assumes the artifacts still needed remain available: unfinished tickets' worktrees, retained ticket branches, the integration branch and its checkout, and the run's report temp directory. Integrated tickets' worktrees may already be removed; checkpoint paths retain resource identity and history, not a requirement to recreate them. Resume neither copies nor repairs the environment, and performs no extra Git validation.
- Pause/resume cover a deliberate suspension, not an arbitrary interruption: they do not recover a workflow whose host died mid-flight, do not recreate missing artifacts, and do not transfer a checkpoint to another session or slug.
- Pausing does not stop an in-flight ticket, its retrospective, or its integration, and does not by itself change what `finish` later publishes.

## Sources

- [Approved decision and trade-offs](./adr/0004-asynchronous-ticket-integration.md)
- [Shared command entry and Phase 1](../extensions/entry.ts)
- [Orchestration tool and main-agent instructions](../extensions/hyper-auto-coding/agent-tools.ts)
- [Workflow scheduling and report publication](../extensions/hyper-auto-coding/workflow.ts)
- [Ticket integration state, merge attempts, and conflict continuation](../extensions/integration-node/ticket-integration.ts)
- [Local repository manifest and startup checks](../extensions/hyper-auto-coding/repositories.ts)
- [Local Git and worktrees](../extensions/hyper-auto-coding/git.ts)
- [Fresh sessions and integration continuations](../extensions/hyper-auto-coding/subagent-host.ts)
- [Original TDD-session retro](../extensions/implementation-node/retro-host.ts), [execution records and final draining](../extensions/implementation-node/tdd-execution.ts)
