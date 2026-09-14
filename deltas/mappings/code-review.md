# code-review

## code-review/SKILL.md

### default-target

The skill reviews the working tree against `HEAD` by default, so the description leads with that.

```diff
-description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
+description: "Review the changes along two axes: by default the uncommitted changes against `HEAD`, or the committed range since a fixed point (commit, branch, tag, or merge-base) when one is supplied. Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review work-in-progress changes, a branch, a PR, or asks to \"review since X\"."
```

### intro-line

The two axes now run over the working tree unless the user supplies a fixed point.

```diff
-Two-axis review of the diff between `HEAD` and a fixed point the user supplies:
+Two-axis review of the diff between `HEAD` and either the working tree (the default) or a fixed point the user supplies:
```

### capture-review-target

Step 1 captures the uncommitted target: tracked changes plus the untracked file list.

```diff
-### 1. Pin the fixed point
-
-Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.
-
-Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.
-
-Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.
+### 1. Capture the review target
+
+The default target is the uncommitted changes against `HEAD`, the tip of the current branch (local unpushed commits included). Tracked changes (staged and unstaged combined) come from `git diff HEAD`. Untracked files never appear there: list them with `git ls-files --others --exclude-standard` (this respects `.gitignore`) and review them as new files.
+
+If the user supplies a fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.), the target is the committed range instead: capture `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base) and the list of commits via `git log <fixed-point>..HEAD --oneline`.
+
+Before going further, confirm the target resolves (`git rev-parse HEAD`, and `git rev-parse <fixed-point>` when one was supplied) and is non-empty: any `git diff HEAD` output or untracked files, or a non-empty fixed-point diff. A bad ref or an empty target should fail here, not inside two parallel sub-agents.
```

### spec-source

The spec is never guessed from the filesystem; the review asks when the user did not supply one.

```diff
-Look for the originating spec, in this order:
-
-1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
-2. A path the user passed as an argument.
-3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
-4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".
+Look for the originating spec, in this order:
+
+1. **Fixed-point reviews only**: issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
+2. A spec path or issue reference the user supplied or mentioned.
+3. If nothing is found, ask the user which spec this work implements; if they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".
```

### standards-prompt-target

The Standards sub-agent gets the uncommitted review target, including untracked files.

```diff
-- The full diff command and commit list.
+- The review target: `git diff HEAD` plus the untracked file list (each untracked file is new; read it in full), or the fixed-point diff command and commit list when one was supplied.
```

### spec-prompt-target

The Spec sub-agent gets the same target description.

```diff
-- The diff command and commit list.
+- The review target: `git diff HEAD` plus the untracked file list (each untracked file is new; read it in full), or the fixed-point diff command and commit list when one was supplied.
```
