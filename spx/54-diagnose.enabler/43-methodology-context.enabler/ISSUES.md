# Open Issues

## The check reads coding-agent plugin caches

**Evidence:** `methodology-context.md` line 22: "methodology version cache
resolution reads supported local agent caches, uses the configured exact
version when present, reports the highest numeric dotted installed version
when the configured exact version is missing." `src/commands/diagnose/probes.ts`
composes `~/.claude/plugins/cache/` and `~/.codex/plugins/cache/` joined with
`methodology.source` split on `/`, and matches `methodology.version` against
the directory names found there. `methodology.source` is an
`owner/repository` identifier of the methodology repository;
`methodology.version` is a methodology version; the directories are plugin
versions of a marketplace/plugin coordinate. The match held only while
`source` was `outcomeeng/spec-tree`, which coincided with the `outcomeeng`
marketplace's `spec-tree` plugin.

**Impact:** the check reads user-scope agent state spx never reads, compares
two unrelated numbering schemes, and reports `version-mismatch` or
`unavailable` for every correct declaration.

**Settlement condition:** the assertion on line 22 and the
`version-mismatch` and `bootstrap-identity` verdicts are removed; the check
reports the declared `version` and `migratingFrom`, whether spx ships a tree
for the declared line and each enabled coding agent, and the result of the
`provides` and `supports` check against the declaration; the probe reads
spx's package root and the product's config, and no path under a coding
agent's home.
