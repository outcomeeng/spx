# Issues: Path Predicates

## FOLLOW-UP: reconcile predicate assertions with current evidence

`spx/17-file-inclusion.enabler/32-path-predicates.enabler/path-predicates.md` links scenario assertions to `tests/git-tracking.scenario.l1.test.ts` and `tests/domain-path-filter.scenario.l1.test.ts`, but those files do not exist. Existing co-located tests exercise `ignoreSourcePredicate`, `artifactDirectoryPredicate`, and `hiddenPrefixPredicate`, while `spx/17-file-inclusion.enabler/32-path-predicates.enabler/21-predicate-shape.adr.md` declares git-tracking and domain-path-filter predicates and rejects artifact-directory and hidden-prefix predicates.

**Resolution:** align this node's tests and implementation with the current path-predicates spec and ADR, then remove `17-file-inclusion.enabler/32-path-predicates.enabler` from `spx/EXCLUDE` once the linked evidence files exist and pass.

**Evidence:** `spx/17-file-inclusion.enabler/32-path-predicates.enabler/path-predicates.md`; `spx/17-file-inclusion.enabler/32-path-predicates.enabler/21-predicate-shape.adr.md`; `spx/17-file-inclusion.enabler/32-path-predicates.enabler/tests/`; `spx/EXCLUDE`.
