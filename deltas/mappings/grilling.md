# grilling

## grilling/SKILL.md

### reasons-to-constraints

Turn the user's reasons into an explicit opportunity for broader authorization, not automatic policy. When those reasons support a common priority across pending decisions, the agent synthesizes a candidate constraint, recommends its adoption, and shows its scope, consequences and which decisions it would answer. The user owns the promotion from inferred tendency to governing constraint. Once authorized, apply it to each covered node; continue asking about exceptions and uncertain applications rather than dropping decision-tree coverage.

This is the only behavior change in this experiment. Preserve upstream frontier-sized rounds, recommendations, fact/decision ownership and the final confirmation gate. Providing reasons is a user practice, not a new opening reminder, required answer format or per-question demand. A local explanation alone does not require a proposal; propose when it can resolve multiple pending decisions. Rejection leaves those decisions to ordinary grilling, and existing decisions change only with the user's explicit authorization. Publication under Wayfinder continues through its existing boundaries; this op adds no persistence or cross-ticket mutation protocol.

```op
anchor: |-
  Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.
  <oh-my-wayfinder:insert>
insert: |-

  Synthesize recurring reasons behind the user's answers into a candidate constraint and recommend adopting it when it would answer multiple pending decisions. State its scope, tradeoffs and affected decisions; await approval before applying it or revising prior decisions. Explicit user constraints already authorize application. Check each covered node, asking about exceptions and uncertain applications.
```
