# Adopt upstream's GLOSSARY.md naming

Upstream v1.3 renamed the domain-doc convention from `CONTEXT.md` / `CONTEXT-MAP.md` to `GLOSSARY.md` / `GLOSSARY-MAP.md` across every skill that reads or writes it (11 skills, plus docs and the upstream root file). This fork tracks upstream as a delta, so it follows the rename: the generated `setup-matt-pocock-skills`, `tdd`, and `ask-matt` files inherit the new names from `upstream/` verbatim, and the hand-written `skills/to-contract/SKILL.md` was updated by hand. Projects that already have a `CONTEXT.md` must `git mv` it to `GLOSSARY.md` (and `CONTEXT-MAP.md` to `GLOSSARY-MAP.md`), because the skills only look for the new names.

## Considered Options

- **Keep `CONTEXT.md` and add reverse-rename mappings.** Rejected: every future upstream sync would have to flip the renamed text back by hand, and the fork would speak a different vocabulary from the upstream `domain-modeling` skill it depends on.
