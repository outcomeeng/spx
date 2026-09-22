# Open Issues

## The status-JSON conformance claim is settled by a manual field check

The Conformance assertion `Status JSON output conforms to the stable SpecTreeProjection contract consumed by automation callers` is evidenced by parsing the rendered output, widening it with a TypeScript `as` annotation that erases at runtime, and asserting two fields. No schema, validator, reference implementation, or separately owned contract judges the output, and the source-owned key contract `SPEC_TREE_PROJECTION.KEYS` and `NODE_KEYS` in `src/lib/spec-tree/index.ts` is never consulted. The object match over one childless node also leaves `product`, `decisions`, and the node keys `kind`, `order`, `slug`, and `children` unexercised.

**Evidence:** the test-evidence audit of this node at `e372f08c66ebaa9afbf1363be34378fa01ad512f` returned `REJECTED` with findings `f-001` (rule `evidence`, remediation target `independent-oracle`) and `f-002` (rule `scope`) against `tests/spec-cli-rendering.conformance.l1.test.ts:43` and `:47`.

**Impact:** renaming or dropping any projection key other than `version` leaves the linked evidence passing while the contract automation callers consume is broken.

**Settlement condition:** the conformance evidence judges the rendered document against an oracle owned separately from the renderer — the source-owned projection key contract or a schema — and covers every member of the projection the assertion names.

**Neighbouring decision:** the registry-label half of the status mapping assertion is settled outside this note, as a Proposed Change against this node: the label claim keeps the three human-readable arms and the JSON arm becomes its own assertion.
