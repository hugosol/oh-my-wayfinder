---
name: optimize-tests
description: "Find measured test bottlenecks and implement worthwhile, contract-preserving changes that create a safe optimization space."
disable-model-invocation: true
---

# Optimize Tests

**Measure first, deepen the bottleneck, then tune.** Optimize end-to-end feedback time while preserving what the selected tests prove. Isolation is an investment, not a goal: a finding may legitimately end with **keep as-is**.

## 1. Bound the workload

Identify the requested suite or subsystem, its actual runner/CI selection, and the end-to-end command whose latency matters. Include parameterized, generated, skipped, and quarantined cases in the selection account. Inspect repository guidance, relevant contracts, recent regressions, runner configuration, and existing fixtures.

Establish the source state and pre-existing changes. Before executing, inspect scripts and fixtures for filesystem, service, credential, subprocess, and shared-state effects. Coordinate exclusive use of shared resources; benchmark runs must not compete with other measurements. Use disposable resources where needed. A worktree alone does not isolate external resources.

Confirm ambiguous scope or execution permissions with the user. Preserve unrelated changes. Use source/configuration to establish runner isolation semantics; verify against installed-version documentation or implementation when necessary.

**Done:** record the selected workload, exclusions, source state, command, environment, execution precautions, and allowed modification scope. If execution is unsafe or unavailable, provide a measurement plan and stop short of claiming measured opportunities.

## 2. Measure and locate the cost

Run the unchanged workload to establish a baseline. Record outcomes, selected test identities/families, wall time, concurrency, cache conditions, and available phase/file/case timings. Use comparable repeated runs to establish variation; label a single run provisional. Existing reports can guide exploration but identify their source state and conditions.

Rank measured contributors, then inspect the expensive groups through their **seams**: where tests exercise a production interface and which observable commitments they protect. Trace enough of their fixtures and production owners to attribute cost to supported phases:

- discovery, imports, compilation, or initialization;
- worker, subprocess, or real-host startup;
- fixture/data/resource preparation;
- execution, polling, readiness, or business-time waits;
- teardown, contention, leaked work, or flaky reruns.

Distinguish cumulative test-body duration from end-to-end wall time. Concurrent durations cannot simply be added; reducing a non-critical task may not shorten the workload. Case count, maintenance cost, and runtime are separate objectives. Use focused runs to investigate, then validate savings against the original selection.

**Done:** identify the measured hotspots and their likely critical-path contribution, supporting locations, uncertainty, and unexplained cost. Narrow further work to promising hotspots rather than auditing every test for possible isolation.

## 3. Select a worthwhile opportunity

For each shortlisted hotspot, explain the cost mechanism and the smallest structural change that could address it. Consider existing isolation before building more. Candidate changes include bounded file-level parallelism, worker-level reuse of expensive resources, per-test mutable state, immutable prebuilt artifacts, completion signals, and controlled business clocks.

Compare candidates by expected wall-time benefit, implementation/maintenance cost, evidence strength, and preservation risk. Label estimates as estimates; account for resource saturation and the serial remainder. Reject or defer candidates whose likely benefit does not justify their complexity. A shorter profile is a separate feedback channel, not a speedup of the unchanged full gate.

Present the leading candidate with its scope, expected benefit, safety conditions, and validation cost. Obtain confirmation before implementing unless the current request already authorizes that scope. Changes to production interfaces, dependencies, or infrastructure need authorization when outside the agreed scope.

**Done:** select a justified candidate or conclude **keep as-is** with evidence. Avoid a deletion target, concurrency target, or required speedup invented in advance.

## 4. Construct the safe optimization space

For the selected candidate, write a compact **preservation map** in the conversation:

| Protected commitment and source | Required scenario/premises | Observable outcome and concrete detectable fault | Proposed change and preservation evidence |
|---|---|---|---|

Trace expected results to contracts, independent examples, or meaningful invariants. Distinguish documented commitments from inferred behavior and mark missing intent/history explicitly. The current implementation is not an independent oracle.

Use these judgments to design the structure:

