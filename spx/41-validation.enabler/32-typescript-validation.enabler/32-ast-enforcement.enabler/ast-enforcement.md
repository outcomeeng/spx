# TypeScript AST Enforcement

PROVIDES ESLint custom rules and `no-restricted-syntax` selectors for TypeScript source code
SO THAT TypeScript validation outcomes and their tests
CAN focus on behavior, trusting that structural compliance — correct imports, banned syntax, module boundaries — is caught by ESLint during `spx validation lint`

## Assertions

### Mappings

- `TSEnumDeclaration` maps to lint error — use `as const` object literals with types derived via `keyof typeof` ([test](tests/ast-enforcement.mapping.l1.test.ts))
- Bare string-literal union types (`type X = "a" | "b"` and similar `TSUnionType` composed of `TSLiteralType` string members) map to lint error — declare the set as a source-owned `as const` registry and derive the union via `keyof typeof` or value-of access ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-bare-string-unions.ts))
- `as any` type assertion maps to lint error — use `as unknown` and narrow with a type guard ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `<any>` type assertion maps to lint error — use `as unknown` and narrow with a type guard ([test](tests/ast-enforcement.mapping.l1.test.ts))

- `vi.mock()` maps to lint error — use explicit dependency injection; allowed doubles are typed objects or classes tied to a testing exception ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `vi.fn()` maps to lint error — use an explicit typed implementation or recording object passed through dependency injection ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `readFileSync` import maps to lint error — source-text testing is not evidence; legitimate fixture reads require an explicit lint suppression with justification ([test](tests/ast-enforcement.mapping.l1.test.ts))
- `skipIf` maps to lint error — restructure so the test runs in every environment, or remove it ([test](tests/ast-enforcement.mapping.l1.test.ts))
- String literals in assertion arguments map to lint error — import source-owned values from their owning module; if none exists, refactor production code to export a semantic `as const` registry ([test](tests/ast-enforcement.mapping.l1.test.ts))

- Internal import, export, dynamic import, and TypeScript import-type sources ending in `.js`, `.mjs`, `.cjs`, `.cts`, `.mts`, `.ts`, `.tsx`, `.d.ts`, `.d.cts`, or `.d.mts`, including before query/hash suffixes, map to lint error with autofix to the extensionless source ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-import-source-extensions.ts))
- Relative import, export, dynamic import, and TypeScript import-type sources that climb more than one parent directory (`../../` or deeper) map to lint error — use a configured alias or a local module boundary ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-deep-relative-imports.ts))
- Direct `process.cwd()` calls in product source outside `src/lib/config/cwd.ts` map to lint error — product-root callers use the config-owned cwd boundary or an explicit product context instead ([test](tests/no-process-cwd-for-product-roots.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-process-cwd-for-product-roots.ts))

- try-catch with expect() and empty catch maps to lint error — empty catch swallows assertion failures ([test](tests/ast-enforcement.mapping.l1.test.ts))
- try-catch with expect() and non-rethrowing catch maps to lint error — catch silently suppresses failures ([test](tests/ast-enforcement.mapping.l1.test.ts))

