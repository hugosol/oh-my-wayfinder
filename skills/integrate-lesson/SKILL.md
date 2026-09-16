---
name: integrate-lesson
description: Integrate a landing draft (Markdown) into course HTML in a separate session — read the workspace rules and the document, place every section at its destination, merge or correct, verify, then report where each section landed.
disable-model-invocation: true
---

# Integrate Lesson

Integrate a **landing draft** produced by `distill-dialogue` into course documents. You do not inherit the source conversation; the draft carries the material.

This skill adds a path; it does not replace the workspace's own flows. Lessons are still prepared, taught and completed by the local rules — this skill only lands one batch of material when invoked.

## Loads

Read [HANDOFF-FORMAT.md](../distill-dialogue/HANDOFF-FORMAT.md) (in the sibling `distill-dialogue` skill's directory) and apply its consumer obligations here: land every section at its destination, report every deviation, keep conditions and counterexamples intact, and surface fidelity-versus-organization conflicts instead of dropping material. Fidelity is enforced in this session — the producing session cannot carry it for you.

## 1. Load the draft

- Read the draft the user names. With no name, find `.tmp/handoff-*.md`; if several exist, ask which one.
- List every section with its destination, its source status and the gaps.
- Missing fields, or a section without a destination: report it. Do not fill them in yourself.

Done when: the section list, destinations, statuses and gaps are written down.

## 2. Find the workspace rules and the target

- Locate the workspace's rule entry points by reading the workspace itself — teaching rules, lesson skeleton, document formats, verification standards, directory conventions. Assume no filenames.
- Take only the clauses this integration needs: document organization, definitions and terminology, progressive-disclosure sections, links and anchors, verification.
- Do not re-run the prepare / teach / complete flows.
- The target document comes from the user, or from the draft's target read together with the workspace rules. When they disagree, or are missing, ask.

Done when: the target file and the applicable local clauses are written down.

## 3. Read the document as a whole

- Read the target document's overall structure first — section order, the main line versus on-demand sections, definitions already given — then the passages around each section's topic.
- Give every section a tentative destination: add / merge into an existing passage / already covered / conflicts with existing text / undecided.
- Check the companion pages the local rules maintain (reference sheet, review page, glossary) and decide which this batch actually touches.
- Destinations follow the document's logic and flow — never the draft's order, never the spot where the question happened to be asked.

Done when: every section has a tentative destination, or is marked for the user to decide.

## 4. Integrate

- Place each section at its destination, keeping the document's existing narrative. Merge duplicate statements; correct text that is imprecise or contradicts the trusted source; keep terminology, anchors and links consistent. Rewriting for fit is expected; weakening a condition, boundary or counterexample is not.
- A section marked **reconstructed (not checked against the original)** is re-verified against a trusted source before it joins the main line. If it cannot be verified, keep it out of the main line and report it.
- A changed destination, or a conflict with existing text: check the trusted source, never assume the draft wins, and report it. Never pick a side silently; never drop material to make the page tidy.
- When the draft and the document's organization rules cannot both hold, report the specific conflict and let the user decide.
- Touch the target document and the companion pages the local rules maintain and this batch actually affects. Do not rewrite the course.
- A document update is not evidence that the learner mastered anything.

Done when: every section is placed or marked unresolved, and every deviation is recorded.

## 5. Verify

- Run the checks the local rules require: compile or run the executable examples, open the pages, check links, anchors, terminology, layout.
- Record the environment (versions) and the results. Mark what could not be run **unverified**, with the reason.
- Verify what this integration touched, not the whole course.

Done when: every required check has a result, or an explicit unverified note with its reason.

## 6. Report destinations, then wait

- Report per section: added (where) / merged (into which passage) / already covered (evidence) / unresolved (why) — plus destination changes, conflicts, reconstructed sections kept out of the main line, and unverified items.
- Report at the level of conditions, boundaries and counterexamples — not just topics.
- Keep the draft until the user confirms; delete it only after confirmation. Partial integration, blocked verification, a section left unresolved, or an unclaimed gap: keep it and say so — deleting would erase the only record. Only the user can waive this, knowingly.

Done when: every section has a reported landing, and the user has decided the draft's fate.

## Anti-patterns

- Appending material at the end without reading the document's structure.
- Carrying conclusions while dropping the conditions, boundaries or counterexamples that make them hold.
- Letting a reconstructed (not checked against the original) section into the main line unverified.
- Rewriting existing text beyond this batch to make the page read smoothly.
- Treating the draft as a second source of truth, or syncing changes back into it.
- Quietly resolving conflicts or destination changes.
- Reporting "done" without the per-section landings.
