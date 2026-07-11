# Test Infrastructure Ownership

Reusable TypeScript test infrastructure lives under `testing/{generators,harnesses,fixtures}/` and is governed by the naturally placed domain spec whose behavior it serves. Production modules own protocol vocabulary and singleton construction, generators own pure variable input domains, harnesses own external-resource lifecycle and execution configuration, fixtures own inert whole payloads, and executed spec-tree test files own only assertion flow.

## Rationale

Domain ownership keeps generated values and harness behavior aligned with the production contracts they exercise while the category boundary keeps data generation separate from resource management. A product-wide fixture factory or dependency-bag builder hides the behavior that decides a result and couples unrelated evidence to shared defaults. Independent arbitrary draws also hide semantic relationships, so a generator emits one coherent scenario whenever values must agree.

## Invariants

- A production-owned token or singleton shape has exactly one owner in production code and is imported directly by test infrastructure.
- A generated scenario is pure data whose related values satisfy one domain contract.
- A harness consumes a scenario and adds lifecycle, controlled boundaries, execution policy, cleanup, and diagnostics without becoming a second source of test data.

## Verification

### Audit

- ALWAYS: every reusable generator, harness, and fixture is governed by a domain spec that declares its observable contract and ownership boundary ([audit])
- ALWAYS: generators are pure, side-effect-free functions over meaningful variable domains with shrinking and replay supplied by the property harness ([audit])
- ALWAYS: harnesses use real local systems whenever they are reliable, safe, cheap, and observable; each controlled dependency maps to a named testing-methodology exception and enters through a typed dependency boundary ([audit])
- ALWAYS: executed test files import source-owned contracts and register harness or property cases without owning reusable data, dependency bags, resource lifecycle, execution policy, or diagnostics ([audit])
- NEVER: test infrastructure redeclares production protocol values, command vocabulary, schema fields, status values, path grammar, or singleton source shapes ([audit])
- NEVER: a generic literal generator substitutes for a domain generator when generated values have semantic relationships, and a constant-only generator substitutes for a production-owned constructor ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, framework module replacement, or filesystem replacement substitutes for the production boundary under test ([audit])
