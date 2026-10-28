# Open Issues

## Command/domain boundary assigns config behavior to the command layer

`src/commands/config/` owns config output composition, validation success text, and config-file read sequencing. `src/domains/config/` owns Commander registration, dependency construction, stream writes, and process exit. The naming suggests the inverse boundary: command modules should stay close to CLI invocation, while domain modules should own reusable config behavior.

This mismatch makes config harder to compare with other domains and makes future domain logic easy to place in `src/commands/config/` by default. It also affects the validation domain, where some command modules contain the bulk of the validation pipeline behavior.

**Resolution:** Add or revise the command/domain architecture decision before moving code. The decision should define the CLI adapter boundary, the domain behavior boundary, dependency injection ownership, and the expected test level for each side. Then refactor config first as the pilot domain and apply the same rule to validation once the pilot passes `spx validation all`.

**Skills:** `spec-tree:align`, `typescript:architect-typescript`, `typescript:audit-typescript-architecture`, `typescript:test-typescript`, `typescript:code-typescript`, `typescript:audit-typescript`.

## Governing guides name the overlay as the Change store source `spx/16-config.enabler/config.md` `The orchestration and Change coordination contract uses this resolved binding` `AGENTS.md Change Lifecycle`

The assertion states that `spx/local/coordination.md` supplies no binding or fallback and orders the overlay's retirement after the consumer specifications move their store and Product reads to SPX. The Change Lifecycle section of `AGENTS.md` and `CLAUDE.md` and the `skill_sources` passage still direct a reader to `spx/local/coordination.md` for the store and the Product value. Until the guides move, a reader following them is told a different source of the binding than the assertion declares. The passages sit in the managed router block, which the product-tree template generates, so they change when that template moves; this node does not edit them.

**Resolution:** The entry settles when the product-tree template no longer names `spx/local/coordination.md` as the store and Product source and the regenerated guides carry that template, or when the consumer specifications have moved their store and Product reads to SPX and the overlay is retired.
