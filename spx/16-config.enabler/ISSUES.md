# Open Issues

## Command/domain boundary assigns config behavior to the command layer

`src/commands/config/` owns config output composition, validation success text, and config-file read sequencing. `src/domains/config/` owns Commander registration, dependency construction, stream writes, and process exit. The naming suggests the inverse boundary: command modules should stay close to CLI invocation, while domain modules should own reusable config behavior.

This mismatch makes config harder to compare with other domains and makes future domain logic easy to place in `src/commands/config/` by default. It also affects the validation domain, where some command modules contain the bulk of the validation pipeline behavior.

**Resolution:** Add or revise the command/domain architecture decision before moving code. The decision should define the CLI adapter boundary, the domain behavior boundary, dependency injection ownership, and the expected test level for each side. Then refactor config first as the pilot domain and apply the same rule to validation once the pilot passes `spx validation all`.

**Skills:** `spec-tree:align`, `typescript:architect-typescript`, `typescript:audit-typescript-architecture`, `typescript:test-typescript`, `typescript:code-typescript`, `typescript:audit-typescript`.
