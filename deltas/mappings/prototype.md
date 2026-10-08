# prototype

## prototype/SKILL.md

### skill-hand-back-worktree

Replace the capture step with a worktree hand-back: record the verdict, export the prototype, write nothing else.

```op
anchor: |
  6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too (the verdict and the question it settled) in the issue or a commit. The main branch keeps only the validated decision.
find: **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too (the verdict and the question it settled) in the issue or a commit. The main branch keeps only the validated decision.
content: |-
  **Hand back a clean worktree.** When the question is answered, record the verdict and hand the prototype back as [Hand back](#hand-back) describes. The only outputs are the `prototype/<name>` branch, its worktree, and `VERDICT.md`. Nothing else is written; absorbing the decision — running `/to-spec`, folding it into the real code — belongs to the session that picks the worktree up.

  ## Hand back

  The answer is a verdict; the prototype is the evidence it came from.

  1. **Record the verdict.** Write `VERDICT.md` at the root of the prototype in the working tree: the question the prototype was built to answer, the option that won, and why the others lost. The next step commits it to the worktree branch, leaving the current branch's history untouched. It is what the next session reads first.
  2. **Hand back the prototype.** Put the prototype's own files and `VERDICT.md` on a fresh `prototype/<name>` branch, checked out as a worktree in a sibling directory of the repo (for example `../<repo>-prototype-<name>`), and commit there. Then put the working tree back exactly as you found it: revert the files the prototype changed, remove the ones it added (`VERDICT.md` included), and leave unrelated uncommitted work exactly as it was.
  3. **Report the worktree path.** Print the worktree's absolute path, the branch name, and the one command that runs the prototype. That path is the handoff: the session that asked the question takes it and runs `/to-spec` when it is ready. Keep the branch and worktree until the implementation is finished.

  ```bash
  git worktree add -b prototype/<name> ../<repo>-prototype-<name> HEAD
  # copy the prototype's files and VERDICT.md into the worktree, then commit there:
  git -C ../<repo>-prototype-<name> add -A
  git -C ../<repo>-prototype-<name> commit -m "prototype(<name>): <one-line verdict>"
  # restore the working tree: revert tracked prototype files, delete the added ones (VERDICT.md included)
  git restore --source=HEAD --worktree -- <tracked prototype paths>
  rm -rf <prototype-only paths>
  ```

  Done when `VERDICT.md` and the prototype are committed on `prototype/<name>`, the worktree exists at the printed path, and the working tree matches its pre-prototype state.

  **If a file the prototype touches was already dirty before you started, stop and ask.** The export cannot tell your uncommitted changes from the prototype's.
```

## prototype/LOGIC.md

### logic-module-liftability

Disambiguate §2's "lifts into the real module on its own": state readiness, not a timing, so it stops pulling toward folding the logic in at answer time.

```op
anchor: |
  This is what makes the prototype useful past its own lifetime: once the question's answered, the validated reducer / machine / function set lifts into the real module on its own.
find: lifts into the real module on its own.
content: is ready to lift into the real module as-is.
```

### logic-hand-back-worktree

The logic branch hands the same worktree back; nothing lifts into the real module yet.

```op
anchor: |
  ### 5. Capture the answer and the prototype

  Once the prototype has answered its question, capture the answer, then capture the prototype the way the [SKILL](SKILL.md) describes. The logic-specific mapping: the validated reducer / machine / function set lifts into the real module (the decision, absorbed); the HTML shell rides along to the throwaway branch that keeps the prototype as a primary source, and being one self-contained file, it stays trivially re-runnable there.
find: |-
  Capture the answer and the prototype

  Once the prototype has answered its question, capture the answer, then capture the prototype the way the [SKILL](SKILL.md) describes. The logic-specific mapping: the validated reducer / machine / function set lifts into the real module (the decision, absorbed); the HTML shell rides along to the throwaway branch that keeps the prototype as a primary source, and being one self-contained file, it stays trivially re-runnable there.
content: |-
  Hand back the worktree

  Once the prototype has answered its question, record the verdict and hand it back the way the [SKILL](SKILL.md) describes. The logic-specific mapping: the whole prototype is the single HTML file, so it rides as-is onto the `prototype/<name>` branch and stays trivially re-runnable in the worktree. Nothing lifts into the real module yet; the validated reducer / machine / function set is absorbed later, when the decision becomes a spec.
```

## prototype/UI.md

### ui-hand-back-worktree

The UI branch keeps only the winning variant and hands it back; the losing variants and the switcher are dropped.

```op
anchor: |
  ### 6. Capture the answer and clean up

  Once a variant has won, capture the answer (which variant and why), then capture the prototype the way the [SKILL](SKILL.md) describes. Fold the winner into the real code and move the rest onto the throwaway branch, not into main:

  - **Sub-shape A**: fold the winner into the existing page; drop the losing variants and the switcher from main.
  - **Sub-shape B**: promote the winning variant to a real route; drop the throwaway route and the switcher from main.

  The full set of variants is the primary source, so it lands on the throwaway branch, not the bin, since variant components and the switcher left in the main branch rot fast and confuse the next reader.
find: |-
  Capture the answer and clean up

  Once a variant has won, capture the answer (which variant and why), then capture the prototype the way the [SKILL](SKILL.md) describes. Fold the winner into the real code and move the rest onto the throwaway branch, not into main:

  - **Sub-shape A**: fold the winner into the existing page; drop the losing variants and the switcher from main.
  - **Sub-shape B**: promote the winning variant to a real route; drop the throwaway route and the switcher from main.

  The full set of variants is the primary source, so it lands on the throwaway branch, not the bin, since variant components and the switcher left in the main branch rot fast and confuse the next reader.
content: |-
  Hand back the worktree

  Once a variant has won — a single option, or a hybrid assembled from several — reduce the prototype to that winner: drop the losing variants and the switcher, leaving the chosen result. Then hand it back the way the [SKILL](SKILL.md) describes.

  - **Sub-shape A**: the existing page goes back to exactly how it looked before the prototype; the chosen result rides onto the branch.
  - **Sub-shape B**: the throwaway route and switcher are removed from the real app; the chosen result rides onto the branch.

  `VERDICT.md` records the decision and why the others lost; folding the winner into the real code is a later step, done properly once the decision is a spec.
```
