---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious, but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
2. **Trivial to run.** A UI prototype starts from one command in the project's task runner: `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Hand back a clean worktree.** When the question is answered, record the verdict and hand the prototype back as [Hand back](#hand-back) describes. The only outputs are the `prototype/<name>` branch, its worktree, and `VERDICT.md`. Nothing else is written; absorbing the decision — running `/to-spec`, folding it into the real code — belongs to the session that picks the worktree up.

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
