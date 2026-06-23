# Open Issues

## The diagnose-engine ADR's Verification section uses the legacy flat format

`spx/54-diagnose.enabler/13-diagnose-engine.adr.md` lists all its Verification rules in a flat `## Verification` block rather than under the `### Testing` / `### Eval` / `### Audit` subsections the decision-first ADR template prescribes.

**Evidence:** The `## Verification` section carries `[audit]`-tagged ALWAYS/NEVER rules with no subsection grouping. The canonical ADR template itself currently lists the subsections Audit-first, and reordering it to the decreasing-enforcement-strength order is an upstream fix already tracked in `spx/23-spec-tree.enabler/ISSUES.md`.

**Impact:** None to correctness — the rules and their `[audit]` tags are accurate. The format diverges from the current template, so every touch to this section is an opportunity to migrate it.

**Resolution:** When the upstream template-ordering fix in `spx/23-spec-tree.enabler/ISSUES.md` settles, migrate this ADR's `## Verification` rules into the prescribed `### Testing` / `### Audit` subsections in the same pass, so the migration follows the settled subsection order rather than guessing it while the template is in flux.
