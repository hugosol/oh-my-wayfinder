---
name: distill-dialogue
description: Extract the valuable material from the current conversation into a one-off handoff package (Markdown), for a separate session to integrate into course documents.
disable-model-invocation: true
---

# Distill Dialogue

Turn what a conversation produced into a **handoff package**: a Markdown file that a session without this conversation's context can integrate into course documents.

Extraction and delivery only. **Delivering the package completes this skill** — do not open, generate, modify or verify any HTML. To change a document inside this same conversation, use the workspace's own flow instead.

The package is written in the language of the source discussion; code, identifiers and official terminology stay as they are.

## Loads

Read [HANDOFF-FORMAT.md](HANDOFF-FORMAT.md) (in this skill's directory) before extracting. It defines the unit fields, the fidelity rules and the must-land contract this package will be checked against.

## 1. Fix the scope

- Explicit instruction (topics, turns or messages named): go to step 2.
- Vague instruction ("save what's valuable"): offer candidates first — one line each: topic, where it came from, why it is worth keeping. Wait for the selection; do not draft candidates into prose.
- Scan beyond the direct answers. The material that made an answer hold — criteria, contrasts, official examples, boundary counterexamples, error diagnostics, the user's own corrections — is usually more durable than the conclusion.

Done when: the selected topics and their range (turns or messages) are written down.

## 2. Re-read the source

- Locate each selected topic in the original exchange. Work from the exchange, not from a summary of it.
- Material comes from the source. A topic that cannot be located becomes a gap (step 5) — never reconstruct it.
- Pull in unselected support material only when it appears in the exchange and the selected topic cannot be understood without it. A topic that could stand on its own is a new candidate to offer, not an automatic addition.

Done when: every selected topic points at its source location.

## 3. Extract the material

- Take the claim **and** what makes it hold: prerequisites, reasoning chains, criteria, contrasts, examples, counterexamples, code, error diagnostics, diagram relationships.
- Compress repeated expression; never merge evidence that plays a different role; never compress reasoning into a formula.
- Keep the user's own extended reasoning in full, in its original wording.
- Keep original wording and code; do not polish.

Done when: every selected topic carries its supporting material.

## 4. Make it self-contained

- Write out every "here", "the previous case", "this snippet" into what it actually refers to.
- Add the types, inputs, conditions and definitions a reader needs to follow the examples.
- Additions clarify; they never change meaning. What the source cannot confirm is an inference or a gap, never a silent patch.

Done when: the package reads without the source conversation.

## 5. Mark status and gaps

- Per unit: claim and conditions, supporting material, provenance (a recognizable short quote), status (original / paraphrase / inference / corrected / open), verification (what was checked, under which conditions, with what result — an earlier check is not a fresh one).
- Mark the **must-land** items: unique reasoning, conditions and boundaries, counterexamples, corrections, open questions.
- Material known to exist but out of reach (compacted context, unavailable turns): list it as a gap, naming what is missing.

Done when: every unit has its fidelity fields, and gaps stand on their own.

## 6. Check both directions

- Forward: walk the selected topics and ask what did not make it into the package; check that support material was not over-compressed.
- Backward: walk every line of the package and ask where it came from; nothing may exceed or float free of the source.
- Re-check by name: conditions, unique counterexamples, the user's own reasoning, corrected statements, open questions.

Done when: no selected material is missing, and no package content is unsourced.

## 7. Save and stop

- Save where the user says. With no preference, `.tmp/handoff-<target-or-topic>.md` in the workspace (the target document may not be known yet — the topic serves), creating the directory if needed; if the workspace names its own location for such material, use that.
- Report: the package's location, the unit list (number and topic), the must-land count, and the gaps.
- Stop. No HTML work of any kind.

Done when: the package is delivered — written to that file, or shown inline when the user asked for that — and a session holding only it can start integrating.

## Anti-patterns

- **"Summarize the conversation" as a cold start** — that yields the average of the discussion and flattens its peaks.
- **Deciding alone what matters** — offer candidates; the selection is the user's.
- **Writing a finished tutorial, or locking the final section structure** — organization belongs to the integrating session, and writing prose early is where material dies.
- **Dropping the awkward material** so the package reads smoothly.
- **Filling gaps from memory.**
