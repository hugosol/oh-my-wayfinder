---
name: distill-dialogue
description: Compress the current conversation into a proposition-anchored landing draft (Markdown), for a separate session to integrate into course documents.
disable-model-invocation: true
---

# Distill Dialogue

Turn what a conversation produced into a **landing draft**: a Markdown write-up that a session without this conversation's context can integrate into course documents.

Distillation and delivery only. **Delivering the draft completes this skill** — do not open, generate, modify or verify any HTML. To change a document inside this same conversation, use the workspace's own flow instead.

The draft is written in the language of the source discussion; code, identifiers and official terminology stay as they are.

## Loads

Read [HANDOFF-FORMAT.md](HANDOFF-FORMAT.md) (in this skill's directory) before writing. It defines the fields a landing draft carries, the process rules it must hold to, and the obligations the integrating session will be checked against.

## 1. Fix the target and the source range

- Confirm the target document or topic, and the source range (turns or messages).
- Distillation runs in the same session as the discussion: work from the conversation in front of you.
- The integrating session owns the target document — its rules and its placement decisions; the draft needs only its name.

Done when: the target and the source range are written down.

## 2. Narrow first — the one interaction

- Build the **screening index**: one line per candidate — what it concludes and where it came from (turn or message).
- Present the index together with a candidate **proposition** (one line), then wait. The user selects from the index and fixes the proposition in that reply; the proposition must grow from the material, phrased in the material's own terms.
- When the proposition and the selection do not fit each other, say so in the same turn and offer: rewrite the proposition / split the batch / demote the off-axis item to an appendix or its own batch. **The user decides what leaves the batch.**
- Scan beyond the direct answers: the material that made an answer hold — criteria, contrasts, official examples, boundary counterexamples, error diagnostics, the user's own corrections — is usually more durable than the conclusion.

Done when: the selection, the proposition and the source range are written down.

## 3. Compress from the original

- Locate each selected item in the exchange and work from the exchange itself, not from a recap: a recap yields the average of the discussion and flattens its peaks.
- Take the claim **and** what makes it hold: prerequisites, reasoning chains, criteria, contrasts, examples, counterexamples, code, error diagnostics.
- Keep original wording, code and examples; keep the user's own extended reasoning in full, in its original wording.
- Material comes from the source. A topic the conversation does not carry is a gap. A selected item you cannot reach becomes a coverage-list row marked **not written**, and a line in the draft's Gaps so the integrating session knows what is missing.

Done when: every selected item has its material in hand, or a reason why it cannot.

## 4. Write around the proposition

- The proposition sets the order, the skeleton, which item carries the through-line, and how far each item is compressed — paragraph → one line → table row → note → on-demand section. Membership was decided at selection.
- Write one tutorial with a skeleton: ordered, not a pile of items. Fill adjacent gaps as **inference**, deduplicate, check consistency, and distinguish verified from unverified.
- Compression merges and shortens; every condition, boundary and counterexample stays attached to its claim, at its original scope.
- Order the draft for reading; where each part lands in the document belongs to the integrating session.

Done when: the draft reads on its own.

## 5. Check both directions

- Forward: walk the index item by item and name the passage that carries it. An item you cannot name becomes a coverage-list row marked **not written**, with its reason.
- Backward: every line of the draft traces to source material, or carries an explicit inference — adjacent-gap additions included.
- Re-check by name: conditions, unique counterexamples, corrections of existing text, the user's own reasoning, open questions.

Done when: every selected item is written into a passage or marked not written on the coverage list with its reason, and no line floats free of the source.

## 6. Save and report

- Save where the user says. With no preference, `.tmp/handoff-<target-or-topic>.md` in the workspace; if the workspace names its own location for such material, use that.
- Report **in the conversation** the **coverage list** — one line per selected item: conclusion + provenance + written into §N, or not written (reason) — plus the proposition, the gaps, and the draft's path. The user may ask to add material on the spot; add it, update the draft, and report the coverage list again.
- Stop here: the draft is the deliverable.

Done when: the draft is saved and the coverage list is reported.
