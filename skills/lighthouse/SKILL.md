---
name: lighthouse
description: "Distill confirmed Wayfinder decisions and approved changes into Lighthouse documents, including partial results from tickets that remain open."
---

Capture confirmed results at a Wayfinder pause or completion. A lighthouse document is the single source of truth for what was decided, why, and what it constrains; its source ticket may still be unfinished. Backtracer traces these results across the map for gaps and conflicts.

Synthesize choices and constraints explicitly confirmed by the user. Decision-relevant background and preferences explain the rationale; they do not create additional approved behavior or guarantees. Candidates and unanswered proposals remain in the ticket; clarify ambiguous summaries only.

## Process

### 1. Read the decision ticket

Read the question, saved discussion/handoff, existing Lighthouse, and the caller's confirmed changes. Summarize the question and link its source; the ticket retains the compact exploration record, rather than copying its entire body here. If there are no new confirmed results, retain the existing document and return without creating an empty decision.

### 2. Read the conversation

Extract confirmed conclusions, their scope and conditions, the user's decision-relevant reasons, and rejected alternatives with their reasons and reconsideration conditions. Keep related evidence and its limits distinct from choices. Write or update one `## Discussion` subsection per topic; unexplored questions are not conclusions.

### 3. Produce the lighthouse document

Create or update `lighthouse/<NN>-<slug>.md` by topic using this template. For partial results, state the confirmed scope and that the ticket remains unfinished. Preserve still-applicable results and reconcile Decision, stories, and conditions with each update. For an approved change to an existing conclusion, update its original authoritative document with a brief old-to-new reason and confirmation source; a different ticket records the change and links that authority instead of publishing an opposing answer.

<lighthouse-template>

# NN: <title>: Lighthouse

> Question and discussion: [NN: <title>](../decision/NN-<slug>.md)

## Question

<Brief question and scope; link the source ticket for its discussion and handoff.>

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

Capture confirmed needs and approved design intents, including developer constraints, within their actual scope. The "so that" clause is the signal backtracer traces.

## Preconditions

- <What must already be true for this decision to hold? What does this decision depend on? Data? Other tickets? Existing modules?>
- <Name the concrete facts or decisions needed; a confirmed design does not prove those capabilities are implemented.>

## Postconditions

- <What does this decision guarantee? What constraints does it place on other tickets?>
- <List guarantees of the approved design, not unapproved preferences or claims of completed implementation.>

## Invariants

- <What never changes? Patterns that must be preserved?>
- <What existing modules or conventions does this align with?>
- <Be specific about pattern alignment. Name the existing module. Backtracer uses these statements to check peer symmetry.>

</lighthouse-template>

### 4. Confirm and post

Show only summaries whose meaning needs clarification or confirmation; an explicit user choice does not need whole-document reapproval. The caller writes the confirmed update and reconciles the map index. Publishing leaves claim and ticket completion to Wayfinder.

Complete when the confirmed results, reasons, conditions, and sources are consistent, partial scope is clear, and no unanswered proposal has become a decision.
