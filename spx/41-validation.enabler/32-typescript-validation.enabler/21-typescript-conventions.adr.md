# TypeScript Closed-Set and Test-Value Ownership

TypeScript closed sets use source-owned `as const` registries with derived union types and runtime enumeration. Tests import source-owned semantic values, obtain variable inputs from generators or harnesses, and may keep a typed protocol member inline when the expression's TypeScript type already identifies the closed vocabulary.

## Rationale

An `as const` registry keeps the runtime values, derived type, enumeration, and references at one declaration site. Importing source-owned values prevents source/test divergence, while generators and harnesses preserve meaningful variability without creating test-owned constant bags. A typed protocol expectation such as a `NodeState` value compared with `"declared"` already carries its vocabulary through the type; extracting that member to another name adds no ownership information and can obscure the behavioral assertion.

Blanket matcher-literal bans cannot distinguish typed protocol members from unowned semantic literals. Exact source-registry rules and cross-file literal analysis retain enforceable ownership checks without treating every string expectation as a defect.

## Invariants

- A closed set has one source-owned runtime declaration from which its TypeScript type derives.
- A source-owned semantic value has one declaration site in production code.
- Variable test inputs vary through generators or harnesses; typed protocol members remain type-checked at their assertion site.

## Verification

### Testing

- ALWAYS: enum declarations and bare multi-member string unions produce structural validation findings that direct authors to a source-owned `as const` registry ([mapping])
- ALWAYS: exact source-registry values duplicated in test code produce registry-specific or cross-file literal findings ([mapping])
- NEVER: a matcher string literal produces a blanket restricted-syntax finding solely because it is inline; typed protocol members remain valid matcher arguments ([mapping])

### Audit

- ALWAYS: production modules own closed vocabulary, semantic values, and singleton constructors consumed by tests ([audit])
- ALWAYS: enforcement code accepts typed inputs and exposes deterministic rule behavior without module replacement ([audit])
- NEVER: test infrastructure redeclares source protocol vocabulary or hides test-owned semantic constants behind shared constants ([audit])
- NEVER: use `vi.mock()` or `jest.mock()` to verify TypeScript convention enforcement; tests exercise the real rule with generated cases ([audit])
