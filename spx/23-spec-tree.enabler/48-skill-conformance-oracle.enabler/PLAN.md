# Plan: Skill Conformance Oracle

## Deferred: eval-lane assertion

The spec deliberately omits an `[eval]` assertion for the oracle itself. The
intended eval — run a skill operation and score whether every file it produced
maps to the valid verdict — requires the recognition implementation to exist
before it can be authored as a testable eval-lane spec assertion.

Add the `[eval]` assertion and its harness after the recognition tests pass.

## Next steps

1. Invoke `/spec-tree:applying spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler`
   from Step 2 (architecture: does a new ADR scope recognition-engine design?).
2. Write tests in `tests/` (Step 5 of `/applying`).
3. Implement the recognizer in `src/lib/spec-tree/`.
4. Run audit gates, then add the deferred `[eval]` assertion.
