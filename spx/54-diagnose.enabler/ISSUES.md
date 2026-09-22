# Open Issues

## The manifest wire keys are declared in the evidence rather than owned by source

`src/domains/diagnose/manifest.ts` reads the manifest's consumer-fact keys inline — `parsed.spx_floor`, `parsed.marketplace`, `parsed.expected_plugins` — and exports no registry for them; its exports are `CHECK_NAME`, `DiagnoseManifest`, and `parseManifest`. The same three keys are spelled again as string literals in `manifestJson()` in [`testing/generators/diagnose/manifest.ts`](../../testing/generators/diagnose/manifest.ts), in `writeReachabilityManifest` in [`testing/harnesses/diagnose/cli.ts`](../../testing/harnesses/diagnose/cli.ts), and in [`tests/manifest.conformance.l1.test.ts`](tests/manifest.conformance.l1.test.ts). The prose schema in [`13-diagnose-engine.adr.md`](13-diagnose-engine.adr.md) states the wire shape but publishes no source contract. The same generator function already imports `METHODOLOGY_SECTION` and `METHODOLOGY_CONFIG_FIELDS` from `src/config/methodology.ts` for the methodology keys, so the owning pattern exists beside the violation.

**Evidence:** test-evidence audit of `spx/54-diagnose.enabler`, finding `f-003`, severity REJECT, property `source-ownership`.

**Impact:** the conformance oracle restates the parser's own vocabulary from a copy. A key renamed in `parseManifest` leaves three independent spellings unchanged, and the conformance evidence keeps passing against the stale wire shape it declares itself.

**Settlement condition:** `src/domains/diagnose/manifest.ts` exports the manifest wire-key registry, the generator, the harness, and the conformance test read the keys from it, and no module outside that owner spells `spx_floor`, `marketplace`, or `expected_plugins`.

## The check records publish no readings-key registry

Each check builds its `readings` object as a literal inside its own `record()` — `hook`, `identity` and `claimed` in [`src/domains/diagnose/checks/session-environment.ts`](../../src/domains/diagnose/checks/session-environment.ts); `bare`, `linked`, `running`, `free`, `mainCheckoutPath`, `defaultBranch`, `mainCheckoutBranch` and `mainCheckoutBranchRead` in [`src/domains/diagnose/checks/worktree-pool.ts`](../../src/domains/diagnose/checks/worktree-pool.ts); `orphaned`, `configured`, `surface`, `unregistered`, `drifted`, and the methodology-context keys in their siblings — and none of those modules exports the key set. A consumer must therefore spell the vocabulary itself, and [`tests/diagnose-cli.scenario.l2.test.ts`](tests/diagnose-cli.scenario.l2.test.ts) does, while the same file imports the source-owned `CHECK_RECORD_FIELDS` from `src/domains/diagnose/types.ts` for the record fields one level up.

[`tests/text-report.compliance.l1.test.ts`](tests/text-report.compliance.l1.test.ts) spells the same unowned keys — `version`, `running`, `free`, `orphaned` — to name the values the detailed diagnosis must surface, so a key renamed in a check leaves that expectation reading the absent value on both sides of its comparison and the assertion still passes.

This is the same defect as the manifest wire keys above, seen from the other side: that entry is the producer's face of it in the generator, this one the consumer's face in the tests.

**Evidence:** test-evidence audit of `spx/54-diagnose.enabler`, findings `f-002` and `f-003` in the third round, `f-002` in the fourth, and `f-001` and `f-003` in the fifth, every one severity REJECT, property `source-ownership`. The fifth round added the compliance test as a second consuming site.

**Impact:** the readings are the schema field names of a machine contract that consumers decode, and they have two independent declarations. A key renamed in a check's `record()` leaves the consuming test's spelling intact, and the evidence keeps passing against a wire shape the product no longer emits.

**Settlement condition:** each check module publishes its readings-key registry beside its `record()`, the way `CHECK_RECORD_FIELDS` already does for the enclosing record, and every consumer reads the keys from that owner rather than spelling them.

## Two test files bypass the property harness

[`tests/determinism.property.l1.test.ts`](tests/determinism.property.l1.test.ts) and [`tests/check-selection.mapping.l1.test.ts`](tests/check-selection.mapping.l1.test.ts) both call `fc.assert(fc.property(...))` directly. The product's property harness `assertProperty` in [`testing/harnesses/property/property.ts`](../../testing/harnesses/property/property.ts) owns run count, per-run timeout, seed selection, and `SPX_PROPERTY_SEED` replay diagnostics, and the node's sibling property evidence [`tests/output-mode.property.l1.test.ts`](tests/output-mode.property.l1.test.ts) routes through it, as does the repository overlay `spx/local/typescript-tests.md`.

**Evidence:** test-evidence audit of `spx/54-diagnose.enabler`, finding `f-004` in the third round and `f-005` in the fourth, severity WARNING, property `declarations`, rule `test-owned configuration`. The fourth round added the second file.

**Impact:** the run count, timeout, and replay policy for both files fall to fast-check defaults rather than the harness that owns them, so the node's property-driven evidence is governed by two different execution policies. Fast-check's own failure output still carries a seed and a replay path, so a failure remains reproducible.

**Settlement condition:** each file passes its arbitrary, its inline predicate, and its level classification to `assertProperty`, and no test file in this node calls `fc.assert` directly.

## The check-selection evidence declares its own recording collaborator

[`tests/check-selection.mapping.l1.test.ts`](tests/check-selection.mapping.l1.test.ts) declares `recordingRegistry(invoked)`, which builds the injected `CheckRegistry` over every `CHECK_NAME` and fabricates each returned `CheckRecord` — its verdict, bucket, readings, and remediation. The node's harness already supplies exactly this collaborator for the sibling property evidence: `withDiagnoseOutputScenario` in [`testing/harnesses/diagnose/output-modes.ts`](../../testing/harnesses/diagnose/output-modes.ts) builds a recording registry over the scenario's checks and exposes the calls it observed.

**Evidence:** test-evidence audit of `spx/54-diagnose.enabler`, finding `f-005` in the third round and `f-004` in the fourth, both severity REJECT, property `declarations`, rule `test-owned configuration`.

**Impact:** the controlled implementation and the record shape it returns are arrangement the assertion does not state, owned in the assertion file rather than by the harness. The collaborator is therefore declared twice in one node, and a change to what a recorded check must return reaches one copy and not the other.

**Settlement condition:** the check-selection evidence consumes its recording registry from the node's harness and asserts over the observations that harness exposes, and no executed test file in this node declares a collaborator the harness already owns.

## Three co-located test files carry no assertion link

`tests/config.mapping.l1.test.ts`, `tests/resolve.mapping.l1.test.ts`, and `tests/worktree-status-probe.compliance.l1.test.ts` hold typed assertion evidence that no assertion in [`diagnose.md`](diagnose.md) claims. They appear only in this node's `spx.status.json`.

**Evidence:** test-evidence audit of `spx/54-diagnose.enabler`, finding `f-006`, severity INFO, property `evidence-chain-completeness`, rule `unlinked-evidence`.

**Impact:** the node's assertion-to-test mapping is not total over its `tests/` directory. Each file proves something about diagnose behavior that the spec does not declare, so the declarations those three files verify are invisible to a reader of the spec and to any audit that walks assertions.

**Settlement condition:** each of the three files is reached by a `[test]` link from an assertion in `diagnose.md` that states the behavior it proves, or the file is removed because its behavior is already declared and evidenced elsewhere.
