---
name: lighthouse
description: "Produce a lighthouse document from a resolved wayfinder ticket: decision, user stories, preconditions, postconditions, and invariants, so that backtracer can trace signals across the map. Use after a wayfinder ticket is resolved."
---

After a wayfinder ticket is resolved (the decision is made), create a lighthouse document from the decision ticket body and the grilling conversation. A lighthouse document is the single source of truth for what was decided, why, and what it constrains. Backtracer traces the "so that" clauses and pattern statements in this document across the map to surface gaps.

Do NOT interview the user. Just synthesize what you already know from the decision ticket and the conversation. The decision has been made; your job is to capture it, not to reopen it.

## Process

### 1. Read the decision ticket

Read the decision ticket body. It holds the original question, plus whatever constraints and issues to decide the session recorded. Carry all of it forward verbatim into the lighthouse document; this is the permanent record of what was asked. The ticket body has no fixed section format, so read whatever is there.

### 2. Read the conversation

Read the grilling conversation. Extract the key conclusions for each issue discussed: what was decided, why, and what alternatives were rejected. Write these as the `## Discussion` section, with one subsection per issue.

### 3. Produce the lighthouse document

Write the document to `lighthouse/<NN>-<slug>.md`. Use this template:

<lighthouse-template>

# NN: <title>: Lighthouse

> Question and discussion: [NN: <title>](../decision/NN-<slug>.md)

## Question

<The original question, carried from the decision ticket body.>

## Discussion

<Extracted from the grilling conversation: one subsection per issue.>

### Topic 1

<Outcome: what was chosen, why, and what was rejected.>

### Topic 2

<Outcome>

---

## Decision

<One or two sentences: what was decided. The one-line gist for the map's Decisions-so-far.>

## User stories

A numbered list of user stories in to-spec format:

1. As a <actor>, I want a <feature>, so that <benefit>
2. As a <actor>, I want a <feature>, so that <benefit>

Capture every need and design preference that surfaced during the discussion: not just user-facing features, but also developer constraints and design intents. The "so that" clause is the signal backtracer traces.

## Preconditions

- <What must already be true for this decision to hold? What does this decision depend on? Data? Other tickets? Existing modules?>
- <List every dependency. If this decision can't be acted on until another ticket is resolved, name it.>

## Postconditions

- <What does this decision guarantee? What constraints does it place on other tickets?>
- <List every guarantee. These are the promises downstream tickets can rely on.>

## Invariants

- <What never changes? Patterns that must be preserved?>
- <What existing modules or conventions does this align with?>
- <Be specific about pattern alignment. Name the existing module. Backtracer uses these statements to check peer symmetry.>

</lighthouse-template>

### 4. Confirm and post

Present the draft to the user. Ask: "Does this capture the decision correctly? Any missing user stories or invariants?" Iterate until confirmed.

Once confirmed, the document is ready. The calling skill (typically wayfinder) writes it to `lighthouse/`, closes the decision ticket, and updates the map.
