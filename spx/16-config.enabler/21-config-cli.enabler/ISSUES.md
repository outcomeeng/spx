# Open Issues

## Executed CLI tests delegate their assertions to config test infrastructure

The `work/verification-tag-alignment` changeset moves config CLI predicates and `expect` calls into `testing/harnesses/config/cli.ts` and `testing/harnesses/config/root-resolution.ts`. Five of the six executed tests under this node call exported `assert*` functions instead of owning the **assertion flow** linked from [`config-cli.md`](config-cli.md).

**Affected evidence:**

- `spx/16-config.enabler/21-config-cli.enabler/tests/show.scenario.l1.test.ts`
- `spx/16-config.enabler/21-config-cli.enabler/tests/validate.scenario.l1.test.ts`
- `spx/16-config.enabler/21-config-cli.enabler/tests/root-resolution.compliance.l1.test.ts`
- `spx/16-config.enabler/21-config-cli.enabler/tests/invariants.compliance.l1.test.ts`
- `spx/16-config.enabler/21-config-cli.enabler/tests/determinism.property.l1.test.ts`

The same changeset leaves `spx/16-config.enabler/21-config-cli.enabler/tests/defaults.scenario.l1.test.ts` with test-owned setup and parsing declarations, so the node has competing ownership errors. The repair must apply one shape throughout the node: the executed test owns the predicate and every `expect`; test infrastructure owns lifecycle, controlled boundaries, execution policy, cleanup, and diagnostics; generators own variable input domains.

This shape violates [`spx/12-test-infrastructure.adr.md`](../../12-test-infrastructure.adr.md) and [`spx/local/typescript-tests.md`](../../local/typescript-tests.md).

**Resolution:** replace exported `assert*` functions with setup and execution functions that return typed observations. Keep each predicate and `expect` in the linked executed test. Move defaults-test data and parsing setup into the appropriate config generator or test-infrastructure boundary while preserving its predicates in the executed test.

**Skills:** `spec-tree:apply`, `spec-tree:test`, `spec-tree:audit-tests`.

**Revisit condition:** before publishing or merging the `work/verification-tag-alignment` changeset.

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/config.ts` — `emit()` writes `result.stdout` and `result.stderr` — resolved config file content, and config-validation diagnostics quoting config field values and paths

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
