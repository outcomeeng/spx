# Known Issues: TypeScript validation

## TypeScript conventions ADR uses the legacy decision-record shape

`spx/41-validation.enabler/32-typescript-validation.enabler/21-typescript-conventions.adr.md`
uses the older ADR template with `## Purpose`, `## Context`, `## Decision`,
`## Trade-offs accepted`, and blanket `[review]` verification tags.

**Impact:** Future TypeScript validation changes can copy a deprecated decision
record structure if they treat this ADR as precedent.

**Tracking classification:** Tracked deferral, chosen by the operator while
planning the dependency-cruiser PR #199 completion slice on June 18, 2026.

**Revisit condition:** Migrate before editing the TypeScript conventions ADR or
before using it as a template for any new TypeScript validation decision record.

**Skills:** `spec-tree:contextualizing`, `spec-tree:authoring`,
`spec-tree:auditing-adr`, and `typescript:architect-typescript`.
