---
name: to-contract
description: Turn a spec into an approved contract of promises and seams.
disable-model-invocation: true
---

# To Contract

Turn a spec into an **approved contract**: the promises this feature makes, and the seams at which they will be observed. This is the step between `to-spec` and `to-tickets`.

The contract is a **decision artifact**, not a narrative. The spec says why this work exists and what it is for; the contract says what is promised, where each promise becomes observable, and what stays free behind the seam. `/to-tickets` slices against it, acceptance tests and QA verify against it.

Do not write code, and do not re-interview the user about the requirement — the spec already holds that. Use the seam proposal, boundary review, and acceptance-mode choice in step 4; ask follow-ups only where an unresolved decision changes the contract.

## Loads

- Call the Skill tool with "codebase-design" before proposing any seam. It is the single owner of the **module / interface / seam / adapter / depth / leverage / locality** vocabulary and its principles — the deletion test, "the interface is the test surface", internal vs external seams, "one adapter means a hypothetical seam, two means a real one". Use its terms exactly; do not drift into "component", "service", "API" or "boundary".
- Use codebase-design's dependency categories when the promises cross an external dependency.
- Read `GLOSSARY.md` for domain vocabulary; call the Skill tool with "domain-modeling" only when a term is being resolved or an ADR is being written.

## Prerequisites

The issue tracker and triage vocabulary should have been provided by `/setup-matt-pocock-skills`. You need: the spec (issue or path), `GLOSSARY.md`, the ADRs in the area you are touching, and the existing seams in the code.

If there is no spec, tell the user to run `/to-spec` first. Do not reconstruct one.

## Process

### 1. Read, and inherit

Read the spec in full — Problem Statement, Solution, User Stories, Implementation Decisions, Out of Scope, Further Notes.

List what is already decided upstream — the spec's Implementation Decisions, ADRs, resolved design tickets — and do not re-litigate it. In the contract, inherited decisions are facts, not questions.

### 2. Draft the promises

Distill the User Stories into **promises**: one observable result per line, deduplicated across stories. A promise is not a story — N stories may collapse into M promises.

For each promise record: the promise itself, its coverage, its source, the seam it is observed at, and — later, filled in by `/to-tickets` — what delivers it.

- **Expected outcomes come from the promise, never from the implementation.** A value recomputed the way the code computes it is tautological and proves nothing; expected values are independent literals, worked examples, or the spec itself.
- **Traverse past the literal spec.** Use known system symmetry and relevant dependencies to draft implied promises; the full six-surface check belongs to the boundary-review gate. Mark anything the spec did not say as `inferred`. Classify each inference: required to fulfill an existing promise, an internal implementation choice, or a new behavior or trade-off requiring approval. Draft the full promise list for the contract; bring only decision-relevant findings to the human gates.
- **Status is derived, not stored.** A promise is done when its delivering work is complete and all required checks pass, including user confirmation of any human-led coverage. Automated execution may finish while acceptance remains pending. Never hand-maintain a status column; generate a checklist from the contract and the tracker when the human asks for one.

### 3. Sketch the test seams

Sketch where the feature's promises will be tested. The main agent uses inherited codebase understanding and targeted inspection of relevant interfaces and existing tests. Investigate a missing fact only when it changes the sketch.

Prefer existing seams, taking the **highest** seam that carries the promise. Fewer seams is better; the ideal number is one. The observation must distinguish a plausible violation: a rendered value alone may not carry an independently specified data caliber or failure mechanism. Keep separate observations where those promises require different evidence.

If existing seams are insufficient, propose a new seam at the highest point that carries the uncovered promise, naming what actually varies across it. New functionality or additional test cases can use existing seams; they do not by themselves require a new interface.

The sketch is ready when every draft promise has an observation at a relevant seam, with evidence for reused interfaces and a concrete gap for any proposed addition or change. Present it at the first gate; complete the boundary check at the second.

Never list private modules, file paths, or internal helpers in the contract. Those are internal seams, and they are the agent's business, not the contract's.

**Seams are hypotheses.** When implementation disproves one, change the contract, and take it to an ADR if it is hard to reverse; keep code and contract from drifting silently.

### 4. Propose, then ask for what only the human knows

Run seam selection, boundary review, and acceptance-mode selection as sequential decision gates. Each message or question-tool call requests a decision for the current gate only. Stop and wait for the user's response; incorporate it before opening the next gate.

Count only explicit confirmation of the decision presented as approval. Unanswered decisions remain pending. Hold any later-stage choice offered early as provisional until its prerequisites are confirmed and the choice still applies.

#### Seam selection

Present a concise **recommended sketch**: which existing seams to reuse, the key promises observed there, and any necessary additions or changes. Offer an alternative only for a material trade-off, with its reversibility and your recommendation. Keep the full draft promise list for the contract and show it on request.

If a concrete gap requires substantial module-interface design or redesign, explain the gap and the impact on existing callers and tests, then ask whether to enter that design work. After explicit user approval, use codebase-design's design-it-twice pattern for alternative interfaces. Routine seam reuse and simple additions stay with the main agent's sketch; internal construction stays with the build.

This gate is complete when the user selects or approves a seam proposal. Use that selection—not an unapproved recommendation—to review the boundary findings in the next gate.

#### Boundary review

