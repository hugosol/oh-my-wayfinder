# tdd

## tdd/SKILL.md

### ticket-brief

Opens with the ticket brief: acceptance criteria, coverage ownership and approved seams come from the assigned work, and upstream references are followed only when a necessary detail is unresolved.

```diff
+## Working from a ticket
+
+When given a ticket, use its acceptance criteria, coverage ownership, and approved seams as the execution brief. Preserve their meaning when turning them into tests. Follow upstream references only when the ticket leaves a necessary detail unresolved; do not routinely reconstruct its requirements from the spec or contract. Report missing or conflicting acceptance decisions rather than inventing a passing interpretation.
+
 ## What a good test is
```

### tests-mocking-pointer

Points at tests.md and mocking.md at the moment each is needed (designing tests, introducing doubles).

```diff
-See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.
+Read [tests.md](tests.md) before designing tests and [mocking.md](mocking.md) before introducing test doubles.
```

### seam-approval

Approval travels with the work: use the seams already supplied instead of asking the user to confirm them again.

```diff
-**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.
+**Test only at pre-agreed seams.** Before writing any test, write down the seams under test. Use approval already supplied with the work; otherwise confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.
```

### ask-when-unapproved

Keeps the ask for the no-approval case and adds the mismatch report when an approved seam cannot expose the assigned behavior.

```diff
-Ask: "What's the public interface, and which seams should we test?"
+If no seam has been approved, ask: "What's the public interface, and which seams should we test?" If an approved seam cannot expose the assigned behavior, report the mismatch rather than silently substituting an internal test surface.
```

### loop-rules

Adds design-before-red, preserve-the-criterion and check-the-evidence to the loop rules, and expands red-before-green to require inspecting the failure.

```diff
-- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
+- **Design before red.** For the current acceptance criterion, briefly state the expected behavior and its independent source, one concrete plausible violation, and the scenario and observation that distinguish the two. Check that the scenario reaches the relevant condition and test doubles leave the mechanism responsible for the violation in the exercised path. Keep this explanation with the current test work; no separate artifact is required.
+- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features. Run the test and inspect why it fails: a missing interface may be the initial red, but setup, import, or fixture failures alone do not establish that the behavioral assertion can detect the violation. If the criterion is already satisfied, verify the existing behavior and coverage rather than manufacturing a failure or adding a redundant test.
+- **Preserve the criterion.** Keep the acceptance criterion and independent expected outcome fixed while making the implementation pass. If evidence reveals an incorrect fixture or an unresolved requirement, explain and resolve it explicitly rather than adjusting the expectation to match the implementation.
+- **Check the evidence after green.** Run the test, then revisit the named violation: could an implementation containing that error still pass? If yes, correct the scenario, observation, or test-double placement before proceeding. When inspection cannot settle this, use a targeted fault injection or temporary mutation and observe the test fail; restore the correct behavior and confirm green afterward. A project-wide mutation-testing setup is not required.
```

### completion

Adds the completion section: every owned criterion needs evidence, results are reported as run, and unverified items stay visible. This op is anchored to the end of the file, so text upstream appends there is not a locator miss; review the regenerated skills/tdd/SKILL.md after bumping upstream.

```diff
 - **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
+
+## Completion
+
+Account for every acceptance criterion owned by the ticket using a specific test or other required verification evidence. Use existing coverage IDs where provided; otherwise refer to the criterion itself. Run the relevant tests and report actual results, distinguishing what the evidence proves from what remains unverified. Passing tests do not authorize weakening an acceptance criterion.
+
+For criteria requiring real external behavior or qualitative evaluation, use the required evidence and agreed evaluation criteria. Controlled responses verify how the system handles those responses, not the quality of a real external system. Missing evaluation criteria or unavailable external access are limitations to report, not substitutes for a passing result.
+
+The final report should identify the behavior delivered, each owned criterion and its supporting test/evidence, verification commands actually run and their results, and unresolved or unverified items. Keep it concise; reference evidence rather than duplicating the ticket or creating another status ledger. Follow the project's ticket-status rules: a completed agent invocation is not itself proof that the ticket is complete.
```

## tdd/tests.md

### acceptance-section

Adds the acceptance-criterion section: the scenario and assertions must preserve the criterion's condition, scope and outcome, including guarantees a single invocation cannot establish. Also rewords the last characteristics bullet to allow enough assertions for one coherent behavior.

```diff
-- One logical assertion per test
+- One logical assertion per test (which may require multiple checks to establish the same behavior)
+
+## Preserve the acceptance criterion
+
+A coverage ID or test name establishes traceability, not proof. The scenario and assertions must preserve the criterion's condition, scope, and outcome.
+
+Choose a scenario in which the named violation could occur:
+
+- Repeated-processing guarantees require the relevant sequence of operations and state transitions, not just one invocation with a hand-built end state.
+- Concurrency limits require controlled overlapping work; a single request cannot distinguish bounded from unbounded concurrency.
+- Retry limits require an eligible failure and observation of attempts at the boundary the criterion constrains.
+- Final-artifact guarantees require reading the delivered artifact rather than only checking an intermediate object.
+
+An independent literal is not enough if it describes a weaker or different behavior. Check both the source of the expected value and the meaning of the assertion.
+
+A qualitative evaluation uses agreed criteria established before judging the output. Record mixed results as mixed results unless those criteria justify acceptance.
```

### red-flag-wording

States the red flag precisely: internal call counts or order, instead of observable behavior.

```diff
-- Asserting on call counts/order
+- Asserting on internal call counts/order instead of observable behavior
```

### external-interaction-note

Adds the constrained-interaction note: a criterion that constrains an external interaction must be observed on the real boundary, since one wrapper invocation does not prove one external request.

```diff
 - Verifying through external means instead of interface
+
+External interaction counts or ordering are valid assertions when the acceptance criterion explicitly constrains them. Observe the actual constrained interaction: one wrapper invocation does not necessarily mean one external request.
```

## tdd/mocking.md

### behavior-under-test-real

Adds the test-double boundary rules and examples: the acceptance criterion picks the boundary, the mechanism that can cause the named violation stays in the exercised path, and the approved seam remains the entry point.

```diff
 - Anything you control
+
+## Keep the behavior under test real
+
+Choose the test-double boundary from the acceptance criterion, not merely from which dependency is inconvenient to run. Keep the mechanism that could cause the named violation in the exercised path; substitute the external environment beyond that mechanism.
+
+- To verify rollback after a model failure, a controlled model adapter can provide the failure.
+- To verify that the real adapter makes no additional HTTP attempts, keep the adapter and SDK real and substitute the HTTP transport or endpoint.
+- To verify a generated file, read the actual temporary file instead of replacing the write and asserting what was passed to it.
+- To verify behavior under concurrency, control scheduling with explicit synchronization rather than relying on arbitrary sleeps.
+
+The approved seam remains the entry point. Moving a test double below an SDK does not require exposing another application interface. A test double supplies conditions and observations; it does not supply the behavior the test claims to verify.
```

### deterministic-doubles

Replaces the no-conditional-logic bullet with the explicit-response rule: deterministic responses for the conditions the scenario needs, without recreating the production algorithm inside the double.

```diff
-- No conditional logic in test setup
+- Explicit, deterministic responses or response sequences for the conditions the scenario needs; do not recreate the production algorithm inside the double
```
