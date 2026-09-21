---
malleability: spec
---

# Multi-Target Composition

PROVIDES canonical composition and caller-declared incremental suppression across product, methodology, and one or more target projections
SO THAT agents adding targets within one conversation window
CAN receive every newly required entry once, upgrade Digest entries to Full, and reload complete context after compaction without a persisted receipt

## Assertions

### Scenarios

- SPX resolves every requested and loaded target, computes each complete projection and transitive citation closure, merges entries by canonical identity, applies Full-over-Digest precedence, and only then suppresses already-present entries. ([test](tests/multi-target-composition.scenario.l1.test.ts))
- `--loaded-product` reconstructs the complete targetless projection, and each `--loaded-target <path>` reconstructs that target's complete projection at every entry's selected mode. ([test](tests/multi-target-composition.scenario.l1.test.ts))
- Loaded declarations may appear without requested targets, repeat declarations are deduplicated, and a target may also appear as loaded; a fully suppressed projection succeeds with empty text or `{ "entries": [] }`. ([test](tests/multi-target-composition.scenario.l1.test.ts))

### Mappings

- Suppression applies to targeted and targetless calls. Prior Full satisfies Full or Digest; prior Digest satisfies only Digest. ([test](tests/multi-target-composition.mapping.l1.test.ts))

### Properties

- Target and loaded-declaration order never changes the remaining entry order; shared documents and references appear once. ([test](tests/multi-target-composition.property.l1.test.ts))

### Compliance

- A changed covered entry invalidates every declaration whose projection contains it; after compaction the caller supplies no loaded declaration and requests every target the continuing work requires. ([test](tests/multi-target-composition.compliance.l1.test.ts))
- `--loaded-methodology` affects only methodology content, while `--loaded-product` and `--loaded-target` affect product entries. `--methodology --loaded-product` is valid. ([test](tests/multi-target-composition.compliance.l1.test.ts))
- Any requested or loaded target failure or any selected document failure aborts the whole projection before output. ([test](tests/multi-target-composition.compliance.l1.test.ts))
