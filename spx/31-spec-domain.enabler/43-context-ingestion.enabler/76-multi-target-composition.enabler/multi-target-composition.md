---
malleability: spec
---

# Multi-Target Composition

PROVIDES canonical composition and caller-declared incremental suppression across product, methodology, and one or more target projections
SO THAT agents adding targets within one conversation window
CAN receive every newly required entry once, upgrade Digest entries to Full, and reload complete context after compaction without a persisted receipt

## Assertions

- SPX resolves every requested and loaded target, computes each complete projection and transitive citation closure, merges entries by canonical identity, applies Full-over-Digest precedence, and only then suppresses already-present entries.
- Target and loaded-declaration order never changes the remaining entry order; shared documents and references appear once.
- `--loaded-product` reconstructs the complete targetless projection, and each `--loaded-target <path>` reconstructs that target's complete projection at every entry's selected mode.
- Suppression applies to targeted and targetless calls. Prior Full satisfies Full or Digest; prior Digest satisfies only Digest; a prior targetless decision reference satisfies only the same reference and never satisfies Full.
- Loaded declarations may appear without requested targets, repeat declarations are deduplicated, and a target may also appear as loaded; a fully suppressed projection succeeds with empty text or `{ "entries": [] }`.
- A changed covered entry invalidates every declaration whose projection contains it; after compaction the caller supplies no loaded declaration and requests every target the continuing work requires.
- `--loaded-methodology` affects only methodology content, while `--loaded-product` and `--loaded-target` affect product entries. `--methodology --loaded-product` is valid.
- Any requested or loaded target failure or any selected document failure aborts the whole projection before output.
