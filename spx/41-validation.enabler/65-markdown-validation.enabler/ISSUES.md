# Issues: 65-markdown-validation.enabler

## FOLLOW-UP: Mapping and Compliance assertions link to the scenario test

`markdown-validation.scenario.l1.test.ts` (renamed from the legacy `.unit` name) is a
single scenario loop, but `markdown-validation.md` links its Mapping assertions
(link-type resolution, enabled built-in rules) and Compliance assertions (no
side effects, never validate outside `spx/`/`docs/`) to it. A scenario test is not
mapping or compliance evidence.

**Resolution:** split dedicated `markdown-validation.mapping.l1.test.ts` and
`markdown-validation.compliance.l1.test.ts` out of the scenario loop and repoint
those assertions' `[test]` links. Fold this with the broader reclassification of
this node's `.integration`/`.e2e` tests tracked alongside the test-evidence-naming
enforcement rule.

**Skills:** `typescript:test-typescript`, `spec-tree:apply`.
