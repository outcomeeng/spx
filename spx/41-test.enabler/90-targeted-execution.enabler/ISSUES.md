# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/test.ts` — the caught-error branches and the unresolved-target warnings — caught errors embedding filesystem paths, and argv-supplied target operands
- `src/interfaces/cli/test-agent-output.ts` — the agent-mode formatter — run, stdout, stderr, and failing-test filesystem paths

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## Operands collect no candidates from the invocation directory or by suffix

`spx/29-verification-path-scope.pdr.md` declares that a relative operand collects candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over the command's accepted canonical target paths, resolved through symbolic links, with exactly one canonical identity accepted and ambiguity reported. The operand-selection library under `src/lib/test-targeting/` canonicalizes an operand against the product root alone — a relative spelling is taken as product-root-relative, an absolute spelling inside the root resolves as written, and an outside or climbing spelling is unresolved — so `spx test` and `spx verification <type> run`, which both consume the library, report an operand spelled relative to a subdirectory invocation, or by a canonical-path suffix, as unresolved, and never report ambiguity.

**Evidence:** `src/lib/test-targeting/index.ts` `canonicalizeOperand` and `matchOperand`; `src/commands/test/run-command.ts` and `src/commands/verification-exec/cli.ts` both resolve operands through `resolveTargetedTestFiles` over product-root-relative discovered paths; the execute-run compliance case that invokes from inside the product passes no operand.

**Impact:** a caller inside the product must spell every relative operand from the product root even though the command already resolves its root from the invocation directory; the PDR's invocation-directory candidates, suffix candidates, symbolic-link resolution, and ambiguity reporting exist in no surface.

**Settlement condition:** the library, or a resolution step every consuming surface runs before it, collects candidates from the invocation directory and canonical-path suffixes beside the product-root and absolute spellings it already canonicalizes, resolves them through symbolic links, fails ambiguous operands as the PDR declares, and this node's evidence covers an invocation from inside the product with a subdirectory-relative operand for both surfaces.
