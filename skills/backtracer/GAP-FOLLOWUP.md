# Gap follow-up

- **Batch**: for the question batch supplied by the caller, ask once: grill in the current conversation, or create one ticket? Use an explicit choice already given; no questions means no mode prompt.
- **Grill now**: immediately load and execute /grilling with the whole batch and existing context when the user chooses to continue. Let grilling own the interview. Confirmed results go through /lighthouse and into affected ticket/map records; return to the caller to refresh its handoff, without starting another pause. No new ticket is needed.
- **One ticket**: put all questions and their evidence in one open grilling decision ticket. Follow the tracker conventions for linking and dependencies, then hand off for later discussion.
- **Outcomes**: distinguish resolved, declined, and deferred questions. During a pause or switch, hand unresolved findings to suitable existing tickets rather than forcing another interview; an unowned remainder still uses the batch choice. A ticket is a handoff, not a resolution; explicit in-scope deferrals belong in **Not yet specified**.
