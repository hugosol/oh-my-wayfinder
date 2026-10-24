---
name: test-audit
description: "Audit existing tests, test changes, or a test suite for test quality and contract preservation, and recommend changes without implementing them."
disable-model-invocation: true
---

Two-axis audit of tests within a declared scope:

- **Test Quality**: do the tests detect meaningful faults while tolerating contract-preserving refactors?
- **Contract Preservation**: what commitments do the tests protect, and would changing, consolidating, or deleting them lose that protection?

Both axes run as **parallel sub-agents** with independent contexts; this skill aggregates their findings. This is an audit-and-recommend workflow, not test authoring or automatic cleanup. Invoke it only at the user's request.

## Process

### 1. Capture the audit target

The default target is uncommitted changes against `HEAD`: use `git diff HEAD` for staged and unstaged tracked changes, and `git ls-files --others --exclude-standard` for untracked files. Treat untracked files as new files. Follow production changes to their related tests even when no test file changed.

If the user supplies a fixed point (commit, branch, tag, or merge-base), use `git diff <fixed-point>...HEAD` and `git log <fixed-point>..HEAD --oneline` for the committed range. Explicit path or subsystem requests select existing tests in that scope rather than requiring a diff. Resolve ambiguous ref/path arguments before proceeding.

Validate the required Git refs and capture the target once. A bad ref or empty change target stops here with an explanation; do not expand to the whole repository. In a repository without `HEAD`, ask for an explicit existing-test scope instead. Existing-test audits can run without Git, with history limits stated.

Select the task branch:

- **Existing-test audit**: audit the selected tests and the production behavior they exercise.
- **Test-change review**: audit changed tests, including deleted tests, against their previous versions; include relevant unchanged tests for production-only changes.
- **Suite audit**: only on an explicit suite request, read [SUITE.md](SUITE.md) for inventory, layer review, cost attribution, and resource isolation.

Finish with a bounded list of test locations, production owners, relevant supporting tests, and the comparison baseline when applicable. Read outside that list only to establish evidence; distinguish supporting context from audited scope.

### 2. Identify the contract sources

Locate user-supplied requirements, specs, issue references, repository contract documents, and relevant regression history. For change reviews, inspect the old tests and the production changes that prompted the test edits. Use configured tracker access when available; this skill does not require tracker setup.

For each protected commitment, identify the source and a concrete violating implementation. A current implementation or copied output is not an independent oracle. A literal expected value is not independent merely because it is hard-coded.

If sources are absent or inaccessible, continue with the evidence available and report **original intent unverified**. Distinguish documented commitments from inferred behavior; missing history is not proof that a test has no value. The Contract Preservation axis still reviews visible loss of boundaries and assertions.

Finish with source locations or explicit evidence gaps for every commitment under review.

### 3. Identify the standards sources

Find the repository's test conventions, relevant `AGENTS.md`, `CONTRIBUTING.md`, `CODING_STANDARDS.md`, test runner configuration, and CI routing. Read the selected tests, their production owners, real entry points, fixtures, and overlapping proof before classifying them.

Apply local conventions alongside this **test-quality baseline**. Cite local rules for hard violations and label baseline-only concerns as judgments; a documented exception can explain a design choice but does not establish fault detection:

- **Fault detection and stability**: name a plausible contract-breaking implementation the test rejects, and a contract-preserving refactor it should tolerate. Inspect whether the scenario reaches the relevant condition and whether its assertions observe the result.
- **Independent expected values**: trace expected results to a requirement, independent worked example, reference, or meaningful invariant. Distinguish fixtures that arrange a scenario from expected values derived from the calculation under test.
- **Numeric roles**: distinguish exact contract values, scenario inputs, incidental implementation values, and justified error/performance tolerances. Recommend assertion changes according to the role; widening a tolerance needs a contract-based reason.
- **Observation boundary**: check user/caller-visible outcomes, meaningful side effects, errors, transitions, and boundaries. Mock interaction may be a real external contract; a mock echo or internal helper count alone does not prove production behavior.
- **Failure-path validity**: judge assertions, not test names. Check that a negative case fails at the intended guard, not an earlier unrelated rejection; that fixtures do not supply the ordering or state the owner must produce; and that persistence assertions observe a store the exercised path actually writes. A capability flag alone does not prove the behavior it advertises. For no-effect/no-call claims, check a positive counterpart that demonstrates the same observation mechanism can see the effect; absent control evidence is a gap, not proof the test is worthless.
- **Retention bar**: retain independent proof of API, protocol, configuration, migration, storage, security, platform, default-value, packaging, or architecture commitments. Exact bytes, keys, paths, or observable ordering may themselves be contracts. Source inspection can be the cheapest independent guard when it detects a contract change but tolerates an identifier-only refactor. Static or slow alone is not a removal reason; a baseline failure may expose a product defect.
- **Production seams and dependencies**: check non-test callers before recommending removal of exports, wrappers, flags, or injection hooks maintained by tests. Distinguish obsolete test-only access from a legitimate dependency boundary. For claims about a dependency's behavior, inspect its source or types rather than treating a mock as evidence.
- **Distinct proof**: overlapping functions or coverage do not establish redundancy. A+B may protect wiring, ordering, persistence, or lifecycle risks that A and B cannot. Examine parameter interactions before reducing a matrix.
- **Cost evidence**: when cost is in scope, distinguish measured cost from suspicion and identify the responsible phase. A long timeout alone does not identify a performance defect. Use the suite reference for timing or concurrency analysis, including focused cost requests.

