# tdd

## tdd/SKILL.md

### intro-and-brief

The reworked skill is ticket-driven: it opens by naming what the skill owns, then adds a section that takes the acceptance criteria, coverage ownership and approved seams from the assigned work. Upstream's CONTEXT.md paragraph moves into that section.

```diff
-TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.
+Execute the assigned work through a red → green loop. This skill owns the testing procedure, verification requirements, completion criteria, and final report.
 
-When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.
+## Start from the assigned work
 
+When given a ticket, use its acceptance criteria, coverage ownership, and approved seams as the execution brief. Preserve their meaning when turning them into tests.
+
+Identify which criteria this ticket owns. Use existing coverage IDs where provided; otherwise refer to the acceptance criterion itself. Do not introduce another requirements document or status ledger.
+
+Follow upstream references when the ticket leaves a necessary detail unresolved. Do not routinely reconstruct its requirements from the spec or contract. Report missing or conflicting acceptance decisions rather than inventing a passing interpretation.
+
+When exploring the codebase, read `CONTEXT.md` if it exists so test names and interface vocabulary match the domain, and respect relevant ADRs.
+
```

### good-test-body

Restates what a good test is in ticket terms: distinguish the required behavior from a plausible violation, and take expected outcomes from independent evidence rather than recomputing them from the implementation under test.

```diff
-Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.
+A good test distinguishes the required behavior from a plausible violation through an approved interface. It reads like a specification and survives changes to the implementation behind that interface.
 
-See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.
+Expected outcomes come from independent evidence: the acceptance criterion, a known-good example, or an independently worked example. They are not recomputed from the implementation under test.
 
+Read [tests.md](tests.md) before designing tests, and [mocking.md](mocking.md) before introducing test doubles.
+
```

### seams-body

The contract supplies the seams, so approval is not requested in-session: use the approved seams, propose one only when none has been approved, and report a seam that cannot expose the assigned behavior.

```diff
-A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.
+A **seam** is the public boundary at which the assigned behavior is exercised and observed without reaching into its implementation.
 
-**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.
+Use the approved seams supplied with the work. Existing approval does not need to be requested again.
 
-Ask: "What's the public interface, and which seams should we test?"
+If no seam has been approved, propose one and obtain approval before writing tests. If an approved seam cannot expose the assigned behavior, report the mismatch rather than silently substituting an internal test surface.
 
-When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.
+When the interface shape or seam placement needs a design decision, call the Skill tool with "codebase-design" for the shared vocabulary and principles.
 
```

### execution-loop-tail

The ticket workflow replaces upstream's two closing sections with a four-step vertical slice (design, red, green, check the evidence) plus completion and scope discipline. This op runs to the end of the file, so content upstream appends there will not be reported as a locator miss; review the regenerated file after bumping upstream.

```diff
-## Anti-patterns
+## Execute one vertical slice
 
-- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
-- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
-- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.
+Repeat the following steps for one behavior at a time. Do not batch all tests before implementing.
 
-## Rules of the loop
+### 1. Design the test
 
-- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
-- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
-- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
+For the current acceptance criterion, state briefly:
+
+- **Expected behavior:** what observable result is required, and where the expected outcome comes from.
+- **Violation:** one concrete, plausible behavior that would break the criterion.
+- **Exercise and observation:** the scenario, interface, and observation that distinguish the expected behavior from that violation.
+
+Check that the scenario reaches the relevant condition and that test doubles leave the mechanism responsible for the violation in the exercised path.
+
+Keep this explanation with the current test work; no separate design artifact is required.
+
+Ready to write the test when it can distinguish the named violation from the required behavior.
+
+### 2. Red
+
+Write the test and run it before implementing the behavior.
+
+Inspect why it fails. A missing interface may be the initial red, but setup, import, or fixture failures alone do not demonstrate that the behavioral assertion can detect the violation. Resolve those obstacles so the test can exercise the intended behavior.
+
+If the criterion is already satisfied, verify the existing behavior and coverage. Do not manufacture a failure or add a redundant test merely to perform the loop.
+
+### 3. Green
+
+Write only the implementation needed to satisfy the current behavior, then run the test.
+
+Keep the acceptance criterion and independent expected outcome fixed while making the implementation pass. If evidence reveals an incorrect fixture or an unresolved requirement, explain and resolve that issue explicitly rather than adjusting the expectation to match the implementation.
+
+### 4. Check the evidence
+
+Revisit the named violation: could an implementation containing that error still pass this test?
+
+If yes, the test does not yet establish the criterion. Correct the scenario, observation, or test-double placement.
+
+When inspection cannot settle whether the test detects the violation, use a targeted fault injection or temporary mutation and observe the test fail. Restore the correct behavior and confirm green afterward. A project-wide mutation-testing setup is not required.
+
+Only then continue to the next slice.
+
+## Completion
+
+Before reporting the assigned work complete:
+
+- Account for every acceptance criterion owned by this ticket using a specific test or other required verification evidence.
+- Run the relevant tests and report the actual results.
+- Distinguish what the evidence proves from what remains unverified.
+- Report blocked or unresolved criteria explicitly; passing tests do not authorize weakening an acceptance criterion.
+- Follow the project's ticket-status rules. A completed agent invocation is not itself proof that the ticket is complete.
+
+For criteria requiring real external behavior or qualitative evaluation, use the required evidence and the agreed evaluation criteria. Controlled responses can verify how the system handles those responses, not the quality of a real external system. Missing evaluation criteria or unavailable external access are limitations to report, not substitutes for a passing result.
+
+The final report should identify:
+
+- the behavior delivered;
+- each owned coverage ID or acceptance criterion and its supporting test/evidence;
+- the verification commands actually run and their results;
+- any unresolved or unverified items.
+
+Keep the report concise. Reference evidence rather than duplicating the ticket.
+
+## Scope discipline
+
+- One behavior, one test, one minimal implementation per cycle.
+- Tests verify behavior through approved seams, not internal wiring.
+- Expected outcomes remain independent of the implementation.
+- Refactoring is not part of this loop; it belongs to the review stage described by the `code-review` skill.
```

