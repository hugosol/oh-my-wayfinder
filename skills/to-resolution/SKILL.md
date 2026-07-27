---
name: to-resolution
description: Distill a resolved wayfinder ticket into a structured resolution — user stories with "so that" clauses, preconditions, postconditions, and invariants — so that backtracer can trace signals across the map. Use after a grilling, research, or task session, or manually when a resolution needs to be formalised.
---

After a wayfinder ticket is resolved — the decision is made — distill the conversation into a structured resolution. Backtracer traces the "so that" clauses and pattern statements in this resolution across the map to surface gaps. The resolution is also the single source of truth for what was decided, why, and what it constrains.

Do NOT interview the user — just synthesize what you already know from the conversation. The decision has been made; your job is to capture it, not to reopen it.

## Process

### 1. Verify the ticket is resolved

The ticket must already be resolved — the decision is made. If the ticket is still open or the decision is unsettled, stop. to-resolution records decisions, it doesn't make them.

### 2. Distill the resolution

Produce the resolution using this template:

<resolution-template>

## Decision

<One or two sentences: what was decided. This is the one-line gist for the map's Decisions-so-far.>

## User Stories

A LONG, numbered list of user stories. Each story in to-spec format:

1. As a <actor>, I want a <feature>, so that <benefit>
2. As a <actor>, I want a <feature>, so that <benefit>

This list should be extremely extensive. Capture every need and design preference that surfaced during grilling — not just the user-facing features, but also the developer constraints and design intents. The "so that" clause is the signal backtracer traces.

Example:
1. As a developer, I want the daily engine's run() to internally split into setup()
   and _process_day(), so that the 5-minute engine can reuse setup() and control
   its own loop.
2. As a quantitative researcher, I want the return contract of run() to remain
   completely unchanged, so that existing callers (CLI, scan, tests) need no changes.

## Preconditions

- <What must already be true for this decision to hold?>
- <What does this decision depend on? Data? Other tickets? Existing modules?>

List every dependency. If this decision can't be acted on until another ticket is resolved, name it.

## Postconditions

- <What does this decision guarantee?>
- <What constraints does it place on other tickets?>

List every guarantee. These are the promises downstream tickets can rely on.

## Invariants

- <What never changes? Patterns that must be preserved?>
- <What existing modules or conventions does this align with?>

Be specific about pattern alignment. "New engine types follow the same conventions as the daily engine" is good — name the existing module explicitly. Backtracer uses these statements to check peer symmetry.

</resolution-template>

### 3. Confirm and post

Present the draft resolution to the user. Ask: "Does this capture the decision correctly? Any missing user stories or invariants?" Iterate until confirmed.

Once confirmed, the resolution is ready to be posted as a comment on the ticket. The calling skill (typically wayfinder) handles posting, closing the ticket, and updating the map.
