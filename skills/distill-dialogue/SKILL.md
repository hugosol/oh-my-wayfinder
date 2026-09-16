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
- Never open the target document: the document's own rules, and every placement decision in it, belong to the integrating session.

Done when: the target and the source range are written down.

## 2. Narrow first — the one interaction

- Build the **screening index**: one line per candidate — what it concludes and where it came from (turn or message).
- Present the index together with a candidate **proposition** (one line), then wait. The user selects from the index and fixes the proposition in that reply; the proposition must grow from the material — never force a framework onto it.
- When the proposition and the selection do not fit each other, say so in the same turn and offer: rewrite the proposition / split the batch / demote the off-axis item to an appendix or its own batch. **Never drop a selected item on your own.**
- Scan beyond the direct answers: the material that made an answer hold — criteria, contrasts, official examples, boundary counterexamples, error diagnostics, the user's own corrections — is usually more durable than the conclusion.
- For a distillation that spans sessions: save the index to the workspace's own scratch location, `.tmp/distill-<target>.md` by default.

Done when: the selection, the proposition and the source range are written down.

## 3. Compress from the original

- Locate each selected item in the exchange. Work from the exchange, not from a summary of it.
- Take the claim **and** what makes it hold: prerequisites, reasoning chains, criteria, contrasts, examples, counterexamples, code, error diagnostics.
- Keep original wording, code and examples; keep the user's own extended reasoning in full, in its original wording — never compressed into a formula.
- Material comes from the source. A topic that cannot be located is a gap, never a reconstruction. When the original is unreachable, reconstruct from the index and mark the passage **reconstructed (not checked against the original)** — never present it as source-derived.

Done when: every selected item carries its material, or is marked unreachable.

## 4. Write around the proposition

- The proposition **organizes, it never filters**: membership was decided at selection. It sets the order, the skeleton, which item carries the through-line, and how far each item is compressed — paragraph → one line → table row → note → on-demand section.
- Write one tutorial with a skeleton: ordered, not a pile of items. Fill adjacent gaps, deduplicate, check consistency, distinguish verified from unverified.
- Compression may merge and shorten; it may not drop a condition, a boundary or a counterexample, and it may not widen a claim.

Done when: the draft reads on its own, and every selected item is written into it or named for the not-written line.

## 5. Check both directions

- Forward: walk the index item by item and name the passage of the draft that carries it. An item you cannot name goes on the **not-written** line with its reason.
- Backward: every line of the draft traces to source material, to an explicit inference, or to a named adjacent-gap addition.
- Re-check by name: conditions, unique counterexamples, corrections of existing text, the user's own reasoning, open questions.

Done when: every selected item is written into a passage or on the not-written line with its reason, and no line floats free of the source.

## 6. Save and report

- Save where the user says. With no preference, `.tmp/handoff-<target-or-topic>.md` in the workspace; if the workspace names its own location for such material, use that.
- Report **in the conversation** the **coverage list** — one line per selected item: conclusion + provenance + written into §N, or not written (reason) — plus the proposition, the gaps, and the draft's path. The user may ask to add material on the spot; add it, update the draft, and report the coverage list again.
- Stop. No HTML work of any kind.

Done when: the draft is saved and the coverage list is reported.

## Anti-patterns

- **"Summarize the conversation" as a cold start** — that yields the average of the discussion and flattens its peaks.
- **Deciding alone what matters** — offer the index; the selection and the proposition are the user's.
- **Using the proposition as a filter** — it orders and compresses; the selection decides membership.
- **Compressing the user's own extended reasoning into a formula.**
- **Dropping conditions, counterexamples or diagnostics** so the write-up reads smoothly.
- **Locking the final section structure** — the draft is a landing vehicle; placement belongs to the integrating session.
- **Filling gaps from memory.**
