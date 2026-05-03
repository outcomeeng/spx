# Open Issues

## `fileInclusion` config section silently ignores user-supplied values

`src/lib/file-inclusion/config.ts` `validate` accepts a non-empty `fileInclusion` section from `spx.config.yaml` but always returns `defaults` without merging or warning. A user who adds `fileInclusion` keys to their project config sees no diagnostic and their settings have no effect.

The inline code comment documents the intent ("deep merging requires a schema, tracked as a future enhancement"), but a user reading the YAML has no indication their config is ignored.

**Resolution:** When `validate` receives a non-empty object, emit a diagnostic warning before returning defaults. Implement deep merging once the schema is stable.

**Skill:** `spec-tree:authoring` to extend the spec assertion and `typescript:coding-typescript` to implement.
