# Spec-to-Code

The OMP-only `/spec-to-code` workflow: turn an approved spec into implementation tickets, then execute them with serial TDD subagents. It shares its vocabulary with the planning pipeline that feeds it (`wayfinder` → `to-spec` → `to-contract` → `to-tickets`).

## Language

**Implementation ticket**:
A tracer-bullet vertical slice cut from an approved contract; the unit phase 2 implements, one independent agent run per ticket.
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
Execute the published tickets in dependency order, one TDD subagent per ticket.

**Jev mode**:
Turn-reply selection delegated to the judge chain instead of the built-in canned sequence. Off by default; the canned sequence is the deterministic alternative.
_Avoid_: judge mode
