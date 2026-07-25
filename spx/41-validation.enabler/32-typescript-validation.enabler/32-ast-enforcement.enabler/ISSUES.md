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

## Enforcement tooling ADR uses the legacy decision-record shape

`spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/21-enforcement-tooling.adr.md`
uses the retired ADR template with `## Purpose`, `## Context`, `## Decision`,
`## Trade-offs accepted`, a `## Compliance` block, and blanket `[review]`
verification tags.

**Impact:** TypeScript AST-enforcement changes can copy a deprecated decision
record structure if they treat this ADR as precedent.

**Tracking classification:** Tracked deferral, chosen by the operator while
finishing the discovery-parsing evidence changeset on July 14, 2026.

**Revisit condition:** Migrate before editing the enforcement tooling ADR or
before using it as a template for a new TypeScript validation decision record.

**Skills:** `spec-tree:contextualize`, `spec-tree:author`,
`spec-tree:audit-adr`, and `typescript:architect-typescript`.

## Terminal-write detection covers embedding but not bare identifiers

`spx/no-unescaped-terminal-text` reports a terminal write whose argument embeds a value — a template literal carrying an interpolation, or a concatenation with a non-literal operand. It does not report a write whose argument is a bare identifier or member expression holding external text, such as `io.writeStdout(result.output)`, nor a value passed as an extra argument to `console.error(message, error)`.

**Impact:** the embedding class is caught at authoring time, and the residual class is not. A write that composes its text elsewhere and hands over the finished string reaches the terminal without a gate objecting.

**Resolution:** narrowing the composed-text write signature to the composed `TerminalText` of `src/lib/terminal-text/` closes the residual class at the type level rather than by widening the rule, because a bare identifier is exactly what a type check reads. Rule-side detection of extra `console.*` arguments remains worthwhile for the sites outside that signature — `src/lib/precommit/**` and `src/lib/process-lifecycle/install.ts` write through `console` and `process.stderr` directly.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** once the composed-text write signature narrows, so the remaining gap is only the direct `console` and `process.stderr` sites.

## The terminal-text rule misses two shapes it exists to catch

`spx/no-unescaped-terminal-text` in [`eslint-rules/no-unescaped-terminal-text.ts`](../../../../eslint-rules/no-unescaped-terminal-text.ts) reports a value interpolated or concatenated into a write argument. Two shapes at real call sites evade it:

- `isTerminalSink` matches a `MemberExpression` callee, so a sink captured into a local alias (`const write = io.writeStderr; write(payload)`) is invisible to it.
- `embedsValue` inspects template and binary expressions, so a bare `CallExpression` argument (`io.writeStdout(Buffer.from(chunk).toString())`) carries no embedded value it can see.

**Impact:** a zero-violation lint result does not establish that the escaping invariant of [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../../13-cli.enabler/15-cli-architecture.adr.md) holds for a file. Both shapes occurred in `src/interfaces/cli/validation.ts` while the rule ran at `error` severity with no exemptions.

**Resolution:** resolve an aliased sink to its initializer before the sink test, and treat a call expression argument as an embedded value unless it is a composition-primitive call. Extend the rule's violating fixtures to cover both shapes.

**Skills:** `/apply`, `/test-typescript`.
