# TypeScript AST Enforcement

PROVIDES ESLint custom rules and `no-restricted-syntax` selectors that enforce ADR compliance rules on TypeScript source code
SO THAT TypeScript validation outcomes and their tests
CAN focus on behavior, trusting that structural compliance — correct imports, banned syntax, module boundaries — is caught by ESLint during `spx validation lint`

## Assertions

### Mappings

Global TypeScript conventions (`no-restricted-syntax` selectors, all `.ts`/`.tsx` files):

- `TSEnumDeclaration` maps to lint error — use `as const` object literals with types derived via `keyof typeof` ([test](tests/ast-enforcement.mapping.l1.test.ts))
- Bare string-literal union types (`type X = "a" | "b"` and similar `TSUnionType` composed of `TSLiteralType` string members) map to lint error — declare the set as a source-owned `as const` registry and derive the union via `keyof typeof` or value-of access ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-bare-string-unions.ts))
- `as any` type assertion maps to lint error — use `as unknown` and narrow with a type guard ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `<any>` type assertion maps to lint error — use `as unknown` and narrow with a type guard ([test](tests/ast-enforcement.mapping.l1.test.ts))

Test evidence quality (`no-restricted-syntax` selectors, `*.test.ts`/`*.test.tsx` files):

- `vi.mock()` maps to lint error — use explicit dependency injection; allowed doubles are typed objects or classes tied to a testing exception ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `vi.fn()` maps to lint error — use an explicit typed implementation or recording object passed through dependency injection ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `readFileSync` import maps to lint error — source-text testing is not evidence; legitimate fixture reads require an explicit lint suppression with justification ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `skipIf` maps to lint error — restructure so the test runs in every environment, or remove it ([test](tests/ast-enforcement.mapping.l1.test.ts))
- String literals in assertion arguments map to lint error — import source-owned values from their owning module; if none exists, refactor production code to export a semantic `as const` registry ([test](tests/ast-enforcement.mapping.l1.test.ts))

Import hygiene (custom rule modules in `eslint-rules/`):

- Internal import, export, dynamic import, and TypeScript import-type sources ending in `.js`, `.mjs`, `.cjs`, `.cts`, `.mts`, `.ts`, `.tsx`, `.d.ts`, `.d.cts`, or `.d.mts`, including before query/hash suffixes, map to lint error with autofix to the extensionless source ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-import-source-extensions.ts))
- Relative import, export, dynamic import, and TypeScript import-type sources that climb more than one parent directory (`../../` or deeper) map to lint error — use a configured alias or a local module boundary ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-deep-relative-imports.ts))

BDD test hygiene (custom rule module in `eslint-rules/`):

- try-catch with expect() and empty catch maps to lint error — empty catch swallows assertion failures ([test](tests/ast-enforcement.mapping.l1.test.ts))
- try-catch with expect() and non-rethrowing catch maps to lint error — catch silently suppresses failures ([test](tests/ast-enforcement.mapping.l1.test.ts))

Registry-backed literal enforcement (custom rule modules in `eslint-rules/`):

- `no-hardcoded-statuses` flags each occurrence of the exact literal string `"OPEN"`, `"IN_PROGRESS"`, or `"DONE"` appearing in test code outside descriptions, type positions, and object keys — each occurrence maps to a lint error directing the author to reference the source-owned `WORK_ITEM_STATUSES` registry instead ([test](tests/no-hardcoded-statuses.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-hardcoded-statuses.ts))
- `no-hardcoded-work-item-kinds` flags each occurrence of the exact literal string `"capability"`, `"feature"`, or `"story"` appearing in test code outside descriptions, type positions, and object keys — each occurrence maps to a lint error directing the author to reference the source-owned `WORK_ITEM_KINDS` registry instead ([test](tests/no-hardcoded-work-item-kinds.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-hardcoded-work-item-kinds.ts))
- Whitelisted positions produce no diagnostic for either registry rule: the string argument to `describe`/`it`/`test`/`describe.each`/`it.each`/`test.each`, single-member literal type positions, and any string that is a substring of a larger identifier (`"DONE.md"` or `"capability-28"` never match). Bare two-or-more-member string unions remain violations through `no-bare-string-unions`. ([test](tests/no-hardcoded-statuses.mapping.l1.test.ts), [test](tests/no-hardcoded-work-item-kinds.mapping.l1.test.ts))

### Scenarios

- Given `eslint.config.ts` loads the custom rule plugin, when real ESLint runs against a representative mix of production and test files, then every custom rule declared above is registered and evaluable without configuration errors ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a TypeScript source file contains an internal import source with a file extension, when real ESLint runs against that file, then the import hygiene rule reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a TypeScript source file contains a deep parent relative import, when real ESLint runs against that file, then the import hygiene rule reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a `*.test.ts` file contains a hardcoded registry literal in an assertion-argument position, when real ESLint runs against that file, then the corresponding rule reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a source file (non-`*.test.ts`) contains the same hardcoded registry literal, when real ESLint runs against that file, then the registry rules report no violation — the rules apply to test files only ([test](tests/eslint-rules.scenario.l2.test.ts))

### Compliance

- ALWAYS: ESLint flat config references project-specific rules from the enforcement rule set ([review])
- ALWAYS: enforcement rules run as part of `pnpm lint` and `spx validation all` ([test](tests/eslint-rules.scenario.l2.test.ts))
- NEVER: reference ADR-NN / PDR-NN by number in code comments, strings, or template literals — code complies silently, never cites decision numbers ([enforce](../../../../eslint-rules/no-spec-references.ts))
- ALWAYS: each enforcement rule references the ADR or PDR it enforces — traceability from rule to decision ([review])
- ALWAYS: enforcement rules produce zero diagnostics on compliant code — no false positives on the codebase ([review])
- NEVER: enforce compliance by reading source files as strings — AST analysis is the only valid enforcement mechanism for structural rules ([review])