**Consolidation/deletion evidence gate:** record the exact test name and location, original detectable faults and unique boundaries, relevant history or its absence, and non-test callers of any affected production/support seam. Identify the retained test by exact location and how it carries the same premises, outcomes, and error paths; name any production/support simplification the recommendation would unlock without implementing it. If evidence is incomplete, report a candidate for investigation, not a safe removal. Equal coverage or a green remaining suite is insufficient. Without dynamic proof, state that safety remains a static judgment. A test with no legitimate independent commitment requires evidence for that conclusion, not an invented replacement test.

Finish with the standards list and baseline supplied to both reviewers; avoid reporting formatting or other issues already enforced by tooling.

### 4. Spawn both sub-agents in parallel

Dispatch both reviews together. Give each the captured target, comparison baseline, scoped test inventory and production owners, contract and standards sources, the baseline and evidence gate from step 3, the applicable suite reference, and the execution policy below. Share evidence, not the other reviewer's conclusions.

**Test Quality sub-agent brief:**

"Review every scoped test or changed test case against the quality baseline. Identify ineffective or over-coupled assertions, unsupported expected values, redundant proof, and evidenced costs where requested. For each finding, name the concrete faulty implementation or harmless refactor that exposes it. Recommend retain, repair, consolidate, deletion candidate, measure, or defer. Apply the consolidation/deletion evidence gate. Distinguish documented violations, static judgments, and observed results. Return concise findings with locations, source citations, risks, and validation limits; account for unreviewed scope explicitly."

**Contract Preservation sub-agent brief:**

"Independently trace each scoped test's protected commitments to their sources. For a test diff, compare old and new premises, outcomes, errors, and boundaries; distinguish authorized requirement changes from weakened proof or unsupported expected updates. For existing tests, assess what each proposed change would need to preserve. Check overlapping coverage and genuine integration risks. Apply the consolidation/deletion evidence gate. Report missing evidence rather than guessing intent. Return concise findings with locations, source citations, preservation risks, and validation limits; account for unreviewed scope explicitly."

**Execution policy:** static collection is the default. The coordinator may run relevant tests or timing commands after inspecting fixtures/scripts for filesystem, service, credential, process, and shared-state effects and establishing safe isolation. Reviewers request runs from the coordinator, avoiding competing measurements or shared-state execution. Preserve pre-existing changes; do not implement recommendations or write audit artifacts unless requested. Product bugs are separate findings, not reasons to change expected values.

Mutation requires explicit user authorization and an isolated disposable copy containing the audited source state. Specify a meaningful contract violation, establish the correct baseline, inject only that fault, confirm the path executes, and inspect whether the target behavioral assertion fails. Distinguish setup failures and equivalent mutants from detected regressions. Restore the exact injected change and rerun the correct baseline. A surviving mutant is actionable only if it violates the contract and reaches the tested path; catching one mutant does not establish completeness. Report blocked experiments without pretending they ran.

Finish when both reviews have returned and each scoped item is accounted for as reviewed or an explicit coverage gap. If independent sub-agents are unavailable, report that limit and perform two separate passes without claiming independent review.

### 5. Aggregate

Start with the target and reviewed scope. Present findings under `## Test Quality` and `## Contract Preservation`, verbatim or lightly cleaned. Keep the axes separate: cross-reference overlapping findings rather than merging or reranking them across axes.

Each finding includes severity (high: lost/false proof of a material commitment; medium: meaningful coupling, redundancy, or evidenced cost; low: localized maintenance risk), exact test/production locations, contract or standard source (or evidence gap), the concrete problem and evidence, recommended action, preservation risk, and executed validation or its absence. Separate uncertain candidates from substantiated findings. Do not force a finding for every test.

For suite audits, append the classification ledger and scope/cost/isolation evidence required by the suite reference. Report commands and observed results separately from proposed validation; label unmeasured benefits as unmeasured. Default to a conversational report, persisting it only if requested.

End with findings and worst issue **per axis**, plus validation limits and unreviewed scope. No combined score, deletion quota, or claim of complete protection from green tests alone.

## Why two axes

A robust assertion can enforce the wrong expectation; preserving an old assertion can preserve ineffective proof. Test Quality checks the proof mechanism. Contract Preservation checks the commitment and its continuity. Neither axis substitutes for the other.
