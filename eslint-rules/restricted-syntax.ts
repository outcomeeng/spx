/**
 * Restricted syntax selectors for ESLint no-restricted-syntax rule.
 *
 * Extracted into a standalone file so both eslint.config.ts and
 * RuleTester-based tests can import them without pulling in the
 * full ESLint config dependency tree.
 */

export const NO_RESTRICTED_SYNTAX_RULE_ID = "no-restricted-syntax";

/** Selectors applied to all TypeScript files. */
export const tsRestrictedSyntax = [
  {
    selector: "TSEnumDeclaration",
    message:
      "TypeScript enums are banned. Declare a source-owned `as const` registry and derive the union type from that registry.",
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

export const TEST_VI_MOCK_RULE = {
  selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock']",
  message:
    "vi.mock() is banned. Use explicit dependency injection; allowed doubles must be typed objects or classes tied to a testing exception.",
} as const;

export const TEST_VI_FN_RULE = {
  selector: "CallExpression[callee.object.name='vi'][callee.property.name='fn']",
  message:
    "vi.fn() is banned. Use an explicit typed implementation or recording object passed through dependency injection.",
} as const;

export const TEST_ASSERTION_STRING_LITERAL_RULE = {
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(toBe|toEqual|toStrictEqual|toContain|toMatch)$/] > Literal.arguments[raw=/^['\"`](?!(string|number|boolean|object|undefined|function|bigint|symbol)['\"`])/]",
  message:
    "Do not use string literals in assertions. Import source-owned values from their owning module; if none exists, refactor production code to export a semantic `as const` registry.",
} as const;

export const TEST_SKIP_IF_RULE = {
  selector: "CallExpression[callee.property.name='skipIf']",
  message:
    "skipIf is banned. A test that doesn't run provides zero evidence. Restructure so it runs in every environment, or remove it.",
} as const;

export const TEST_READ_FILE_SYNC_IMPORT_RULE = {
  selector: "ImportDeclaration[source.value='node:fs'] > ImportSpecifier[imported.name='readFileSync']",
  message:
    "readFileSync imports are banned in tests because source-text testing is not evidence. Use real behavior through a harness or fixture file; justified filesystem fixture reads need an explicit lint suppression.",
} as const;
/** Additional selectors applied only to test files (stacked on tsRestrictedSyntax). */
export const testRestrictedSyntax = [
  TEST_VI_MOCK_RULE,
  TEST_VI_FN_RULE,
  TEST_ASSERTION_STRING_LITERAL_RULE,
  TEST_SKIP_IF_RULE,
  TEST_READ_FILE_SYNC_IMPORT_RULE,
];
