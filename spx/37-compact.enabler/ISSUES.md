# Known Issues

## Executed compact tests delegate their assertions to compact test infrastructure

The `work/verification-tag-alignment` changeset moves the complete compact **assertion flow** into `testing/harnesses/compact/cli.ts` and `testing/harnesses/compact/compact.ts`. All three executed test files under this node call exported `assert*` functions, while the imported test-infrastructure modules own the behavioral predicates and every `expect`.

**Affected evidence:**

- `spx/37-compact.enabler/tests/compact-cli.scenario.l2.test.ts`
- `spx/37-compact.enabler/tests/compact-cli-io.scenario.l1.test.ts`
- `spx/37-compact.enabler/tests/compact.scenario.l1.test.ts`

This shape violates the assertion ownership defined by [`spx/12-test-infrastructure.adr.md`](../12-test-infrastructure.adr.md) and [`spx/local/typescript-tests.md`](../local/typescript-tests.md): executed test files own assertion flow and every `expect`; test infrastructure owns reusable resource lifecycle, controlled boundaries, execution policy, cleanup, and diagnostics.

**Resolution:** replace exported `assert*` functions with setup and execution functions that return typed observations. Place each behavioral predicate and `expect` in its linked executed test, and keep generated transcript, session, and path domains in compact generators.

**Skills:** `spec-tree:apply`, `spec-tree:test`, `spec-tree:audit-tests`.

**Revisit condition:** before publishing or merging the `work/verification-tag-alignment` changeset.

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/compact.ts` — the compact command output — transcript JSONL content read from the `--transcript` path, and process environment values

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
