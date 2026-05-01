# TypeScript Conventions

## Purpose

This decision governs how TypeScript code in this repository declares closed sets and shares values across the source/test boundary. It applies to every `.ts` and `.tsx` file in the codebase, including production source under `src/` and test files under `spx/**/tests/`.

## Context

**Business impact:** TypeScript is the implementation language for the SPX CLI and its tests. The choice between distributed and single-site declarations for closed sets determines whether a rename is one edit or many. Source-test divergence on shared values is invisible to test frameworks: a test asserting a copy-pasted literal remains green when the source-owned value diverges. Import-coupled tests fail or update atomically with the source.

**Technical constraints:** TypeScript supports both bare discriminated unions (`type X = "a" | "b"`) and `as const` object literals with types derived via `keyof typeof`. ESLint custom rules detect AST-level patterns within a single file; cross-file literal duplication requires a separate global pre-pass that reads every file's AST and indexes literals across the codebase. Enforcement mechanisms are governed by [21-enforcement-tooling.adr.md](32-ast-enforcement.enabler/21-enforcement-tooling.adr.md). Test evidence for the rules in this ADR lives downstream: per-file rules in [ast-enforcement.md](32-ast-enforcement.enabler/ast-enforcement.md), cross-file rules in the literal-reuse leaf enabler under this subtree.

## Decision

TypeScript code in this repository declares closed sets as `as const` object literals with types derived via `keyof typeof` and runtime enumeration via `Object.values()`. Source-owned values cross the test boundary by import, never by duplication.

## Rationale

The `as const` registry pattern locates each closed set at one declaration site. The derived type, the runtime enumeration, and every reference resolve through that site. Bare discriminated unions distribute the declaration across every type annotation and pattern match referencing the union; member discovery depends on text search rather than `Find All References`.

Source-owned imports across the test boundary eliminate the divergence class. A test importing the source value cannot diverge from it. Inline literals carrying domain meaning are prohibited because they have no single declaration site — restricting raw literals in test bodies forces the author to classify each value as source-owned, generated input data, or real-world fixture content.

Alternatives considered:

- **Bare discriminated unions for closed sets** — concise at declaration but distributes the source of truth. Every match expression and type annotation that names a member becomes part of the declaration surface. Rejected because rename cost scales with the codebase.
- **Tolerating typed-union literal assertions in tests** — relies on the type annotation to communicate intent (`expect(x).toBe("declared")` where `x: NodeState`). Rejected because the literal value remains invisible to rename tooling and `Find All References`; once the same literal recurs across two or more test files, divergence is invisible to the test runner.
- **String enums (`enum X { A = "a" }`)** — single-site the declaration but emit runtime objects with reverse mappings and ambient-mode incompatibilities. Rejected; TypeScript enums are already prohibited under [ast-enforcement.md](32-ast-enforcement.enabler/ast-enforcement.md).

## Trade-offs accepted

| Trade-off                                                                                          | Mitigation / reasoning                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `as const` registries are heavier syntax than bare unions for two-member sets                      | The cost is one-time at declaration; rename and discovery savings dominate over the lifetime of the code                                                      |
| Cross-boundary imports lengthen tests that previously inlined literals                             | An explicit import is cheaper than the regression class it eliminates                                                                                         |
| Cross-file literal duplication is enforced by a separate global pass, not by ESLint per-file rules | The pass runs as a leaf enabler under `41-validation.enabler/32-typescript-validation.enabler/` and participates in `spx validation all` like any other stage |
| Tests cannot own semantic constants                                                                | Production modules expose semantic registries; generated inputs come from generators, and real-world sample data lives in fixture files                       |

## Invariants

- A closed set has exactly one declaration site in the codebase: an `as const` object literal in its owning module.
- A literal value with domain meaning has exactly one declaration site, in source code.
- Test code imports source-owned semantic values or obtains variable input values from generators, harnesses, or fixture files.

## Compliance

### Recognized by

Single declaration sites for closed sets (one `as const` per set). Test imports resolving to source modules for any value owned by source. Absence of raw domain-meaningful literals in test bodies and matcher arguments.

### MUST

- Closed sets are declared as `as const` object literals; the union type derives via `keyof typeof` (or `(typeof X)[keyof typeof X]` for value-of); runtime enumeration uses `Object.values()` ([review])
- Source-owned values used in tests — constants, ids, route paths, copy strings, configuration keys — are imported from the source module that owns them ([review])
- Variable test inputs are generated by typed generators or produced by harnesses; strings and numbers are not represented as test-owned semantic constants ([review])
- Raw numeric literals outside the structural set (`-1`, `0`, `1`, `2`) are imported from their owning source module, derived from generated inputs, or supplied by a fixture format that production code consumes ([review])
- Precision, tolerance, timeout, and threshold arguments to matchers and harness calls are named constants imported from their owning module ([review])

### NEVER

- Declare a closed set as a bare discriminated union (`type X = "a" | "b"`) when the set has two or more members ([review])
- Duplicate a source-owned literal value in test code instead of importing it from source ([review])
- Declare test-owned semantic constants in test files or shared test support ([review])
- Pass an anonymous numeric literal as a precision, tolerance, timeout, or threshold argument ([review])
- Assert against a bare string literal when the value is owned by a source-side `as const` registry ([review])
