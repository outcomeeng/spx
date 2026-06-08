# Skill Conformance Oracle

PROVIDES a context-aware binary recognizer that classifies every path inside `spx/` as valid (a path a skill-driven operation produces) or foreign (a path no recognized Spec-Tree form covers), covering node directories, decision records, product files, evidence files, spec files, coordination notes, eval-lane directories, and the exclusion registry
SO THAT eval-lane assertions and any consumer that validates a materialized spec tree
CAN determine which paths are skill-produced without owning grammar vocabulary or placement rules themselves

## Assertions

### Mappings

- All recognized Spec-Tree path forms — node directories, decision records, product files, evidence files, spec files, coordination notes (`PLAN.md`, `ISSUES.md`), eval-lane directories (`evals/{rule}/`), and `spx/EXCLUDE` — map to the valid verdict; every path that matches no recognized form maps to foreign ([test](tests/skill-conformance-oracle.mapping.l1.test.ts))
- A spec file is valid when its slug matches the parent node directory slug and foreign when the slug differs ([test](tests/spec-file.mapping.l1.test.ts))

### Properties

- Classification is exhaustive and binary: every path receives exactly one verdict, valid or foreign ([test](tests/skill-conformance-oracle.property.l1.test.ts))

### Compliance

- ALWAYS: the oracle's recognized-form set derives entirely from the grammar vocabulary in `spx/23-spec-tree.enabler/29-filename-grammar.enabler`; no form is hard-coded outside the grammar ([audit])
- NEVER: a path matching any recognized form is classified foreign ([test](tests/skill-conformance-oracle.compliance.l1.test.ts))
