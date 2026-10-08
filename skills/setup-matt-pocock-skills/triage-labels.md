# Triage Labels

This repo uses two distinct ticket systems with separate status vocabularies.

## Decision tickets (wayfinder)

Decision tickets are **planning artifacts** produced by `/wayfinder`. They live in `.scratch/<feature>/decision/`. Each decision ticket asks "what should we decide?" and its lighthouse document records the decision.

| Status | Meaning |
|--------|---------|
| `open` | Not yet claimed by an agent |
| `claimed` | Agent is actively working on this decision |
| `resolved` | Decision or confirmed out-of-scope disposition recorded; production delivery is tracked separately. |

These are the only decision-ticket states. Research and prototype code may be evidence; `resolved` makes no claim about production delivery and stays unchanged when implementation finishes. For an out-of-scope disposition, follow wayfinder’s Out of scope procedure, including dependency review.

## Implementation tickets (to-tickets)

Implementation tickets are produced by `/to-tickets`. They live in `.scratch/<feature>/implementation/`. Each implementation ticket is a tracer-bullet vertical slice that delivers working, testable behaviour.

| Status | Meaning |
|--------|---------|
| `ready-for-agent` | Fully specified, ready for an AFK agent to implement |
| `ready-for-human` | Requires human implementation |
| `in-progress` | Agent is actively implementing |
| `closed` | Code implemented, tested, and merged |

### Implementation-only triage

| Status | Meaning |
|--------|---------|
| `needs-triage` | Maintainer needs to evaluate this item |
| `needs-info` | Waiting on reporter for more information |
| `wontfix` | Will not be actioned |

---

When a skill mentions a triage role (e.g. "apply the AFK-ready triage label"), use the implementation-ticket vocabulary above. Triage labels do not apply to decision tickets or their map.
