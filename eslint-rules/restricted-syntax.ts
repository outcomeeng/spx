/**
 * Restricted syntax selectors for ESLint no-restricted-syntax rule.
 *
 * Extracted into a standalone file so both eslint.config.ts and
 * RuleTester-based tests can import them without pulling in the
 * full ESLint config dependency tree.
 */

/** Selectors applied to all TypeScript files. */
export const tsRestrictedSyntax = [
  {
    selector: "TSEnumDeclaration",
    message: "TypeScript enums are banned. Use `type Foo = 'a' | 'b'` or `{ A: 'a', B: 'b' } as const` instead.",
  },
  {
    selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
    message: "Do not use 'as any'. Use 'as unknown' and narrow with a type guard.",
  },
  {
    selector: "TSTypeAssertion[typeAnnotation.type='TSAnyKeyword']",
    message: "Do not use '<any>' type assertion. Use 'as unknown' and narrow with a type guard.",
  },
];

/** Additional selectors applied only to test files (stacked on tsRestrictedSyntax). */
export const testRestrictedSyntax = [
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock']",
    message: "vi.mock() is banned. Use dependency injection instead.",
  },
  {
    selector: "CallExpression[callee.object.name='vi'][callee.property.name='fn']",
    message: "vi.fn() is banned. Use typed interface implementations instead.",
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(toBe|toEqual|toStrictEqual|toContain|toMatch)$/] > Literal.arguments[raw=/^['\"`](?!(string|number|boolean|object|undefined|function|bigint|symbol)['\"`])/]",
    message: "Do not use string literals in assertions. Use a named constant or data factory.",
  },
  {
    selector: "CallExpression[callee.property.name='skipIf']",
    message:
      "skipIf is banned. A test that doesn't run provides zero evidence. Restructure so it runs in every environment, or remove it.",
  },
  {
    selector: "ImportDeclaration[source.value='node:fs'] > ImportSpecifier[imported.name='readFileSync']",
    message:
      "readFileSync is banned in tests. Tests verify behavior, not source text. If reading pipeline output or fixtures, ask user for explicit permission with justification.",
  },
];
