# TypeScript Snippet Generators

PROVIDES in-memory TypeScript source snippet builder functions — exported from [`testing/harnesses/literal/snippets.ts`](../../../../../testing/harnesses/literal/snippets.ts) — that produce the five canonical string forms the literal detector's AST traversal recognizes: `export const` string declaration, numeric declaration, template declaration, and `expect().toBe()` string and numeric assertion
SO THAT unit tests in [detection](../21-detection.enabler/detection.md)
CAN call a builder instead of authoring inline template literals for each snippet form, keeping each TemplateElement quasi string in exactly one source file rather than duplicated across multiple test files

## Assertions

### Properties

- Each builder is pure: two calls with identical arguments return byte-equal strings ([test](tests/ts-snippet-generators.property.l1.test.ts))
- Each declaration builder (`buildStringDeclaration`, `buildNumericDeclaration`, `buildTemplateDeclaration`) produces output that the literal detector indexes as an occurrence whose value equals the original input ([test](tests/ts-snippet-generators.property.l1.test.ts))
- Each assertion builder (`buildStringAssertion`, `buildNumericAssertion`) produces output that the literal detector indexes as an occurrence whose value equals the original input ([test](tests/ts-snippet-generators.property.l1.test.ts))

### Compliance

- ALWAYS: `testing/harnesses/literal/harness.ts` derives its file-writing shapes (`formatSourceFile`, `formatTestFile`) from these exported builders — the canonical string forms are not duplicated between the in-memory and file-based code paths ([review])
- NEVER: a builder embeds its `value` argument via template literal interpolation — values are embedded through `JSON.stringify` or plain string concatenation so that no new interpolated TemplateElement quasi strings are introduced in the builder source ([review])
