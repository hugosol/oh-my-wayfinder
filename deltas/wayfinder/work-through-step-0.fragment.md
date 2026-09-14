0. **Load the tracker vocabulary.** Read `docs/agents/triage-labels.md` and `docs/agents/issue-tracker.md`.
   - This map produces **decision tickets**: use the Decision ticket status vocabulary.
   - Key: `resolved` means "Decision made, implementation pending"; NOT "code implemented".
   - Decision tickets (in `decision/`) and task tickets (in `issues/`) are different systems with **non-overlapping status vocabularies**.

1. Load the **map**: the low-res view, not every ticket body.
