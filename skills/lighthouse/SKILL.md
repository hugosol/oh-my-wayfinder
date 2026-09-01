---
name: lighthouse
description: "Produce a lighthouse document from a resolved wayfinder ticket: decision, user stories, preconditions, postconditions, and invariants, so that backtracer can trace signals across the map. Use after a wayfinder ticket is resolved."
---

After a wayfinder ticket is resolved (the decision is made), create a lighthouse document from the decision ticket body and the grilling conversation. A lighthouse document is the single source of truth for what was decided, why, and what it constrains. Backtracer traces the "so that" clauses and pattern statements in this document across the map to surface gaps.

Do NOT interview the user. Just synthesize what you already know from the decision ticket and the conversation. The decision has been made; your job is to capture it, not to reopen it.

## Process

### 1. Read the decision ticket

Read the decision ticket body. The `## 问题` section contains the original question, known constraints, and the issues that needed decisions. Carry these forward verbatim into the lighthouse document. This is the permanent record of what was asked.

### 2. Read the conversation

Read the grilling conversation. Extract the key conclusions for each issue discussed: what was decided, why, and what alternatives were rejected. Write these as the `## 讨论结果` section, with one subsection per issue.

### 3. Produce the lighthouse document

Write the document to `lighthouse/<NN>-<slug>.md`. Use this template:

<lighthouse-template>

# NN: 标题：决策灯塔

> 问题与讨论: [NN: 标题](../decision/NN-<slug>.md)

## 问题

<从 decision ticket body 的 `## 问题` 搬运，包括 `### 已知约束` 和 `### 待决议题`>

## 讨论结果

<从 grilling 对话中提取，逐议题回答>

### <议题 1>

<结论：选了什么、为什么、拒绝了什么>

### <议题 2>

<结论>

---

## 决策

<一两句话：决定了什么。Map Decisions-so-far 的一行摘要。>

## 用户故事

A numbered list of user stories in to-spec format:

1. As a <actor>, I want a <feature>, so that <benefit>
2. As a <actor>, I want a <feature>, so that <benefit>

Capture every need and design preference that surfaced during the discussion: not just user-facing features, but also developer constraints and design intents. The "so that" clause is the signal backtracer traces.

## 前置条件

- <What must already be true for this decision to hold? What does this decision depend on? Data? Other tickets? Existing modules?>
- <List every dependency. If this decision can't be acted on until another ticket is resolved, name it.>

## 后置条件

- <What does this decision guarantee? What constraints does it place on other tickets?>
- <List every guarantee. These are the promises downstream tickets can rely on.>

## 不变量

- <What never changes? Patterns that must be preserved?>
- <What existing modules or conventions does this align with?>
- <Be specific about pattern alignment. Name the existing module. Backtracer uses these statements to check peer symmetry.>

</lighthouse-template>

### 4. Confirm and post

Present the draft to the user. Ask: "Does this capture the decision correctly? Any missing user stories or invariants?" Iterate until confirmed.

Once confirmed, the document is ready. The calling skill (typically wayfinder) writes it to `lighthouse/`, closes the decision ticket, and updates the map.
