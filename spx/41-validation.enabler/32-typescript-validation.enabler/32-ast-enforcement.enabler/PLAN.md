# Plan

Test fixtures and lint rule implementations for the new mappings introduced in [ast-enforcement.md](ast-enforcement.md). Each step adds the lint enforcement that backs an existing `[test]` evidence link.

## Steps

1. **TSEnumDeclaration tightening.** The mapping previously allowed "discriminated unions or const objects" as remediation; it now requires `as const` object literals with `keyof typeof`-derived types. Update fixtures in `tests/ast-enforcement.unit.test.ts`:
   - **Positive (rule fires):** `enum X { A = "a", B = "b" }` and any other `TSEnumDeclaration`.
   - **Negative (rule does not fire):** `const X = { A: "a", B: "b" } as const` followed by `type X = keyof typeof X`.
   - Discriminated-union code (`type X = "a" | "b"`) is no longer a passing remediation — it is caught by step 2 instead.

2. **Bare string-literal union type ban (new mapping).** Implement an ESLint rule that fires on `TSUnionType` whose member set is composed entirely of `TSLiteralType` nodes wrapping `Literal` nodes with string values, when the union is the right-hand side of a `TSTypeAliasDeclaration` or appears in a property type position. Mechanism choice per [21-enforcement-tooling.adr.md](21-enforcement-tooling.adr.md): a custom rule is likely needed because `no-restricted-syntax` cannot express the registry-derivation-aware exception (a union derived via `keyof typeof Registry` resolves to `TSTypeOperator` / `TSIndexedAccessType`, not `TSUnionType`, so the selector fires only on bare unions automatically).
   - **Positive:** `type Tier = "free" | "pro"`, `type Status = "open" | "doing" | "done"`.
   - **Negative:** `type Tier = keyof typeof TIERS`, `type Status = (typeof STATUSES)[keyof typeof STATUSES]`.
   - **Negative:** single-member literal unions (`type Mode = "read"`) — not yet covered; the convention requires two or more members. Decide during fixture authoring whether to extend the rule to single-member cases.

3. **Cite the governing ADR.** Each new rule file should cite [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md) via the `[enforce]` link convention from existing rules (e.g., `eslint-rules/no-spec-references.ts` is cited from ast-enforcement.md as `[enforce](../../../../eslint-rules/no-spec-references.ts)`). The ADR is the convention; the rule is the enforcement.

4. **Run `spx validation all`** against the codebase after each rule lands. Existing source must already comply (the convention encodes what the codebase already does); a violation surfacing during the first run means either an existing source defect or a fixture gap in the rule.
