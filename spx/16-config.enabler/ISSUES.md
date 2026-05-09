# Open Issues

## Command/domain boundary assigns config behavior to the command layer

`src/commands/config/` owns config output composition, validation success text, and config-file read sequencing. `src/domains/config/` owns Commander registration, dependency construction, stream writes, and process exit. The naming suggests the inverse boundary: command modules should stay close to CLI invocation, while domain modules should own reusable config behavior.

This mismatch makes config harder to compare with other domains and makes future domain logic easy to place in `src/commands/config/` by default. It also affects the validation domain, where some command modules contain the bulk of the validation pipeline behavior.

**Resolution:** Add or revise the command/domain architecture decision before moving code. The decision should define the CLI adapter boundary, the domain behavior boundary, dependency injection ownership, and the expected test level for each side. Then refactor config first as the pilot domain and apply the same rule to validation once the pilot passes `spx validation all`.

**Skills:** `spec-tree:aligning`, `typescript:architecting-typescript`, `typescript:auditing-typescript-architecture`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript`.

---

## Descriptor placement wording does not match validation layout

`21-descriptor-registration.adr.md` says each configurable domain declares a
descriptor at `src/<domain>/config.ts`. Validation declares its production
descriptor at `src/validation/config/descriptor.ts`, and `src/config/registry.ts`
imports that nested module.

The nested module is coherent with validation's internal config package, but the
architecture text names a flatter path than the runtime uses.

**Impact:** new domain descriptors can follow either the written path rule or
the validation precedent, producing avoidable drift in descriptor placement.

**Resolution:** During the command/domain boundary architecture pass, decide the
descriptor module convention explicitly. Either move validation to the flat
`src/validation/config.ts` shape or revise the ADR to allow
`src/<domain>/config/descriptor.ts` when a domain has a config package.

**Skills:** `spec-tree:aligning`, `typescript:architecting-typescript`,
`typescript:auditing-typescript-architecture`.
