# Known Issues

## Filesystem read selector covers only one import shape

The test filesystem-read ban catches named `readFileSync` imports from `node:fs`, but it does not catch namespace imports, default imports, renamed specifiers, `node:fs/promises`, or other read APIs such as `readFile`, `readdir`, and `stat`.

### Required Work

1. Replace the selector-only guard with a custom ESLint rule.
2. Cover named imports, renamed imports, namespace imports, default imports, `node:fs/promises`, and the full read API set in `tests/ast-enforcement.mapping.l1.test.ts`.
3. Keep write-only filesystem APIs outside the banned set so tests can create fixtures and diagnostic artifacts.
