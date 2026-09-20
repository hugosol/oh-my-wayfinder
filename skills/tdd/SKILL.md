---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## Working from a ticket

When given a ticket, use its acceptance criteria, coverage ownership, and approved seams as the execution brief. Preserve their meaning when turning them into tests. Follow upstream references only when the ticket leaves a necessary detail unresolved; do not routinely reconstruct its requirements from the spec or contract. Report missing or conflicting acceptance decisions rather than inventing a passing interpretation.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

Read [tests.md](tests.md) before designing tests and [mocking.md](mocking.md) before introducing test doubles.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test. Use approval already supplied with the work; otherwise confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

If no seam has been approved, ask: "What's the public interface, and which seams should we test?" If an approved seam cannot expose the assigned behavior, report the mismatch rather than silently substituting an internal test surface.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Design before red.** For the current acceptance criterion, briefly state the expected behavior and its independent source, one concrete plausible violation, and the scenario and observation that distinguish the two. Check that the scenario reaches the relevant condition and test doubles leave the mechanism responsible for the violation in the exercised path. Keep this explanation with the current test work; no separate artifact is required.
- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features. Run the test and inspect why it fails: a missing interface may be the initial red, but setup, import, or fixture failures alone do not establish that the behavioral assertion can detect the violation. If the criterion is already satisfied, verify the existing behavior and coverage rather than manufacturing a failure or adding a redundant test.
- **Preserve the criterion.** Keep the acceptance criterion and independent expected outcome fixed while making the implementation pass. If evidence reveals an incorrect fixture or an unresolved requirement, explain and resolve it explicitly rather than adjusting the expectation to match the implementation.
- **Check the evidence after green.** Run the test, then revisit the named violation: could an implementation containing that error still pass? If yes, correct the scenario, observation, or test-double placement before proceeding. When inspection cannot settle this, use a targeted fault injection or temporary mutation and observe the test fail; restore the correct behavior and confirm green afterward. A project-wide mutation-testing setup is not required.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.

## Completion

Account for every acceptance criterion owned by the ticket using a specific test or other required verification evidence. Use existing coverage IDs where provided; otherwise refer to the criterion itself. Run the relevant tests and report actual results, distinguishing what the evidence proves from what remains unverified. Passing tests do not authorize weakening an acceptance criterion.

For criteria requiring real external behavior or qualitative evaluation, use the required evidence and agreed evaluation criteria. Controlled responses verify how the system handles those responses, not the quality of a real external system. Missing evaluation criteria or unavailable external access are limitations to report, not substitutes for a passing result.

The final report should identify the behavior delivered, each owned criterion and its supporting test/evidence, verification commands actually run and their results, and unresolved or unverified items. Keep it concise; reference evidence rather than duplicating the ticket or creating another status ledger. Follow the project's ticket-status rules: a completed agent invocation is not itself proof that the ticket is complete.
