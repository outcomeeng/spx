# Product Directory API

PROVIDES product-root, effective-invocation-directory, and Git common-dir product-root vocabulary for config APIs, CLI invocation, and tests
SO THAT config consumers, harnesses, and execution descriptors
CAN refer to tracked product files through `productDir` and gitignored state through the Git common-dir product root

## Assertions

### Properties

- `spx -C <path> config show --json` maps to the same resolved Config as `spx config show --json` invoked from `<path>` ([test](tests/product-context.property.l1.test.ts))
- `spx -C <path> validation typescript --scope full` maps to the same validation result as `spx validation typescript --scope full` invoked from `<path>` ([test](tests/product-context.property.l1.test.ts))
- `spx -C <path> session list --json` maps to the same session-store result as `spx session list --json` invoked from `<path>` ([test](tests/product-context.property.l1.test.ts))
- Absent `-C`, config CLI product context maps from the invoking process directory and preserves the non-git fallback warning ([test](tests/product-context.property.l1.test.ts))

### Compliance

- ALWAYS: config APIs, test harnesses, and descriptor tests name the tracked product root `productDir` ([test](tests/product-directory-api.compliance.l1.test.ts))
- ALWAYS: root-directory APIs expose `productDir` rather than `projectRoot` or `projectDir` ([test](tests/product-directory-api.compliance.l1.test.ts))
- ALWAYS: a config command invoked from a dirty unrelated worktree with `-C <target>` resolves config from `<target>` rather than the caller's worktree ([test](tests/product-context.compliance.l1.test.ts))
- NEVER: add compatibility aliases for non-product root-directory names ([test](tests/product-directory-api.compliance.l1.test.ts))
