# Gap follow-up

- **Batch**: for the question batch supplied by the caller, ask once: grill in the current conversation, or create one ticket? Use an explicit choice already given; no questions means no mode prompt.
- **Grill now**: immediately load and execute /grilling with the whole batch and existing context. Let grilling own the interview. After confirmation, record the outcomes in the affected decisions, lighthouse documents, and map; no new ticket is needed.
- **One ticket**: put all questions and their evidence in one open grilling decision ticket. Follow the tracker conventions for linking and dependencies, then hand off for later discussion.
- **Outcomes**: distinguish resolved, declined, and deferred questions. A ticket is a handoff, not a resolution; explicit in-scope deferrals belong in **Not yet specified**.
