# Open Issues

## `validateLiteralReuse` silently skips EXCLUDE'd test files

`validateLiteralReuse` in `src/validation/literal/index.ts` calls `resolveScope` and then filters on `scope.included` only. TypeScript test files inside EXCLUDE'd spec-tree nodes (e.g. `spx/23-spec-tree.enabler/tests/*.ts`) land in `scope.excluded` and are never passed to the literal detector.

Those test files are real — `spx/EXCLUDE` marks nodes where implementation is absent but tests exist. If an EXCLUDE'd test file reuses a literal from a source file in `src/`, the reuse check misses it entirely with no diagnostic.

The correct fix is for `validateLiteralReuse` to use TypeScript files from both `scope.included` and `scope.excluded` rather than only `scope.included`. Callers that intentionally skip EXCLUDE'd files (test runners, quality gates) are a separate concern and should not influence how the literal detector aggregates its candidate set.

**Note:** Walk-time pruning of EXCLUDE'd directories is not a valid optimization path. The spec-tree library's analysis role requires `ScopeResult.excluded` to be populated with per-path decision trails; pruning would deprive analysis callers of that data.

**Skill:** `spec-tree:authoring` to extend the scope-resolver spec assertion and `typescript:coding-typescript` to fix the `validateLiteralReuse` candidate-file collection.

## `fileInclusion` config section silently ignores user-supplied values

`src/lib/file-inclusion/config.ts` `validate` accepts a non-empty `fileInclusion` section from `spx.config.yaml` but always returns `defaults` without merging or warning. A user who adds `fileInclusion` keys to their project config sees no diagnostic and their settings have no effect.

The inline code comment documents the intent ("deep merging requires a schema, tracked as a future enhancement"), but a user reading the YAML has no indication their config is ignored.

**Resolution:** When `validate` receives a non-empty object, emit a diagnostic warning before returning defaults. Implement deep merging once the schema is stable.

**Skill:** `spec-tree:authoring` to extend the spec assertion and `typescript:coding-typescript` to implement.
