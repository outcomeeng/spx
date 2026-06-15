# Known Issues

## Filesystem read selector covers only one import shape

The test filesystem-read ban catches named `readFileSync` imports from `node:fs`, but it does not catch namespace imports, default imports, renamed specifiers, `node:fs/promises`, or other read APIs such as `readFile`, `readdir`, and `stat`.

### Required Work

1. Replace the selector-only guard with a custom ESLint rule.
2. Cover named imports, renamed imports, namespace imports, default imports, `node:fs/promises`, and the full read API set in `tests/ast-enforcement.mapping.l1.test.ts`.
3. Keep write-only filesystem APIs outside the banned set so tests can create fixtures and diagnostic artifacts.

## no-spec-references misses bare `spx/` path references in code

The `eslint-rules/no-spec-references.ts` regex `/\b[AP]DR(?:[-–— ]\d+|:\s)/` matches only the `ADR-NN`/`PDR-NN` and `ADR: spx/...` forms. A bare `spx/<path>` reference in a comment or string literal — which the rule's own docstring prohibits ("Code must not reference spx/ artifacts") — passes undetected, so `spx validation` stays silent on it. Two such references reached code review on the agent-run-journal interface PR (a file-level JSDoc and a test harness comment) because the lint gate did not catch them.

### Required Work

1. Broaden `no-spec-references` to flag bare `spx/<path>` references in comments, string literals, and template literals, alongside the existing `ADR-NN`/`PDR-NN` forms.
2. Cover the bare-path case in the rule's mapping test.
