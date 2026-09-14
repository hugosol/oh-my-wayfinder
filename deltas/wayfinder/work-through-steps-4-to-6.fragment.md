4. Write the discussion results to the decision ticket body. Then call the Skill tool with "lighthouse". This is MANDATORY and NON-BYPASSABLE. Close the decision ticket, and append a context pointer to the map's Decisions-so-far.
   - The `lighthouse` skill reads the decision ticket body and the conversation context; confirm the draft with the user, then write it to `lighthouse/<NN>-<slug>.md`.
   - If `lighthouse` is unavailable, STOP. Do not proceed.
   - The one-line gist for the map's Decisions-so-far comes from the `## Decision` field.
5. **Call the Skill tool with "backtracer".** This is MANDATORY and NON-BYPASSABLE.
   - Backtracer reads the map, decision tickets, and lighthouse documents, checks coverage and symmetry, and reports gaps.
   - The user confirms which gaps become new tickets.
   - If `backtracer` is unavailable, STOP. Do not proceed.
6. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. This includes any tickets backtracer surfaced and the user confirmed. If the answer reveals that a ticket (this one or another) sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
