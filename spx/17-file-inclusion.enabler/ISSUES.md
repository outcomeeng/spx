# Open Issues

## Walk-time EXCLUDE pruning efficiency

`collectPaths` in `src/lib/file-inclusion/pipeline.ts` descends into every directory except artifact directories. EXCLUDE-listed spec-tree nodes are traversed in full; files inside them are added to `allPaths` and subsequently placed in `ScopeResult.excluded` with a decision trail by the ignore-source predicate.

The old `walkTypescriptFiles` (before this enabler shipped) short-circuited at EXCLUDE'd directory boundaries, avoiding the descent entirely. The new design is spec-correct — `file-inclusion.md` asserts that excluded paths carry a decision trail — but pays the traversal cost for every EXCLUDE'd node.

**Impact:** `validateLiteralReuse` reads only `scope.included`, so it traverses EXCLUDE'd directories to produce `excluded` entries that it then ignores. For repos with large EXCLUDE'd subtrees (e.g. `21-core-cli.capability` with ~30 `.story` directories and hundreds of test files), this is a measurable overhead on every literal-validation invocation.

**Options:**

1. Add a `collectPathsIncludedOnly` variant that prunes EXCLUDE'd directories but does not populate `excluded` — for callers that only need `scope.included`.
2. Extend the spec to allow an opt-in "shallow walk" mode that skips decision-trail generation for excluded directories in exchange for not visiting them.
3. Accept the current overhead until the EXCLUDE list is small enough that the cost is negligible.

**Prerequisite:** Any walk-time pruning must be reconciled with the spec assertion ("each excluded path carries a decision trail") before implementation.

**Skill:** `spec-tree:aligning` to audit the trade-off, then `spec-tree:authoring` if the spec assertion changes.

## `fileInclusion` config section silently ignores user-supplied values

`src/lib/file-inclusion/config.ts` `validate` accepts a non-empty `fileInclusion` section from `spx.config.yaml` but always returns `defaults` without merging or warning. A user who adds `fileInclusion` keys to their project config sees no diagnostic and their settings have no effect.

The inline code comment documents the intent ("deep merging requires a schema, tracked as a future enhancement"), but a user reading the YAML has no indication their config is ignored.

**Resolution:** When `validate` receives a non-empty object, emit a diagnostic warning before returning defaults. Implement deep merging once the schema is stable.

**Skill:** `spec-tree:authoring` to extend the spec assertion and `typescript:coding-typescript` to implement.
