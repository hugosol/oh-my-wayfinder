# Landing draft format

The contract between `distill-dialogue` (producer) and `integrate-lesson` (consumer). Both skills read this file when they run; it is the one shared definition of what a landing draft holds and what it owes.

## What it is

- **A one-off landing draft**, not documentation: a conversation's material, compressed around a proposition, for a session that cannot see that conversation.
- The course documents remain the single source of truth. Nothing syncs back from the documents into the draft.
- It must be **self-contained**: material, provenance, status and gaps all travel with it.
- Once it has landed and the user confirms — nothing left unresolved or unclaimed — the draft is deleted.

## Fields

| Field | Content |
|---|---|
| Proposition | One line, fixed by the user at selection time; it grew from the material |
| Destinations | Per section: where it lands — lesson main line / on-demand section / reference sheet / review page / learning record |
| Write-up | The tutorial: ordered, skeletoned, compressed, in the source discussion's language; conditions, boundaries, counterexamples, code and diagnostics keep their original wording |
| Provenance | Per material: a recognizable short quote, located as precisely as the source allows (turn or message ids when they exist, otherwise the speaker and the exchange) |
| Status | Source: original text / reconstructed (not checked against the original) / inference — plus verification (what was checked, under which conditions, with what result) |
| Gaps and open questions | Material known to exist but unreachable; questions left open |

**Proposition, destinations, write-up and status are never omitted.** Compose the rest as the material dictates.

## Process rules

The producer holds these while writing:

- **The proposition organizes; it never filters.** Membership comes from the user's selection on the screening index. The proposition sets order, skeleton, emphasis and compression level.
- **Everything selected has a landing.** Compression may merge and shorten; a selected item that cannot be written in is named on the coverage list, never silently dropped.
- **Work from the source.** Keep original wording, code and examples; keep the user's own extended reasoning verbatim. Never widen a claim — conditions, boundaries and counterexamples travel with it.
- **Report a bad fit; do not resolve it by deletion.** When the proposition and the selection disagree, offer rewrite / split / demote.
- **Mark reconstructed material.** Text built from the index because the original was unreachable carries the source status *reconstructed (not checked against the original)*; it is not source-derived and does not quietly join a main line.
- **Check both directions.** Forward: every index item named to a passage. Backward: every line traced to the source, to an explicit inference, or to a named adjacent-gap addition.

## Coverage list

Reported **in the conversation**, never stored in the draft: one line per selected item — conclusion + provenance + landing (§N) or not-landed (reason). Reported at delivery, and again whenever the user asks for material to be added.

## Consumer obligations

`integrate-lesson` owes the draft these, and reports against them:

- Enumerate the draft's sections, destinations, statuses and gaps before integrating.
- Land every section at its destination: add, merge into the passage it belongs to, or correct existing text. Rewriting for fit is expected; weakening a condition, boundary or counterexample is not.
- A destination change, or a conflict with existing text, is checked against the trusted source and then **reported** — never resolved silently, and never by dropping material to make the page tidy.
- A section carrying the source status *reconstructed (not checked against the original)* is re-verified before it joins the main line; if it cannot be verified, it stays out of the main line and is reported.
- When the draft and the document's own organization rules cannot both hold, report the specific conflict and let the user decide.
- Report per section: landed (where) / merged (into which passage) / already covered (with evidence) / unresolved (why) — plus destination changes, conflicts, reconstructed sections kept out of the main line, and unverified items.
- Keep the draft until the user confirms; delete it only after confirmation. A section left unresolved keeps the draft alive until the user names a home for it — unless the user, knowing what is lost, says to delete.

## Minimal shape

Adjust to the material; the fields above are never omitted.

```md
# Landing draft: <target document or topic> — <date>
- Proposition: ...
- Source range: ...

## Destinations
- §1 → lesson main line (#anchor, or "new section after §2")
- §2 → reference sheet

## §1 — <topic>
<the write-up>
Provenance: 「short quote」 (turn 12)
Status: original text (verified: ...)

## §2 — <topic>
<the write-up>
Provenance: ... (the turn is unreachable)
Status: reconstructed (not checked against the original)

## Gaps and open questions
- ...
```
