---
name: traverse
description: "Walk the full design tree of a completed wayfinder map: checking dependencies, peer symmetry, layer integrity, and boundary completeness, to surface gaps before to-spec. Use after all wayfinder tickets are resolved, or whenever the map should be audited end-to-end."
---

All the facts are already in the map, the decision ticket bodies, and the lighthouse documents. Traverse reads them all, builds the design tree, and walks every branch to find gaps: things the map needs but no ticket covers. Only ask the user about gaps the documents can't resolve.

Do not act on it until the user confirms the gaps.

## Invocation

User invokes with a wayfinder map (URL or number). All tickets must be resolved; traverse is a final audit, not a mid-process check.

## Process

### 1. Load all sources

Load the wayfinder map (label `wayfinder:map`). Read the map body. Then read every child issue: for each resolved ticket, read its decision ticket body and its lighthouse document. Lighthouse documents should follow /lighthouse's format; if one doesn't, still read what's there.

Completion criterion: map body + every decision ticket body + every lighthouse document loaded.

### 2. Build the design tree

From these sources, build the tree. Every ticket is a node. The tree has four kinds of edges:

- **Dependency edges**: from lighthouse Preconditions. If ticket A's Precondition says "needs X" and ticket B's Postcondition says "provides X", draw A → B.
- **Pattern edges**: from lighthouse Invariants. If ticket A says "follows the same conventions as daily engine", draw A → daily engine (the existing pattern).
- **Layer edges**: from decision ticket bodies. Group tickets by their claimed layer: engine, strategy, config, output, scan.
- **Boundary edges**: between tickets whose bodies describe adjacent concerns. If ticket 03 defines a strategy interface and ticket 09 defines a config format, they share a boundary at "strategy configuration".

Nodes without outgoing dependency edges are missing their prerequisites.

Completion criterion: every ticket placed as a node. All four edge types drawn.

### 3. Walk the tree

Four checks, applied to every node:

**Dependency check.** For each node, walk its dependency edges. Every dependency must land on a node that provides it. A dependency with no provider → **gap**. Ask: the Postcondition "provides X" doesn't appear in any lighthouse document. Does X need a ticket?

**Peer symmetry check.** For each pattern edge, collect the surface items of the pattern (from existing codebase: files, scripts, configs, dashboard entries). Collect the surface items claimed by the new node's tickets. Items in the pattern but not in the new node → **gap**. Most peers are found by reading the repository; only ask the user when the pattern's surface is ambiguous.

**Layer integrity check.** For each node, compare its claimed layer against its body content. A node in the scan layer whose body describes engine-level loops → **violation**. Report it. No question is needed; the document evidence is clear.

**Boundary check.** For each pair of adjacent nodes, check whether their interface is covered. Ticket 03 defines a strategy interface, ticket 09 defines config: is the handoff (how strategy reads config) covered by either ticket? If not → **gap**.

Look up every fact from the documents first. Only ask the user when a gap genuinely can't be resolved from what's already written.

Completion criterion: every node checked against all four checks.

### 4. Report gaps

Present the gaps one at a time. For each:

- State the gap: what's missing, which nodes are involved, which check found it.
- If the documents resolve it (a ticket already covers it but was missed by the tree), state that and move on.
- If the documents don't resolve it, ask: "Create a ticket for this?"

The user responds with: **Yes** (create ticket), **No** (record reason), or **Fog** (add to Not yet specified).

After all gaps are resolved, the map is ready for to-spec.

Completion criterion: every gap in one of three terminal states.
