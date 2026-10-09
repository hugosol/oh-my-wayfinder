# ask-matt

## ask-matt/SKILL.md

### local-path

The router names the local implementation-ticket directory, not upstream's `issues/`.

```op
anchor: |
       - **`/implement`** per ticket, **`/clear`ing context between each one**. On a local tracker that's one file per ticket under `.scratch/<feature>/issues/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed. Each ticket is self-contained, so the last one's context is disposable.
find: `.scratch/<feature>/issues/`,
content: `.scratch/<feature>/implementation/`,
```

### review-default

The router reflects code-review's new default target: the uncommitted changes.

```op
anchor: |
     Either way, the code gets built by driving **`/tdd`** (one red-green slice at a time) and closes out with **`/code-review`**, a two-axis review (Standards + Spec) of the diff. `/implement` runs both per ticket; `/implement-spec`'s implementers each drive `/tdd`, and it runs one `/code-review` over the integration branch. Reach for **`/tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/code-review`** on its own whenever you want to review <oh-my-wayfinder:insert>a branch or PR against a fixed point.
insert: |-
  your uncommitted changes (its default) or 
```

### contract-gate

The multi-session route passes through an approved contract before tickets are cut.

```op
anchor: |
     - **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. Then work the tickets one of two ways:
find: **`/to-tickets`** to split
content: **`/to-contract`** to agree the promises and the seams where they will be observed. Once the contract is approved, **`/to-tickets`** splits
```

### omp-automation

The router offers the OMP extension as the serial automation over the same route as `/implement-spec`, not as a separate process.

```op
anchor: |-
     When the work goes up as a pull request, **`/pr`** shapes the body: the smallest visual that shows the change, before/after evidence that it works, and a one-way or two-way door call. It's model-invoked, so the agent reaches for it whenever it writes a PR.
  <oh-my-wayfinder:insert>
insert: |

     **Oh My Pi only:** once `.scratch/<slug>/spec.md` and its approved `contract.md` exist, **`/spec-to-code <slug>`** automates `/to-tickets` and then works the tickets in dependency order with serial TDD subagents. It is the OMP-only counterpart to `/implement-spec`: the same route, but serial, with the contract gate and hands-off turn handling built in. Install it by placing this repo's `extensions/spec-to-code.ts` in your OMP extension setup, with `extensions/agents/tdd.md` in the adjacent `agents/` directory, and listing that directory under `extensions:` in `config.yml` (or passing it with `omp --extension`/`-e`). It is an automation tool, not a different flow: without OMP, call `/to-tickets` yourself, then work the tickets with `/implement` or `/implement-spec`.
```

### contract-context

The contract stays in the same context window as the thinking that produced it.

```op
anchor: |
  Keep steps 1–3 in **one unbroken context window** (don't compact or clear until after `/to-tickets`) so the grilling, spec, <oh-my-wayfinder:insert>and tickets all build on the same thinking. Each `/implement` then starts fresh, working from the ticket. Run `/retro` in the session it's looking back on, before you clear; after clearing, point it at that session's log instead.
insert: |-
  contract, 
```

### wayfinder-quality-loop

The wayfinder on-ramp includes the local-track quality loop and its manual final audit before handoff.

```op
anchor: |
  - **A huge, foggy effort: a greenfield project or a huge feature build, too big for one session** → **`/wayfinder`**, the most cognitively demanding flow here. When the way from here to the destination isn't visible yet, it charts a **shared map** of **decision tickets** on the issue tracker and resolves them one at a time, producing **decisions, not deliverables**, until the fog is pushed back and the way is clear. Where **`/grill-with-docs`** sharpens an idea you can hold in one session, wayfinder is for the idea you can't, and it's slower and denser, so save it for exactly that, never a well-scoped feature.

    When the map clears, **it hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**, which collapses the map's linked decisions into a buildable plan, then `/to-tickets` and `/implement` as usual. Looping the map straight into `/implement` skips that collapse and throws the linked detail away, so go straight to `/implement` only when the effort turned out genuinely small.
find: When the map clears, **it hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**, which collapses the map's linked decisions into a buildable plan, then
content: |-
  On the local markdown tracker, every resolved decision ticket runs **`/lighthouse`** and then **`/backtracer`** automatically; you decide what to do with any gaps they surface. Once every ticket is resolved, run **`/traverse`** for the final audit. This extended planning loop currently supports the local tracker only; the GitHub and GitLab tracker setups do not include it yet.

    When the map clears and `/traverse` is accepted, **wayfinder hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**, which collapses the map's linked decisions into a buildable plan, then `/to-contract`,
```

### prototype-worktree-detour

The prototype detour hands back a worktree instead of a `/handoff` pair.

```op
anchor: |
  2. **Branch: can you settle every question in conversation?** If a question needs a runnable answer (state, business logic, a UI you have to see), detour through a prototype, bridged by **`/handoff`** in both directions (a prototype lives in its own directory, which is exactly what `/handoff` is for; see Phase boundaries):
     - **`/handoff`** out, then open a fresh session against that file,
     - **`/prototype`** to answer the question with throwaway code,
     - **`/handoff`** back what you learned, and reference it from the original idea thread.
find: |-
  prototype, bridged by **`/handoff`** in both directions (a prototype lives in its own directory, which is exactly what `/handoff` is for; see Phase boundaries):
     - **`/handoff`** out, then open a fresh session against that file,
     - **`/prototype`** to answer the question with throwaway code,
     - **`/handoff`** back what you learned, and reference it from the original idea thread.
content: prototype. Run **`/prototype`** in the working tree; it hands back a `prototype/<name>` worktree holding the chosen result and a `VERDICT.md`, with the working tree restored. Take that worktree path back into this thread — it is the reference the spec will point at — and keep grilling.
```

### conversation-choice-wording

State the routing question directly, without suggesting a Git operation.

```op
anchor: |-
  2. **Branch: can you settle every question in conversation?**
find: Branch: can
content: Can
```

### build-scope-choice-wording

State the build-scope question directly, without suggesting a Git operation.

```op
anchor: |-
  3. **Branch: is this a multi-session build?**
find: Branch: is
content: Is
```

### phase-choice-wording

Describe context-management choices separately from Git terminology.

```op
anchor: |-
  the reasoning behind each branch,
find: branch,
content: choice,
```

### prototype-worktree-standalone

The standalone section describes the worktree handoff and the no-spec rule.

```op
anchor: |
  - **`/prototype`** is a small, throwaway program that answers one design question: does this state model feel right, or what should this UI look like. Throwaway is a constraint on how the code is written, not a promise to destroy it: the answer folds into the real code, and the prototype itself is kept as a **primary source** on a `prototype/<name>` branch out of main, pointed at from the implementation issue. It's the detour in step 2 of the main flow, but reach for it any time a design question is hard to settle on paper.
find: Throwaway is a constraint on how the code is written, not a promise to destroy it: the answer folds into the real code, and the prototype itself is kept as a **primary source** on a `prototype/<name>` branch out of main, pointed at from the implementation issue.
content: It builds in the working tree so the question is judged against the real app, then hands back a `prototype/<name>` worktree in a sibling directory holding the chosen result and a `VERDICT.md`, and restores the working tree. It writes no spec, issue, or ticket; take the worktree path into the conversation that asked the question and run `/to-spec` there when you're ready.
```
