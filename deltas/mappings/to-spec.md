# to-spec

## to-spec/SKILL.md

### seam-handoff

Seam placement moves to /to-contract: drop the seam sketch step, renumber, and hand off with the Do-not-decide-seams rule.

```diff
 
 1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.
 
-2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.
+2. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.
 
-Check with the user that these seams match their expectations.
+3. Tell the user the next step is `/to-contract` on the published spec — that is where the seams are chosen and the promises approved.
 
-3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.
+**Do not decide seams here.** Seam placement belongs to `/to-contract` (prefer existing seams, take the highest seam that carries the promise, keep the count low). If the conversation already settled a seam, record it in Implementation Decisions as a fact; otherwise leave it open.
 
 <spec-template>
 
```

### testing-decisions

Testing Decisions keeps prior art and non-seam constraints; the seam half belongs to /to-contract.

```diff
 
 ## Testing Decisions
 
-A list of testing decisions that were made. Include:
+Prior art and testing constraints the conversation settled — not seam decisions:
 
-- A description of what makes a good test (only test external behavior, not implementation details)
-- Which modules will be tested
 - Prior art for the tests (i.e. similar types of tests in the codebase)
+- Any constraint that is not a seam decision (a stand-in that must be used, a level that must be exercised, a tool)
+
+<!-- Seams, the promises tested at them, and each promise's coverage are decided by /to-contract, not here. -->
 
 ## Out of Scope
 
```