## tdd/tests.md

### acceptance-section

Adds the acceptance-criterion section: the scenario and assertions must preserve the criterion's condition, scope and outcome, including the guarantees a single invocation cannot establish. The last characteristics bullet is reworded to allow enough assertions to establish one coherent behavior.

```diff
-- One logical assertion per test
+- Tests one coherent behavior, with enough assertions to establish it
 
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
+
 ## Bad Tests
 
```

### red-flag-counts

External interaction counts and order are only a red flag when the acceptance criterion does not constrain them, so the bullet names the constrained case.

```diff
-- Asserting on call counts/order
+- Asserting internal call counts or order instead of observable behavior
```

### external-interaction-note

Adds the caveat that a constrained external interaction must be observed on the real boundary: one wrapper invocation does not prove one external request.

````diff
 - Verifying through external means instead of interface
 
+External interaction counts or ordering are valid assertions when the acceptance criterion explicitly constrains them. Observe the actual constrained interaction: one wrapper invocation does not necessarily mean one external request.
+
 ```typescript
````

## tdd/mocking.md

### behavior-under-test-real

Adds the test-double boundary rules: the acceptance criterion picks the double's boundary, the mechanism that can cause the named violation stays in the exercised path, and the approved seam remains the entry point. Also gives the upstream boundary list its own heading.

```diff
+## Keep the behavior under test real
+
+Choose the test-double boundary from the acceptance criterion, not merely from which dependency is inconvenient to run.
+
+Keep the mechanism that could cause the named violation in the exercised path. Substitute the external environment beyond that mechanism.
+
+For example:
+
+- To verify rollback after a model failure, a controlled model adapter can provide the failure.
+- To verify that the real adapter makes no additional HTTP attempts, keep the adapter and SDK real and substitute the HTTP transport or endpoint.
+- To verify a generated file, read the actual temporary file instead of replacing the write and asserting what was passed to it.
+- To verify behavior under concurrency, control scheduling with explicit synchronization rather than relying on arbitrary sleeps.
+
+The approved seam remains the entry point. Moving a test double below an SDK does not require exposing another application interface.
+
+A test double supplies conditions and observations; it does not supply the behavior the test claims to verify.
+
+## System boundaries
+
 Mock at **system boundaries** only:
 
```

### boundaries-bullets

Prefers a real test database and a temporary real filesystem over mocking those boundaries.

```diff
-- Databases (sometimes - prefer test DB)
+- Databases (sometimes — prefer a test database)
 - Time/randomness
-- File system (sometimes)
+- File system (sometimes — prefer a temporary real file system)
 
```

### mockability-heading

Sentence-case heading, and the redundant lead-in line is dropped because the new System boundaries heading and its list already state it.

```diff
-## Designing for Mockability
-
-At system boundaries, design interfaces that are easy to mock:
+## Designing for mockability
 
```

### dependency-injection-section

Gives the step a heading level, states the injection rule in prose, and shows the hard case as an owned-client construction rather than a mocked one.

````diff
-**1. Use dependency injection**
+### 1. Use dependency injection
 
 Pass external dependencies in rather than creating them internally:
 
 ```typescript
-// Easy to mock
+// Easy to control at the external boundary
 function processPayment(order, paymentClient) {
   return paymentClient.charge(order.total);
 }
 
-// Hard to mock
+// Hard to control without replacing owned implementation
 function processPayment(order) {
   const client = new StripeClient(process.env.STRIPE_KEY);
   return client.charge(order.total);
 }
 ```
 
````

### sdk-section-and-tail

Same treatment for SDK-style interfaces, plus the explicit-response guidance that replaces upstream's summary list. This op runs to the end of the file, so content upstream appends there will not be reported as a locator miss; review the regenerated file after bumping upstream.

````diff
-**2. Prefer SDK-style interfaces over generic fetchers**
+### 2. Prefer SDK-style interfaces over generic fetchers
 
 Create specific functions for each external operation instead of one generic function with conditional logic:
 
 ```typescript
-// GOOD: Each function is independently mockable
+// GOOD: Each function represents one external operation
 const api = {
   getUser: (id) => fetch(`/users/${id}`),
   getOrders: (userId) => fetch(`/users/${userId}/orders`),
   createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
 };
 
-// BAD: Mocking requires conditional logic inside the mock
+// BAD: Production behavior is hidden behind one generic conditional interface
 const api = {
   fetch: (endpoint, options) => fetch(endpoint, options),
 };
 ```
 
-The SDK approach means:
-- Each mock returns one specific shape
-- No conditional logic in test setup
-- Easier to see which endpoints a test exercises
-- Type safety per endpoint
+Specific external operations make it easier to see which interaction a scenario exercises and which response shape it receives.
+
+Prefer explicit, deterministic responses or response sequences. Keep test-double behavior limited to the external conditions the scenario needs; do not recreate the production algorithm inside the double.
````
