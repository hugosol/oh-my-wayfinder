---
name: integrate-lesson
description: Integrate a handoff package (Markdown) into course HTML in a separate session — read the workspace rules and the document, place, merge or correct material by the document's own logic, verify, then report where every must-land item went.
disable-model-invocation: true
---

# Integrate Lesson

Integrate a **handoff package** produced by `distill-dialogue` into course documents. You do not inherit the source conversation; the package carries the material.

This skill adds a path; it does not replace the workspace's own flows. Lessons are still prepared, taught and completed by the local rules — this skill only lands one batch of material when invoked.

## Loads

Read [HANDOFF-FORMAT.md](../distill-dialogue/HANDOFF-FORMAT.md) (in the sibling `distill-dialogue` skill's directory) and apply its consumer obligations here: enumerate the must-land items, record a destination for each, check conflicts against the trusted source, and surface fidelity-versus-organization conflicts instead of dropping material. Fidelity is enforced in this session — the producing session cannot carry it for you.

## 1. Load the package

- Read the package the user names. With no name, find `.tmp/handoff-*.md`; if several exist, ask which one.
- Enumerate every material unit and every must-land item.
- Missing fidelity fields or a missing must-land list: report it. Do not fill them in yourself.

Done when: the unit list and the must-land list are written down.

## 2. Find the workspace rules and the target

- Locate the workspace's rule entry points by reading the workspace itself — teaching rules, lesson skeleton, document formats, verification standards, directory conventions. Assume no filenames.
- Take only the clauses this integration needs: document organization, definitions and terminology, progressive-disclosure sections, links and anchors, verification.
- Do not re-run the prepare / teach / complete flows.
- The target document comes from the user, or from the package's target hint read together with the workspace rules. When they disagree, or are missing, ask.

Done when: the target file and the applicable local clauses are written down.

## 3. Read the document as a whole

- Read the target document's overall structure first — section order, the main line versus on-demand sections, definitions already given — then the passages around the material's topics.
- Give every unit a tentative destination: add / merge into an existing passage / already covered / conflicts with existing text / undecided.
- Check the companion pages the local rules maintain (reference sheet, review page, glossary) and decide which this batch actually touches.
- Destinations follow the document's logic and flow — never the package's order, never the spot where the question happened to be asked.

Done when: every unit has a tentative destination, or is marked for the user to decide.

## 4. Integrate

- Place material by concept dependency, keeping the document's existing narrative. Merge duplicate statements; correct text that is imprecise or contradicts the trusted source; keep terminology, anchors and links consistent.
- Walk the **must-land** list item by item. An existing equivalent explanation can serve as a destination, with evidence; an existing conclusion alone never covers missing reasoning, conditions or counterexamples.
- On conflict with existing text, check the trusted source; never assume the new material wins. Report what cannot be resolved; never pick a side silently.
- When fidelity and the document's organization rules cannot both hold, report the specific conflict and let the user decide. Never drop material to make the page tidy.
- Touch the target document and the companion pages the local rules maintain and this batch actually affects. Do not rewrite the course.
- A document update is not evidence that the learner mastered anything.

Done when: every unit is placed or marked unresolved, and every must-land item has a recorded outcome.

## 5. Verify

- Run the checks the local rules require: compile or run the executable examples, open the pages, check links, anchors, terminology, layout.
- Record the environment (versions) and the results. Mark what could not be run **unverified**, with the reason.
- Verify what this integration touched, not the whole course.

Done when: every required check has a result, or an explicit unverified note with its reason.

## 6. Report destinations, then wait

- Report per unit: added (where) / merged (with which passage) / already covered (evidence) / unresolved (why) / gap (what is missing).
- Report at the level of reasoning, conditions and counterexamples — not just topics.
- Keep the package until the user confirms; delete it only after confirmation. Partial integration, blocked verification, a must-land item left unresolved or an unclaimed gap: keep it and say so — deleting would erase the only record. Only the user can waive this, knowingly.

Done when: every must-land item has a reported destination, and the user has decided the package's fate — a must-land item left unresolved or an unclaimed gap keeps the package, unless the user waives it knowingly.

## Anti-patterns

- Appending material at the end without reading the document's structure.
- Carrying conclusions while dropping the reasoning, conditions or counterexamples.
- Rewriting existing text beyond this batch to make the page read smoothly.
- Treating the package as a second source of truth, or syncing changes back into it.
- Quietly resolving conflicts, or dropping unresolved items.
- Reporting "done" without the per-item destinations.