- **Mechanism versus arrangement.** Identify whether time, paths, ordering, process separation, and real I/O are themselves under test or merely arrangement. Preserve the mechanism being proved. Controlled clocks suit business time; real I/O needs completion signals; a timeout-contract test must still exercise the relevant timeout behavior and cleanup.
- **Essential versus incidental sharing.** Separate unrelated tests, but retain sharing required by the scenario. Competing processes testing a lock must still contend for the same lock; independent databases would invalidate a database-race test.
- **Ownership and lifetime.** Inventory relevant files, data, ports, caches, globals, clocks, services, and background work: owner, namespace, mutability, lifetime, and cleanup. Follow every participant, including spawned hosts and separate connections. Share immutable setup or explicitly resettable expensive resources; isolate mutable state at the necessary granularity. Cleanup must respect other owners and cover failure/cancellation.
- **Observation and fault detection.** Preserve caller-visible outcomes, errors, ordering, persistence, recovery, and wiring relevant to the commitment. A mock replacement must not erase the mechanism. Negative observations need a positive control demonstrating that the observer could see the effect. Equal coverage, unchanged assertion counts, or green tests alone do not establish preservation.
- **Independent proof.** Overlapping code paths do not establish redundant tests. A+B may expose interaction faults absent from A and B. If consolidation/deletion is proposed, read the evidence gate in [test-audit](../test-audit/SKILL.md) and meet it before proceeding; reading the reference does not invoke its audit workflow.

Classify affected execution groups as already isolated, necessarily serial, or requiring structural isolation. Separate collision safety from throughput and capacity. Define which shared resources remain and what concurrency/cache/platform conditions are unverified.

Implement the smallest authorized change. Keep the original workload and commitments fixed: preserve meaningful scenarios, assertion strength, and test selection. Treat product defects separately rather than updating expected values to fit them. Retain a diagnostic serial path when introducing concurrency.

**Done:** the implemented structure has explicit ownership, preservation conditions, remaining risks, and a bounded set of tunable parameters. If a condition cannot be supported, narrow the optimization or defer it.

## 5. Validate preservation and benefit separately

Use the preservation map to inspect the before/after test and fixture changes, including unchanged tests affected by production/support changes. Run relevant correctness checks and the original workload. Account for test identity/selection changes, failures, skips, and quarantine changes; equal totals alone are insufficient.

Exercise the new failure-sensitive paths. For concurrency changes, use serial/parallel comparisons, repeated runs, and order variation where supported. Test cold initialization when shared caches/installations are involved, cleanup after failures, and relevant platform/load conditions within safe limits. Record limits rather than claiming race freedom from repeated green runs. Mutation experiments require explicit authorization and an isolated disposable copy; a useful probe must violate a commitment, reach its path, and fail at the intended behavioral assertion.

Measure end-to-end performance under comparable conditions, report variation, and distinguish startup/cache effects from repeatable savings. Bound concurrency by observed capacity rather than CPU count alone. Revert only this task's changes if the candidate fails preservation or offers unjustified benefit; preserve pre-existing work.

`test-audit` remains an independent audit-and-recommend workflow. Offer it for material test/fixture/observation changes or uncertain preservation; invoke it only with the user's authorization. Its findings are not manufactured by this implementation pass.

**Done:** report the retained change or rejection, exact commands and observed outcomes, before/after wall time, preservation evidence, resource limits, and untested conditions. Separate measured improvement from projected benefit and explicit evidence gaps.

## 6. Optional tuning handoff

When the user wants further search, hand the established structure to an available experiment engine such as autoresearch. Supply the fixed workload and measurement protocol, allowed files and parameter ranges, resource limits, preservation map, executable correctness gates, and unresolved risks. Verify the installed engine's workflow before configuring it; this skill does not implicitly start an autonomous loop.

Correctness and preserved proof are hard gates, not secondary metrics that faster execution may outweigh. Keep benchmark selection and acceptance criteria stable across comparable trials; a changed protocol needs a new baseline. Semantic/fixture changes require preservation review beyond executable checks. Use an isolated clean branch/worktree, explicit iteration/time limits, and authorized rollback scope for engines that commit or revert changes.

**Done:** deliver a bounded handoff or finish with the validated structural improvement. A reusable optimization space is valuable even when no further parameter search is warranted.
