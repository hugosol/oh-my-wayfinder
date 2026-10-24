# Suite, Cost, and Isolation Audit

Read this for an explicit suite audit, or for timing/concurrency analysis within a focused scope. The parent skill owns the dual-axis reviews, evidence gate, execution permissions, and report format. This reference adds suite-specific evidence; it does not authorize cleanup or experiments.

## Inventory and layer review

1. **Bound the suite.** Discover test selection from runner configuration and CI routing, including skipped, quarantined, generated, and parameterized cases. Record the declared scope and exclusions. Group tests by production responsibility and observable commitment, not just filename. Finish when every discovered scoped test case has an inventory entry; represent parameterized families together only when their risk distinctions remain explicit.
2. **Classify every entry.** Use `retain`, `repair`, `consolidate`, `deletion candidate`, or `insufficient evidence`. Record location, commitment and source, detectable fault, observation boundary, overlapping proof, proposed action, and evidence gaps. Retain is a reasoned disposition, not a default for unread tests. A consolidation entry also names the retained test and any unique assertions or scenarios that must migrate. Apply the parent's evidence gate before recommending removal. Finish with no unaccounted inventory entries; unavailable cases remain explicit gaps.
3. **Review the layers.** After the per-test pass, map each commitment to its primary proof location. Identify repeated layers without independent risks, and preserve unique wiring, authorization, lifecycle, persistence, or recovery checks. A+B is redundant only when retained proof reaches the same failure mechanisms. Prefer proof through the real owner/transport with controlled external I/O over a mocked collaborator when wiring or delivery is the claimed contract. For parameter matrices, record which distinct risks require each axis or interaction; seeing every value once does not establish interaction coverage. Finish with a rationale for every proposed consolidation and every retained overlapping layer.

Both reviewers receive the same inventory and independently assess their axis. For consolidation/deletion proposals and test diffs, compare displaced commitments with the named keepers, including newly added or moved assertions: identify any commitment losing its only proof and any assertion whose target path cannot execute. If the keeper does not carry the displaced assertions unchanged, require a concrete owner-level fault for proposed preservation validation rather than visual similarity; any mutation remains subject to the parent's authorization policy. Note CI selection changes needed for moved keepers so a valid but unselected test is not counted as executed protection. The coordinator reconciles ledger discrepancies using cited evidence, retaining unresolved items as `insufficient evidence`; disagreements are not resolved by silently dropping one review's concern.

## Cost attribution

When execution is safe and relevant, record a reproducible baseline: audited source state, exact command and selection, runner/concurrency settings, environment, cache conditions, per-run outcomes, and wall time. Prefer existing runner reports; inspect scripts before using them. Check measurements against CI's actual file/process/worker isolation model before projecting suite savings from isolated file runs. If execution is unavailable, report the missing baseline and a concrete measurement plan rather than a measured ranking.

Attribute cost to the phases that evidence supports:

- discovery, imports, transpilation, and initialization;
- worker, subprocess, or real-host startup;
- fixture and resource preparation;
- business execution, retries, polling, or event waits;
- teardown, process exit, resource contention, and reruns caused by flakiness.

Record per-file and per-case measurements where available, but report end-to-end wall time too: overlapping concurrent durations cannot simply be summed. Distinguish cold and warm conditions; use comparable repeated runs and report observed variation for performance comparisons. Keep test-count changes, maintenance burden, and feedback latency as separate claims. This audit recommends optimizations; it does not implement them to manufacture a before/after result.

For long waits, distinguish business-time rules, real I/O/readiness, the timeout contract itself, and unintended hangs. Recommend controlled clocks for business time, real completion signals for I/O, or a supported shorter timeout budget that preserves cancellation/error/cleanup checks. Investigate missing events or leaked processes instead of treating a shorter timeout as a fix. Mocking away the mechanism under review is not performance-preserving proof.

Finish with an evidence-backed cost distribution or explicit measurement gaps, and recommendations tied to the responsible phase. Do not promise a speedup from deleting cases or enabling parallelism without measurement.

## Resource isolation

Before proposing execution groups, inventory shared resources and their ownership, naming, lifetime, and cleanup:

- files, temporary directories, database rows, and storage keys;
- fixed ports, sockets, services, and external accounts;
- environment variables, working directories, global mocks, module singletons, and clocks;
- user configuration, credentials, real-host state, and shared caches;
- subprocesses, timers, background tasks, and teardown;
- CPU/GPU, memory, and disk contention.

Classify groups as isolated and eligible for bounded concurrency, necessarily serial because of shared resources, or requiring structural isolation first. Separate collision safety from throughput: resource isolation does not ensure a faster run. Parallel review does not authorize parallel test execution or simultaneous source mutation. A successful serial run and one parallel run do not prove race freedom.

Finish with proposed groups, the evidence for their boundaries, unresolved conflicts, and a safe validation plan. Mark unexercised concurrency as unverified; do not enable it.

## Report additions

For a suite audit, append the per-test classification ledger, then the layer-level preservation plan. Include baseline outcomes and cost/resource evidence when collected; otherwise state what remains unmeasured or unverified. For a focused timing/concurrency request, report only the applicable measurements and resource analysis rather than expanding to a full-suite ledger.

For each proposed consolidation/deletion, name where unique proof would live after the change and the concrete fault a future validation should inject or reproduce. A plan is not an executed preservation result. Keep the ledger in the conversation unless the user requests a saved artifact; it is not a permanent handwritten mirror of the suite.
