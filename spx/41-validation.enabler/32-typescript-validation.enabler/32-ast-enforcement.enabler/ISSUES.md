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

## No enforcement rule keeps terminal text composed rather than concatenated

[`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../../13-cli.enabler/15-cli-architecture.adr.md) requires every externally-originated value to be escaped where it is embedded into terminal-destined text, through the `src/lib/terminal-text/` primitive. Nothing enforces it. A new command descriptor that interpolates a subprocess reading into a template literal and hands the result to `writeStdout` compiles, passes lint, and ships — which is how the current spread of unescaped sites accumulated across seventeen nodes.

**Impact:** the invariant holds only where someone remembered it. Each escape gap is found by inspection rather than by a gate, so closing one boundary leaves its siblings open and the class regenerates as new surfaces are added.

**Resolution:** add an AST rule that reports a process-stream write, or a `CliIo` write, whose argument is a template literal or concatenation carrying a non-literal expression, and require composition through `src/lib/terminal-text/` instead. Give the rule `[test]` evidence against violating fixtures, following the `no-async-spawn-outside-lifecycle` shape this node already carries. Existing unmigrated nodes need the warning-downgrade manifest treatment the product uses for staged migrations until their own `ISSUES.md` entries are cleared.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** once a majority of the nodes listed in the terminal-escaping issues have migrated, so the rule can land at error severity for the remainder.