Walk the six surfaces against the selected seams and the full promise set — **entry** (CLI / API / UI / library), **data and state** (schema, files, config), **external dependencies** (third party, time, randomness, filesystem), **errors and failure** (error types, exit codes, timeouts, retries), **output and observability** (stdout, reports, logs, metrics), and **resources and concurrency** (ownership, resource bounds, cost envelope — usually attached to another seam rather than its own row). Account for applicable guarantees, inferred gaps, and why any remaining surface does not apply. This check stays internal; retain it for the final coverage report and on request.

Present only the **boundary findings** that affect approved guarantees or need human judgment: newly inferred guarantees needed to fulfill existing promises, conflicts with inherited decisions, and unresolved choices that would change behavior, scope, or a material trade-off. Incorporate implications required by existing approved promises without offering alternatives or requesting a separate approval; mention them briefly as findings. An approved seam's low reversibility alone does not turn such an implication into a new decision. Leave internal implementation choices with the build and out of the boundary-review message. Escalate only a new behavior, an inherited conflict, or a material trade-off. For each choice requiring human judgment, give the concrete scenario, consequence, alternatives where relevant, and your recommendation. If no such choice remains, say so. Offer the full promise list and surface walk on request; the boundary-review message contains findings rather than a per-surface report or a second guarantee list.

Add a **trade-off note** only for a material future cost: the selected choice, the change that would force rework, what would be affected, and your recommendation. Use known evolution plans; ask about unknown plans only when the answer changes the choice. Obtain explicit approval for new high-impact trade-offs and resolve conflicts with the spec rather than silently changing scope.

Ask the human to approve the identified choices or correct a specific finding; invite additional hard constraints as an optional prompt, not as the coverage check. This gate is complete when each approval-blocking choice is resolved and the human confirms the resulting direction. Put deferred unknowns in *Not yet specified*. If a correction invalidates the selected seam, return to seam selection and review the findings again.

#### Acceptance mode

Ask the user to choose:

- **Full automation** — the agent owns implementation, TDD, and the agreed acceptance checks, including real-world verification where required. Difficult verification may take more time and tokens. Genuine blockers or missing evidence are reported, not converted into a passing result.
- **Rapid iteration** — the agent owns implementation, TDD, and most verification. Propose a small set of expensive or judgment-sensitive checks for human-led acceptance after all automated work finishes.

For rapid iteration, identify the specific coverage items, why autonomous verification may be costly or misdirected, and what evidence the agent should prepare. The user approves, changes, or rejects the exceptions; none is a valid outcome. Reserve only the judgment that needs a human, keeping implementation and useful automated checks with the agent. The user evaluates results and guides revisions; the agent prepares evidence, adjusts, repairs, and rechecks.

Both modes preserve the promises and quality constraints; they allocate verification responsibility, not permission to omit behavior or break compatibility. Use the confirmed boundary findings to propose the acceptance mode and any human-led exceptions. This gate is complete when the user approves the mode and the specific exceptions, if any. Record the contract as approved only when all three gates are complete.

### 5. Record the decision

Record what was decided, which alternatives were rejected, and why. A rejection without a reason gets re-proposed in six months.

When a decision is hard to reverse, surprising without context, and the result of a real trade-off, offer an ADR: call the Skill tool with "domain-modeling".

### 6. Write the contract

The contract is not a plan: it says what is promised and where it is observable, never in what order to build. Write it to `.scratch/<feature-slug>/contract.md` (or beside wherever this repo keeps per-feature scratch), and link it from the spec issue. Template:

<contract-template>

# Contract — <feature>

Source: <spec link or issue reference>
Acceptance mode: Full automation | Rapid iteration

## Promises

| #   | Promise (one observable result) | Coverage | Source             | Seam |
| --- | ------------------------------- | -------- | ------------------ | ---- |
| P1  |                                 |          | story 4 / inferred |      |

## Seam decisions

| Seam | Exposes | Hides | Alternatives considered | Reversibility |
| ---- | ------- | ----- | ----------------------- | ------------- |
|      |         |       |                         |               |

## Not yet specified

<!-- seams you can see coming but cannot state precisely yet. Do not pre-slice. -->

## Out of scope

<!-- inherited from the spec; the contract never adds to it -->

</contract-template>

Record the chosen mode. For each human-led exception, use the existing **Coverage** cell to identify the reserved check and the evidence the agent must prepare; keep the promise and implementation scope intact. These assignments belong with the coverage so they can travel into ticket acceptance criteria. No separate exception ledger is needed.

When exceptions exist, include this instruction in the contract: **“Complete implementation and all assigned automated checks before the human-led acceptance round. Planned human-led checks do not pause otherwise executable work. At the final handoff, report the remaining checks together with their prepared evidence; they remain unverified until the user confirms them. Report genuine blockers when encountered.”**

One fact, one home: the spec owns the narrative and the scope; the contract owns the promises and the seams; the tickets own the slices. Reference the spec and the stories by link and number; never copy them in.

### 7. Report coverage

Close with checks, not prose:

- every promise maps to at least one seam — list any exception;
- every seam carries at least one promise — list any exception;
- all six surfaces walked in the boundary review — say which were not relevant, and why;
- what remains in **Not yet specified**, distinguishing deferred items from decisions blocking approval;
- the acceptance mode and human-led coverage references, or **none**.

## What comes next

Tell the user to run `/to-tickets .scratch/<feature-slug>/contract.md`. The contract's source and seam table are what make the tickets' acceptance criteria and blocking edges honest.

When the work later disproves a seam or a promise, revise the contract first, then re-open the affected tickets — never the other way round.
