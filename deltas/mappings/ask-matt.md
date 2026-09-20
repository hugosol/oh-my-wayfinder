# ask-matt

## ask-matt/SKILL.md

### local-path

The router names the local implementation-ticket directory, not upstream's `issues/`.

```diff
-   - **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. On a local tracker that's one file per ticket under `.scratch/<feature>/issues/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed: kick off **`/implement`** per ticket, **`/clear`ing context between each one**. Each ticket is self-contained, so the last one's context is disposable.
+   - **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. On a local tracker that's one file per ticket under `.scratch/<feature>/implementation/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed: kick off **`/implement`** per ticket, **`/clear`ing context between each one**. Each ticket is self-contained, so the last one's context is disposable.
```

### review-default

The router reflects code-review's new default target: the uncommitted changes.

```diff
-   Either way, **`/implement`** builds each issue by driving **`/tdd`** internally (one red-green slice at a time), then closes out by running **`/code-review`**, a two-axis review (Standards + Spec) of the diff, before committing. Reach for **`/tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/code-review`** on its own whenever you want to review a branch or PR against a fixed point.
+   Either way, **`/implement`** builds each issue by driving **`/tdd`** internally (one red-green slice at a time), then closes out by running **`/code-review`**, a two-axis review (Standards + Spec) of the diff, before committing. Reach for **`/tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/code-review`** on its own whenever you want to review your uncommitted changes (its default) or a branch or PR against a fixed point.
```

### contract-gate

The multi-session route passes through an approved contract before tickets are cut.

```diff
-   - **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. On a local tracker that's one file per ticket under `.scratch/<feature>/implementation/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed: kick off **`/implement`** per ticket, **`/clear`ing context between each one**. Each ticket is self-contained, so the last one's context is disposable.
+   - **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-contract`** to agree the promises and the seams where they will be observed. Once the contract is approved, **`/to-tickets`** splits it into tracer-bullet tickets, each declaring its **blocking edges**. On a local tracker that's one file per ticket under `.scratch/<feature>/implementation/`, worked blockers-first by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed: kick off **`/implement`** per ticket, **`/clear`ing context between each one**. Each ticket is self-contained, so the last one's context is disposable.
```

### omp-automation

The router offers the OMP extension as automation over the same route, not as a separate process.

```diff
    Either way, **`/implement`** builds each issue by driving **`/tdd`** internally (one red-green slice at a time), then closes out by running **`/code-review`**, a two-axis review (Standards + Spec) of the diff, before committing. Reach for **`/tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/code-review`** on its own whenever you want to review your uncommitted changes (its default) or a branch or PR against a fixed point.
+
+   **Oh My Pi only:** once `.scratch/<slug>/spec.md` and its approved `contract.md` exist, **`/spec-to-code <slug>`** automates `/to-tickets` and then works the tickets in dependency order with serial TDD subagents. Install it by placing this repo's `extensions/spec-to-code.ts` in your OMP extension setup, with `extensions/agents/tdd.md` in the adjacent `agents/` directory. It is an automation tool, not a different flow: without OMP, call `/to-tickets` yourself, then `/implement` each ticket in dependency order.
 
 ### Context hygiene
```

### contract-context

The contract stays in the same context window as the thinking that produced it.

```diff
-Keep steps 1–3 in **one unbroken context window** (don't compact or clear until after `/to-tickets`) so the grilling, spec, and tickets all build on the same thinking. Each `/implement` then starts fresh, working from the ticket.
+Keep steps 1–3 in **one unbroken context window** (don't compact or clear until after `/to-tickets`) so the grilling, spec, contract, and tickets all build on the same thinking. Each `/implement` then starts fresh, working from the ticket.
```

### wayfinder-quality-loop

The wayfinder on-ramp includes the local-track quality loop and its manual final audit before handoff.

```diff
 - **A huge, foggy effort: a greenfield project or a huge feature build, too big for one session** → **`/wayfinder`**, the most cognitively demanding flow here. When the way from here to the destination isn't visible yet, it charts a **shared map** of **decision tickets** on the issue tracker and resolves them one at a time, producing **decisions, not deliverables**, until the fog is pushed back and the way is clear. Where **`/grill-with-docs`** sharpens an idea you can hold in one session, wayfinder is for the idea you can't, and it's slower and denser, so save it for exactly that, never a well-scoped feature.
 
-  When the map clears, **it hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**, which collapses the map's linked decisions into a buildable plan, then `/to-tickets` and `/implement` as usual. Looping the map straight into `/implement` skips that collapse and throws the linked detail away, so go straight to `/implement` only when the effort turned out genuinely small.
+  On the local markdown tracker, every resolved decision ticket runs **`/lighthouse`** and then **`/backtracer`** automatically; you decide what to do with any gaps they surface. Once every ticket is resolved, run **`/traverse`** for the final audit. This extended planning loop currently supports the local tracker only; the GitHub and GitLab tracker setups do not include it yet.
+
+  When the map clears and `/traverse` is accepted, **wayfinder hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**, which collapses the map's linked decisions into a buildable plan, then `/to-contract`, `/to-tickets` and `/implement` as usual. Looping the map straight into `/implement` skips that collapse and throws the linked detail away, so go straight to `/implement` only when the effort turned out genuinely small.
```