- `no-hardcoded-spec-tree-node-states` flags each occurrence of an exact `SPEC_TREE_NODE_STATE` value appearing in test code outside descriptions, type positions, and object keys — each occurrence maps to a lint error directing the author to reference the source-owned `SPEC_TREE_NODE_STATE` registry instead ([test](tests/no-hardcoded-spec-tree-node-states.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-hardcoded-spec-tree-node-states.ts))
- `no-hardcoded-spec-tree-node-kinds` flags each occurrence of an exact `NODE_KINDS` value appearing in test code outside descriptions, type positions, and object keys — each occurrence maps to a lint error directing the author to reference the source-owned `NODE_KINDS` registry instead ([test](tests/no-hardcoded-spec-tree-node-kinds.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-hardcoded-spec-tree-node-kinds.ts))
- `no-hardcoded-session-frontmatter-keys` flags each exact `SESSION_FRONT_MATTER` value outside the registry definition module — each occurrence maps to a lint error directing the author to reference the source-owned `SESSION_FRONT_MATTER` registry instead ([test](tests/no-hardcoded-session-frontmatter-keys.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-hardcoded-session-frontmatter-keys.ts))
- `no-test-owned-domain-constants` flags top-level uppercase constants and `as const` registries in test files and `tests/support.ts` modules — each occurrence maps to a lint error directing the author to import source-owned values or move generated data to a generator ([test](tests/no-test-owned-domain-constants.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-test-owned-domain-constants.ts))
- `no-registry-position-access` flags positional spec-tree registry reads such as `DECISION_KINDS[0]` and `NODE_KINDS[1]` outside generator modules — each occurrence maps to a lint error directing the author to use a named registry member or generator helper ([test](tests/no-registry-position-access.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-registry-position-access.ts))
- Whitelisted positions produce no diagnostic for `no-hardcoded-spec-tree-node-states`: the string argument to `describe`/`it`/`test`/`describe.each`/`it.each`/`test.each`, single-member literal type positions, object-key positions, and any string that is a substring of a larger identifier. Bare two-or-more-member string unions remain violations through `no-bare-string-unions`. ([test](tests/no-hardcoded-spec-tree-node-states.mapping.l1.test.ts))
- Whitelisted positions produce no diagnostic for `no-hardcoded-spec-tree-node-kinds`: the string argument to `describe`/`it`/`test`/`describe.each`/`it.each`/`test.each`, single-member literal type positions, object-key positions, and any string that is a substring of a larger identifier. Bare two-or-more-member string unions remain violations through `no-bare-string-unions`. ([test](tests/no-hardcoded-spec-tree-node-kinds.mapping.l1.test.ts))
- Whitelisted positions produce no diagnostic for `no-test-owned-domain-constants` when the uppercase name is a type, class, enum member, imported source-owned value, `describe`/`it`/`test` title, or lower-case generator-local helper. Test-owned constant registries remain violations even when their values match source registries, because duplicated ownership is the defect. ([test](tests/no-test-owned-domain-constants.mapping.l1.test.ts))
- Whitelisted positions produce no diagnostic for `no-registry-position-access` when an array index is read from a non-registry collection, when the indexed expression is in a type position, or when the file is a shared generator under `testing/generators/`. ([test](tests/no-registry-position-access.mapping.l1.test.ts))

### Scenarios

- Given `eslint.config.ts` loads the custom rule plugin, when real ESLint runs against the registration cases, then the inspected custom rules are registered and evaluable without configuration errors ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a TypeScript source file contains an internal import source with a file extension, when real ESLint runs against that file, then the import hygiene rule reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a TypeScript source file contains a deep parent relative import, when real ESLint runs against that file, then the import hygiene rule reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a `*.test.ts` file contains a hardcoded registry literal in an assertion-argument position, when real ESLint runs against that file, then the corresponding rule reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a source file (non-`*.test.ts`) contains the same hardcoded registry literal, when real ESLint runs against that file, then the registry rules report no violation — the rules apply to test files only ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a test file outside the test-owned-constant debt manifest declares a top-level uppercase test constant, when real ESLint runs against that file, then `spx/no-test-owned-domain-constants` reports an error ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a test file inside the test-owned-constant debt manifest declares a top-level uppercase test constant, when real ESLint runs against that file, then `spx/no-test-owned-domain-constants` reports a warning while other test-only custom rules remain errors ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a runtime test reads a registry by numeric position, when real ESLint runs against that file, then `spx/no-registry-position-access` reports the violation with its rule name ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given the validation configuration is loaded, when the registration cases inspect its custom rules, then the inspected project-specific rules are present and evaluable without configuration errors ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a node is covered by the test-owned-constant debt manifest, when its rule severity is resolved, then only `spx/no-test-owned-domain-constants` is downgraded to a warning ([test](tests/eslint-rules.scenario.l2.test.ts))
- Given a branch adds test-owned-constant debt absent from the committed baseline, when lint policy is validated, then validation fails and identifies the added entry ([test](tests/eslint-rules.scenario.l2.test.ts))

### Compliance

- ALWAYS: structural validation configuration references project-specific rules from the enforcement rule set ([review])
- NEVER: reference ADR-NN / PDR-NN by number in code comments, strings, or template literals — code complies silently, never cites decision numbers ([test](tests/ast-enforcement.mapping.l1.test.ts), [enforce](../../../../eslint-rules/no-spec-references.ts))
- ALWAYS: each enforcement rule references the ADR or PDR it enforces — traceability from rule to decision ([review])
- NEVER: enforce compliance by reading source files as strings — AST analysis is the only valid enforcement mechanism for structural rules ([review])
