# to-tickets

## to-tickets/SKILL.md

### local-path

Local tickets land in `implementation/` rather than upstream's `issues/`.

```diff
-- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
+- **Local files** → write one file per ticket under `.scratch/<feature-slug>/implementation/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below: one ticket per file, never a single combined file.
```
