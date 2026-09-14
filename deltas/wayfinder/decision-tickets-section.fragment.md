## Decision tickets vs task tickets

This map produces **decision tickets**: planning artifacts that capture decisions. Each asks "what should we decide?" Decision tickets live in `.scratch/<feature>/decision/` and use the Decision ticket status vocabulary (`open` → `claimed` → `resolved`).

A `resolved` decision ticket means the decision is locked. **NO code has been written.** Implementation is a separate phase.

**Task tickets** are a different artifact, produced later by `/to-tickets` from the to-spec document. They live in `.scratch/<feature>/issues/` and use the Task ticket status vocabulary (`ready-for-agent` → `in-progress` → `closed`). Task tickets are consumed by `/implement`.

| | Decision ticket | Task ticket |
|---|---|---|
| Produced by | `/wayfinder` | `/to-tickets` |
| Directory | `decision/` | `issues/` |
| Question | What should we decide? | What should we build? |
| Statuses | `open` → `claimed` → `resolved` | `ready-for-agent` → `in-progress` → `closed` |
| `resolved` means | Decision locked, no code | N/A; use `closed` |
| `closed` means | N/A; use `resolved` | Code implemented, tested, merged |

NEVER mark a decision ticket with a task ticket status, or vice versa. NEVER assume a resolved decision ticket means code exists.

## Fog of war
