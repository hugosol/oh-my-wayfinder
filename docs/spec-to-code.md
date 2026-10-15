# `/spec-to-code`: spec to code

[中文文档](./spec-to-code.cn.md) · [Repository README](../README.md)

`/spec-to-code` is this repository's automation extension for [Oh My Pi](https://github.com/can1357/oh-my-pi) (OMP): one command turns a prepared spec into implementation tickets and executes them with serial TDD subagents. It is optional and OMP-only — the Markdown skills work without it, and copying skills alone does not install it.

What the fork changes, and where, is owned by the [upstream comparison blueprint](./upstream-differences.md). This page covers install, run, and how to read the results; the [extension source](#sources) is the authority.

## Before you run

Both inputs live under `.scratch/<slug>/`:

- `spec.md` — the prepared spec published by `/to-spec`.
- `contract.md` — the approved contract written by `/to-contract`. Tickets are cut from it; without a contract, Phase 1 stops and asks for `/to-contract` first ([to-tickets skill](../skills/to-tickets/SKILL.md)).

### Install

Copy the following artifacts, keeping their relative layout. The same entry also registers the independent [parallel `/hyper-auto-coding` command](./hyper-auto-coding.md):

```text
<extension root>/
  entry.ts              # shared extension entry; registers both commands
  implementation-node/  # shared TDD execution records and retrospective lifecycle
  spec-to-code/          # shared Phase 1 and configuration modules
  hyper-auto-coding/     # parallel command modules, imported relatively by the entry
  agents/
    tdd.md               # blocking `tdd` task agent; autoloads the `tdd` skill, pins its own model
```

`implementation-node/` groups the shared TDD execution records and independent retrospective lifecycle; TDD dispatch remains in the existing workflows. Integration scheduling remains in `hyper-auto-coding/workflow.ts`, while `agent-tools.ts` defines the main agent’s workflow tool. This layout changes naming and ownership only, not execution order or completion rules.

When updating an existing installation, replace the previous layout and update any file-based extension configuration to `entry.ts`; load only one entry to avoid duplicate tool and command registration.

The shipped `tdd.md` pins `deepseek/deepseek-flash:high` in its frontmatter; edit the installed copy if your model setup differs.

Load the entry the usual OMP ways:

- Auto-discovery: `<cwd>/.omp/extensions/` (project) or the agent dir's `extensions/` (`~/.omp/agent/extensions/` by default).
- Configured: add the root to `extensions:` in `~/.omp/agent/config.yml` (user) or `<cwd>/.omp/config.yml` (project; `.omp/settings.json` works too), or start OMP with `omp -e <path>`.

Keep `agents/tdd.md` where OMP discovers task agents: as the `agents/` sibling of a directory-style extension root (a `config.yml` entry or `omp -e <dir>`), or in `<cwd>/.omp/agents/` (project) / `~/.omp/agent/agents/` (user). A file-only entry has no `agents/` sibling to scan.

### Dependencies

- The `to-tickets` and `tdd` skills (this repository's reworked versions, installed by the overlay step in the [quick start](../README.md#quick-start)) and the `tdd` agent are required. The command checks for them before starting and reports exactly what is missing — nothing to confirm by hand.
- Retros load the installed upstream `retro` and `writing-for-agents` skills unmodified. They are not part of the start-up check: if either is missing, that execution's retro is reported undelivered while TDD continues.

### Configuration (optional)

`extensions/spec-to-code/config.json` is read once, at extension load — reload the extension after editing it:

```json
{ "jev": { "enabled": false }, "hyperAutoCoding": { "maxParallelTickets": 4 } }
```

`hyperAutoCoding.maxParallelTickets` affects only the parallel command; this command remains serial.

With `jev.enabled: true`, and when the host `judge` role resolves a native judge model (for example a TypeSafe Jev model such as `typesafe/jev-latest`), the judge chooses each automatic reply. Round 1 offers only "请你仔细思考后回答这些问题" / "请生成文件", so the first automatic reply is never a bare "请继续"; "请继续" joins from round 2. Without a judge, or on any judge failure, the run falls back to the canned sequence.

## Run

```text
/spec-to-code <slug>
```

This is the only manual step; the run is driven by the session that started it. Two automatic phases follow: Phase 1 cuts tickets with `to-tickets`, Phase 2 executes them one by one.

Phase 1 — ticket cutting:

- `to-tickets` is activated with the spec and contract paths; tickets land in `.scratch/<slug>/implementation/`.
- Every `ask` is auto-answered with "请你仔细思考后回答这个问题" instead of waiting for a person (outside a run, `ask` behaves normally).
- Each turn ending sends one automatic reply: the canned sequence by default ("请你仔细思考后回答这些问题", then "请生成文件"), or the judge's choice in Jev mode.
- The automation is bounded: ask answers and auto replies each spend one unit of a fixed 15-intervention budget per run. If it runs out with no tickets on disk, the run stops and hands control back to you; tickets already on disk start Phase 2 anyway.
- Phase 1 ends as soon as non-empty ticket files are in `.scratch/<slug>/implementation/` (in Jev mode, this check short-circuits before the judge from round 2 on). An aborted or errored turn, or an exhausted budget, stops the run instead of looping.

Phase 2 — serial TDD:

- Tickets are ordered by their dependency edges; one `task(agent="tdd")` runs at a time, each waiting for the previous.
- If the workflow retries a failed ticket, the retry is a fresh, independent TDD execution with its own retrospective. This feature does not add an automatic retry policy.
- After every attempt (failures included), the host starts a background retro in the original TDD session. Later TDD does not wait for it, and neither should you.
- When all attempts and retries have ended, the run calls `spec_to_code_finish`, which waits for every retro to reach a success or failure terminal outcome and returns the summary; the workflow will not wrap up before that.

## Retrospectives: what gets written

Every execution gets its own retro. It runs in the original TDD session against that conversation's history (no workspace snapshots or worktree orchestration), returns a Markdown analysis, and the host saves an execution record and, when delivered, the retrospective body:

```text
.scratch/<slug>/retro/<ticket-file>/<run-id>.json
.scratch/<slug>/retro/<ticket-file>/<run-id>.md
```

- JSON — the execution record: the original TDD result, the independent retro state and errors, identity, and paths. It is written from the attempt's start, so the TDD result survives even when no retrospective was delivered.
- Markdown — the delivered retrospective, with source-session and execution information so you can trace it back to the work it reviewed. It is only available when the retrospective is delivered.

How to read the outcome:

- `tdd_status` describes the execution result; whether a ticket is accepted comes from each TDD report, not from the run summary.
- Implementation and retrospective outcomes are independent: a delivered retrospective is not an acceptance, and a failed retro does not change the implementation result.
- The finish summary lists every execution with both statuses and its file paths, plus the tickets that were never dispatched.

## Automation is not a correctness guarantee

Automation advances the session and records execution outcomes; it does not independently establish correctness.

- Automatic replies are not answers to the agent's questions: the canned replies tell the agent to think it through or to publish, and the judge picks from that same small set.
- Ticket splits, acceptance, and retro findings stay yours to review; the run does not gate on them. A finished run reports what was attempted, what was not, and what was delivered; it does not mean the work is correct.
- Retro output is advice: the retro is instructed to propose only — it does not apply suggestions, and it does not modify code, config, skills, or agent instructions, or write files itself.
- `/spec-to-code` runs no code review; the serial workflow invokes only `to-tickets`, `tdd`, `retro`, and `writing-for-agents`.

## Practical limits

- Bounded replies: at most 15 automatic interventions per run; the run stops and hands back when the budget is exhausted before any ticket lands.
- No recovery queue: scheduling state is in memory, and the JSON/Markdown files are audit records. A pending/running record left behind by a crashed process is only its last observed state; nothing is resumed automatically.
- Cancellation: switching or closing the owning session cancels its background retros, and cancelled retros are not resumed.
- Undelivered retros are possible: a missing `retro` or `writing-for-agents` skill, an unavailable original session, isolated execution, an empty or truncated retro body, or a document write failure all produce an undelivered retro with a warning; record-write failures are reported as well.
- A failed retro is terminal: it does not stop TDD, does not change implementation outcomes, is not retried, and does not block the final summary.
- One run at a time: starting a second run while one is active is rejected.
- Background retros are not concurrency-capped.

See [`tdd-execution.ts`](../extensions/implementation-node/tdd-execution.ts) and [`retro-host.ts`](../extensions/implementation-node/retro-host.ts) for these behaviors.

## Sources

- Entry and install layout: [`extensions/entry.ts`](../extensions/entry.ts)
- Turn replies, budget, and stop conditions: [`turn-policy.ts`](../extensions/spec-to-code/turn-policy.ts), [`workflow-session.ts`](../extensions/spec-to-code/workflow-session.ts)
- Judge chain: [`jev-judge.ts`](../extensions/spec-to-code/jev-judge.ts)
- Skill activation and dependency preflight: [`skill-activation.ts`](../extensions/spec-to-code/skill-activation.ts)
- TDD agent: [`extensions/agents/tdd.md`](../extensions/agents/tdd.md)
- Retro behavior, identity, and output files: [`retro-host.ts`](../extensions/implementation-node/retro-host.ts), [`tdd-execution.ts`](../extensions/implementation-node/tdd-execution.ts)
- Configuration: [`config.json`](../extensions/spec-to-code/config.json), [`config.ts`](../extensions/spec-to-code/config.ts)
- Skills used: [to-tickets](../skills/to-tickets/SKILL.md), [tdd](../skills/tdd/SKILL.md); upstream `retro` and `writing-for-agents` are used unmodified.
- Fork differences: [upstream comparison blueprint](./upstream-differences.md).
