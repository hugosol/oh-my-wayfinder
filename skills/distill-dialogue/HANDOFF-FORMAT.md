# Handoff package format

The contract between `distill-dialogue` (producer) and `integrate-lesson` (consumer). Both skills read this file when they run; it is the one shared definition of what a handoff package holds and what it owes.

## What it is

- **One-off handoff material**, not documentation. It carries a batch of material extracted from a conversation to a session that cannot see that conversation.
- The course documents remain the single source of truth. Nothing syncs back from the documents into the package.
- It must be **self-contained**: material, constraints, provenance and gaps all travel with it.
- Once the material has landed and the user confirms — with nothing left unresolved or unclaimed — the package is deleted.

## Material units

A package is a numbered list of **material units** (`Unit 1`, `Unit 2`, …). Each unit carries:

| Field | Content |
|---|---|
| Topic and why it is kept | The selection the user made, or the scope the user delegated |
| Claim and conditions | The conclusion **and** the conditions, boundaries and counterexamples under which it holds |
| Supporting material | What makes the claim hold — reasoning, criteria, contrasts, examples, counterexamples, code, error diagnostics — in its original wording |
| Provenance | A recognizable source: a short quote from the original exchange, located as precisely as the source allows (turn or message ids when they exist, otherwise the speaker and the exchange). Never a reference only the original session could resolve |
| Status | Original / paraphrase / inference / corrected / open — marked per item where they differ — plus verification (what was checked, under which conditions, with what result) |
| Must-land list | The items from this unit that must land in the final document (see below) |
| Gaps | Material known to exist but unrecoverable; name what is missing |

Compose the fields as the material dictates. **Claim and conditions, supporting material, provenance, status, and the must-land list are never omitted.**

## Fidelity rules

- **Material over conclusions.** Keep what makes the claim hold, not the claim sentence alone.
- Compress repeated expression; never merge evidence that plays a different role.
- **Never widen a claim.** Conditions, boundaries and counterexamples travel with it.
- **Resolve deixis.** "Here", "the previous case", "this snippet" get written out; a reader without the source conversation has to be able to follow.
- **Keep the user's own extended reasoning verbatim**, never compressed into a formula.
- Separate original text, paraphrase, inference, correction and open questions. Inference is never presented as fact; an earlier verification is never presented as a fresh one.
- **Gaps stay gaps.** Never invent text to fill one.

## Must-land list

The must-land list is what makes the package checkable: every listed item needs a recorded destination, and "the conclusion is already covered" does not discharge it. It governs the material the user selected; it never pulls an unselected topic into the package.

Within a unit, these always count:

- reasoning or criteria that cannot be reconstructed from the conclusion;
- the claim's conditions and boundaries;
- counterexamples, boundary experiments, error diagnostics;
- corrections of existing text, and conflicts with it;
- open questions and unrecovered gaps.

Allowed destinations: **added** (where) / **merged** into existing text (which passage) / **already covered** equivalently (with the evidence) / **unresolved** (why).

## Consumer obligations

`integrate-lesson` owes the package these, and reports against them:

- Enumerate every must-land item before integrating.
- After integrating, record a destination for each one. An existing *equivalent explanation* can be the destination — with evidence — but an existing *conclusion* never covers missing reasoning, conditions or counterexamples.
- On conflict with existing text, check the trusted source; never assume the new material wins. Report what cannot be resolved instead of picking a side silently.
- When fidelity and the document's own organization rules cannot both hold, report the specific conflict and let the user decide. Never drop material to make the page tidy.
- A must-land item left unresolved, or a gap left unclaimed, keeps the package alive until it has a home the user names — write it there before deleting — unless the user, knowing what is lost, says to delete.

## Minimal shape

Adjust to the material; the fidelity fields are never omitted.

```md
# Handoff: <target document or topic> — <date>

## Unit 1 — <topic>
- Kept because: ...
- Claim: ... (holds when: ...)
- Supporting material:
  - reasoning / criteria: ...
  - examples / counterexamples / code: ...
- Provenance: ... (short quote from the original exchange)
- Status: original | paraphrase | inference | corrected | open (verified: ...)
- Must land: the claim; condition X; counterexample Y
- Gaps: ...

## Open and unresolved
- ...
```
