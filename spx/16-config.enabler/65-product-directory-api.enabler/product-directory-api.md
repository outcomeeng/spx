# Product Directory API

PROVIDES product-root and Git common-dir product-root vocabulary for config APIs and tests
SO THAT config consumers, harnesses, and execution descriptors
CAN refer to tracked product files through `productDir` and gitignored state through the Git common-dir product root

## Assertions

### Compliance

- ALWAYS: config APIs, test harnesses, and descriptor tests name the tracked product root `productDir` ([test](tests/product-directory-api.compliance.l1.test.ts), [review])
- ALWAYS: root-directory APIs expose `productDir` rather than `projectRoot` or `projectDir` ([test](tests/product-directory-api.compliance.l1.test.ts), [review])
- ALWAYS: root-resolution helper names distinguish tracked product roots, local worktree roots, and Git common-dir product roots without main-repo vocabulary ([test](tests/product-directory-api.compliance.l1.test.ts), [review])
- NEVER: add compatibility aliases for non-product root-directory names ([test](tests/product-directory-api.compliance.l1.test.ts), [review])
