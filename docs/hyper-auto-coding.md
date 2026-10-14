# `/hyper-auto-coding`: parallel delivery around an integration branch

[中文文档](./hyper-auto-coding.cn.md) · [Serial workflow](./spec-to-code.md) · [Repository README](../README.md)

`/hyper-auto-coding <slug>` is an OMP-only command. It reuses `/spec-to-code` Phase 1 unchanged, then implements tickets concurrently in individual branches/worktrees and integrates them serially into the user's local development branch. The old command remains serial and does not orchestrate Git worktrees.

## Install and prepare

Follow the [extension install guide](./spec-to-code.md#install) using the same `extensions/spec-to-code.ts` entry, and copy `spec-to-code/`, `hyper-auto-coding/`, and `agents/` together. This entry registers both commands; do not load it twice.

Required: this repository's `to-tickets`, `tdd`, and `code-review` skills, plus the blocking `tdd` agent. Retros use the installed upstream `retro` and `writing-for-agents` skills unchanged; missing either reports an undelivered retro without changing implementation outcomes. Implementations use the installed TDD agent's model; helpers use the host task agent's model settings.

Before starting:

1. Create and check out a local development branch, not `main`/`master` or detached HEAD.
2. Commit `.scratch/<slug>/spec.md`, `contract.md`, and related input documents to that branch.
3. Keep the working tree and index clean, with a usable local Git commit identity.

All Git operations are local: no push, PR, or merge to main. The command does not create the delivery branch, stash changes, or commit unrelated edits. The slug is a single safe path segment.

## Configuration

The concurrency limit shares `extensions/spec-to-code/config.json` with Jev and is read once at extension load:

```json
{
  "jev": { "enabled": false },
  "hyperAutoCoding": { "maxParallelTickets": 4 }
}
```

`maxParallelTickets` is a positive integer, defaulting to 4. It limits simultaneous ticket implementations, not retros or the final review's two child agents. `/spec-to-code` remains serial. Reload the extension after changing configuration.

## Execution

### Phase 1: reuse ticket cutting

The existing `/to-tickets` activation, automatic answers, Jev decisions, 15-intervention budget, and ticket-file transition are unchanged. There is no new whole-ticket-set publication gate: existing nonempty tickets end Phase 1 under the original rules. The command then commits only the implementation ticket files before Phase 2.

### Phase 2: parallel implementation, serial integration

The main agent reads published tickets and registers their execution dependency graph; this is Phase 2 scheduling input, not another ticket-cutting step. A downstream ticket starts only after its blockers are merged and their integration verification is explicitly accepted.

- First execution creates a ticket branch and an OS-temp worktree from the current integration branch tip.
- Each ticket gets a fresh TDD subagent; ready tickets continuously fill available slots without a batch barrier.
- Before reporting completion, implementers synchronize the integration tip, resolve conflicts, verify, and commit their ticket work.
- The main agent reads reports and evidence and makes explicit acceptance decisions. A normal process exit is not acceptance.
- Incomplete work is assigned to a fresh implementer in the same ticket branch/worktree. Existing progress is retained. Do not continue the old session once it has entered retro; there is no new retry-count policy.
- Fresh integration helpers synchronize and validate; Git merges and integration-checkout code writes are serial. No additional integration worktree is created.
- Failed post-merge verification pauses further merges and new worktree creation; implementations already running elsewhere may continue. A fresh repair helper fixes, verifies, and commits in the integration checkout before the main agent accepts the result. No default rollback.

The main session receives status, report paths, and commit pointers. Implementation, integration, and verification run in independent sessions without inheriting the scheduling transcript.

### Final review and automatic fixes

After every ticket is integrated, a fresh reviewer loads this repository's `code-review` skill, targeting committed changes since the fixed Phase 1 ticket commit and receiving explicit spec/contract pointers. Standards and Spec remain independent parallel axes with separate summaries.

The main agent reads the report. A fresh fixer receives its path, automatically applies justified fixes in the integration checkout, verifies, and commits, followed by another independent review. Routine fixes do not require per-finding user approval; requirements and acceptance criteria cannot be weakened, and unapplied suggestions need reasons. There is no fixed repair-round limit. A fresh verification agent then checks the overall delivery, which the main agent explicitly accepts.

## Retrospectives and report commits

Only agents explicitly enrolled as ticket implementation executions get automatic retro: initial attempts, failed attempts, retries, and fresh continuations. Integration, conflict handling, verification, reviewers, final review fixers, auxiliary agents, and retros themselves do not. The agent name `tdd` alone is not sufficient.

Every implementation ending starts an asynchronous retro in its original session without waiting for merge. One retro per execution; repeated completion does not trigger another. Separate executions may have separate reports; no semantic cross-report deduplication. Retros propose advice only and do not apply changes or operate Git.

The host writes retros and other execution reports outside the Git checkout in a unique OS-temp directory: `%TEMP%` on Windows; otherwise the runtime's OS-temp location (usually selected by variables such as `TMPDIR`, defaulting to `/tmp`). There is no per-merge document movement.

After all code work and overall verification, the `hyper_auto_coding` finish operation:

1. Waits for all retro success/failure terminal outcomes.
2. Publishes reports and records into the integration checkout and commits only the explicit output files.
3. Safely removes clean, integrated ticket worktrees while retaining ticket branches and the integration branch.
4. Returns the final commit, report paths, independent retro outcomes, and cleanup warnings.

Final outputs:

```text
.scratch/<slug>/retro/<ticket-file>/<execution-id>.json
.scratch/<slug>/retro/<ticket-file>/<execution-id>.md
.scratch/<slug>/execution/<run-directory>/*.md
.scratch/<slug>/execution/<run-directory>/workflow.json
```

Retro Markdown exists only for delivered retros; failure records are still committed. Implementation, review, fix, and verification reports and main-agent decisions are retained. Published report pointers are rebased to final locations before temporary files are removed.

A copy or commit failure preserves temporary artifacts and reports an error; it does not rerun implementation or claim all work is committed. Dirty, unmerged, or unsafe-to-remove worktrees are retained with warnings, never force-removed.

## Orchestration surface and limits

The main agent uses `hyper_auto_coding` actions `plan`, `dispatch`, `collect`, `accept`, `integrate`, `confirm_integration`, `repair_integration`, `review`, `assess_review`, `fix`, `verify`, `accept_verification`, and `finish`; `status` is read-only. Native task calls must not bypass the workflow to dispatch its tickets. Every acceptance decision needs a reason/evidence. The host enforces concurrency, dependencies, session ownership, and commit freshness; it does not independently establish the correctness of a natural-language acceptance conclusion.

One workflow runs through the extension at a time. This feature assumes a session completes all tickets; interruption, cancellation, and automatic recovery are not part of this implementation.

## Sources

- [Shared command entry and Phase 1](../extensions/spec-to-code.ts)
- [Orchestration tool and main-agent instructions](../extensions/hyper-auto-coding/extension.ts)
- [Workflow state and acceptance boundaries](../extensions/hyper-auto-coding/workflow.ts)
- [Local Git and worktrees](../extensions/hyper-auto-coding/git.ts)
- [Fresh-session host dispatch](../extensions/hyper-auto-coding/host.ts)
- [Shared original-session retro calls](../extensions/spec-to-code/retro-host.ts), [execution records and final draining](../extensions/spec-to-code/retro-workflow.ts)
