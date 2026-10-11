# Allow explicitly confirmed cross-ticket partial publication

A Wayfinder discussion can answer a question owned by another unfinished decision ticket before that ticket has been grilled: the observation-contract session behind `ticket 03 c1` confirmed a clear-command condition and created `lighthouse/07-command-state.md` without starting the command ticket. We accept partial publication without a ticket switch when the user explicitly confirms the decision content and its owner, identified by the ticket filename; publication still waits for the existing boundary. This makes the cross-ticket consequence visible while avoiding a procedural detour solely to preserve an already-confirmed choice.

Accepted on 2026-10-11. The user requested a two-item confirmation prompt—decision content and target ticket—and specifically chose filenames rather than translated ticket titles.

## Considered Options

- **Require a Pause detour and target-ticket claim for every cross-ticket answer.** Retained for further work on the target, but not required merely to publish an explicitly authorized partial result.
- **Create consumer Lighthouse documents automatically to propagate upstream impact.** Rejected: dependency consumption is not a new decision, and automatic publication hides the decision's ownership from the user. Consumers read the existing authority when they start or resume.
- **Add a paused decision-ticket status to distinguish prior discussion.** Not adopted: discussion history and recovery context do not grant publication authority. The existing lifecycle remains unchanged.
- **Keep the decision in both source and target Lighthouses.** Rejected: one policy needs one authority; the working ticket links the owning Lighthouse.

## Consequences

The exception authorizes a scoped Lighthouse result, not the start or completion of the target ticket. Target-ticket body and claim remain intact; another session's claim requires coordination. Revising an existing policy still requires an explicit old-to-new ruling, rather than treating a pause or a new suggestion as revision approval. Backtracer retains its existing gap-question-only downstream write boundary.

The operative rule is [Cross-ticket confirmation](../../skills/wayfinder/SKILL.md#cross-ticket-confirmation); this ADR records its rationale, not a second procedure. The confirmation prompt uses the decision-ticket filename, while the published artifact is the corresponding Lighthouse.

## Change Sources and Verification

- [Wayfinder mappings](../../deltas/mappings/wayfinder.md): added `cross-ticket-confirmation`, `cross-ticket-filename` and `cross-ticket-claim-exception`; adjusted `grilling-frontier-refresh`. `skills/wayfinder/SKILL.md` is generated from these mappings, not maintained by hand.
- [Lighthouse](../../skills/lighthouse/SKILL.md): its hand-maintained source links the cross-ticket authorization gate.
- [English](../../README.md) and [Chinese](../../README.cn.md) maintenance notes point to the rule and its mapping owners. Backtracer was unchanged.
- The initial edit affected only installed OMP skills. The omission was corrected in the project authority before this record was written; installing from the project now preserves the change.
- `node deltas/build.mjs` completed with zero warnings and refreshed the preview. `node deltas/build.mjs --check` verified all 17 generated files. Project and installed OMP `wayfinder`, `lighthouse` and `backtracer` skill files matched byte for byte.
- A stateless model exercise covered unconfirmed choices, confirmed choices before a boundary, partial publication on pause, existing-policy conflicts, another session's claim and mere downstream impact. This was a prompt-level smoke exercise, not a live end-to-end Wayfinder session.
