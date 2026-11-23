---
id: 01a20495-778c-700f-a58d-dc3dda4ab866
---

# TypeScript Snippet Generators

PROVIDES in-memory TypeScript source snippet builders for the five canonical forms the literal detector's AST traversal recognizes: the `export const` string, numeric, and template declarations, and the `expect().toBe()` string and numeric assertions
SO THAT tests of literal detection and the file-based literal fixtures
CAN build each snippet form from one source file, so no test file repeats a snippet's template text

## Assertions

### Test.Property: snippet builders

- [builders-pure](tests/ts-snippet-generators.property.l1.test.ts): For every string of 8 to 32 lowercase letters and inner single hyphens other than the web preset tokens of the literal value allowlist, and every integer of 5 to 9 digits, each of the five builders returns byte-equal strings for two calls with the same argument
- [declarations-round-trip](tests/ts-snippet-generators.property.l1.test.ts): For every such string and integer, the literal detector indexes the output of `buildStringDeclaration` and of `buildTemplateDeclaration` in a source file as a string occurrence, and the output of `buildNumericDeclaration` in a source file as a numeric occurrence, each carrying the value the builder received
- [assertions-round-trip](tests/ts-snippet-generators.property.l1.test.ts): For every such string and integer, the literal detector indexes the output of `buildStringAssertion` in a test file as a string occurrence, and the output of `buildNumericAssertion` in a test file as a numeric occurrence, each carrying the value the builder received

### Audit: builder ownership

- builders-module: ALWAYS: the five builders are exported from `testing/generators/literal/snippets.ts`; a snippet builder exported from any other module fails.
- harness-derives-from-builders: ALWAYS: `testing/harnesses/literal/harness.ts` derives `formatSourceFile` and `formatTestFile` from the exported builders; a canonical snippet form the harness writes out itself fails.
- no-value-interpolation: NEVER: a builder embeds its value argument through template-literal interpolation; values enter through `JSON.stringify` or plain string concatenation, and a `${` placeholder in a builder fails.
- snippet-value-domains: ALWAYS: the tests of the builders draw their string and integer values from generators that `testing/generators/literal/snippets.ts` exports, bounded by the literal detector's configuration; a test of this Node that draws a value from a generator another Node owns fails.
