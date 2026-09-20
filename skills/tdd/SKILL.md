---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

Execute the assigned work through a red → green loop. This skill owns the testing procedure, verification requirements, completion criteria, and final report.

## Start from the assigned work

When given a ticket, use its acceptance criteria, coverage ownership, and approved seams as the execution brief. Preserve their meaning when turning them into tests.

Identify which criteria this ticket owns. Use existing coverage IDs where provided; otherwise refer to the acceptance criterion itself. Do not introduce another requirements document or status ledger.

Follow upstream references when the ticket leaves a necessary detail unresolved. Do not routinely reconstruct its requirements from the spec or contract. Report missing or conflicting acceptance decisions rather than inventing a passing interpretation.

When exploring the codebase, read `CONTEXT.md` if it exists so test names and interface vocabulary match the domain, and respect relevant ADRs.

## What a good test is

A good test distinguishes the required behavior from a plausible violation through an approved interface. It reads like a specification and survives changes to the implementation behind that interface.

Expected outcomes come from independent evidence: the acceptance criterion, a known-good example, or an independently worked example. They are not recomputed from the implementation under test.

Read [tests.md](tests.md) before designing tests, and [mocking.md](mocking.md) before introducing test doubles.

## Seams: where tests go

A **seam** is the public boundary at which the assigned behavior is exercised and observed without reaching into its implementation.

Use the approved seams supplied with the work. Existing approval does not need to be requested again.

If no seam has been approved, propose one and obtain approval before writing tests. If an approved seam cannot expose the assigned behavior, report the mismatch rather than silently substituting an internal test surface.

When the interface shape or seam placement needs a design decision, call the Skill tool with "codebase-design" for the shared vocabulary and principles.

## Execute one vertical slice

Repeat the following steps for one behavior at a time. Do not batch all tests before implementing.

### 1. Design the test

For the current acceptance criterion, state briefly:

- **Expected behavior:** what observable result is required, and where the expected outcome comes from.
- **Violation:** one concrete, plausible behavior that would break the criterion.
- **Exercise and observation:** the scenario, interface, and observation that distinguish the expected behavior from that violation.

Check that the scenario reaches the relevant condition and that test doubles leave the mechanism responsible for the violation in the exercised path.

Keep this explanation with the current test work; no separate design artifact is required.

Ready to write the test when it can distinguish the named violation from the required behavior.

### 2. Red

Write the test and run it before implementing the behavior.

Inspect why it fails. A missing interface may be the initial red, but setup, import, or fixture failures alone do not demonstrate that the behavioral assertion can detect the violation. Resolve those obstacles so the test can exercise the intended behavior.

If the criterion is already satisfied, verify the existing behavior and coverage. Do not manufacture a failure or add a redundant test merely to perform the loop.

### 3. Green

Write only the implementation needed to satisfy the current behavior, then run the test.

Keep the acceptance criterion and independent expected outcome fixed while making the implementation pass. If evidence reveals an incorrect fixture or an unresolved requirement, explain and resolve that issue explicitly rather than adjusting the expectation to match the implementation.

### 4. Check the evidence

Revisit the named violation: could an implementation containing that error still pass this test?

If yes, the test does not yet establish the criterion. Correct the scenario, observation, or test-double placement.

When inspection cannot settle whether the test detects the violation, use a targeted fault injection or temporary mutation and observe the test fail. Restore the correct behavior and confirm green afterward. A project-wide mutation-testing setup is not required.

Only then continue to the next slice.

## Completion

Before reporting the assigned work complete:

- Account for every acceptance criterion owned by this ticket using a specific test or other required verification evidence.
- Run the relevant tests and report the actual results.
- Distinguish what the evidence proves from what remains unverified.
- Report blocked or unresolved criteria explicitly; passing tests do not authorize weakening an acceptance criterion.
- Follow the project's ticket-status rules. A completed agent invocation is not itself proof that the ticket is complete.

For criteria requiring real external behavior or qualitative evaluation, use the required evidence and the agreed evaluation criteria. Controlled responses can verify how the system handles those responses, not the quality of a real external system. Missing evaluation criteria or unavailable external access are limitations to report, not substitutes for a passing result.

The final report should identify:

- the behavior delivered;
- each owned coverage ID or acceptance criterion and its supporting test/evidence;
- the verification commands actually run and their results;
- any unresolved or unverified items.

Keep the report concise. Reference evidence rather than duplicating the ticket.

## Scope discipline

- One behavior, one test, one minimal implementation per cycle.
- Tests verify behavior through approved seams, not internal wiring.
- Expected outcomes remain independent of the implementation.
- Refactoring is not part of this loop; it belongs to the review stage described by the `code-review` skill.
