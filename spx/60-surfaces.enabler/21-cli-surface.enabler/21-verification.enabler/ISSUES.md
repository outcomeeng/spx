# Known Issues

> Coordination note, not product truth. Reconcile against `verification.md`, the children's specs, `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`, `spx/14-cli-composition.adr.md`, and `spx/ISSUES.md` before acting. The issues below are sustainable to fix only inside the spec-tree restructuring `spx/PLAN.md` coordinates; each names the change that unblocks it.

## The verification command family spans four spellings of one domain name

[`spx/14-cli-composition.adr.md`](../../../14-cli-composition.adr.md) composes each command domain from one `{domain}` name across `src/domains/{domain}/`, `src/commands/{domain}/`, and `src/interfaces/cli/{domain}.ts`. The verification family names that domain four ways:

| Layer                   | Path                                                                     | Name           |
| ----------------------- | ------------------------------------------------------------------------ | -------------- |
| domain                  | `src/domains/verify/`                                                    | `verify`       |
| handlers                | `src/commands/verify/` and `src/commands/verification-exec/`             | both           |
| descriptor              | `src/interfaces/cli/verify.ts`                                           | `verify`       |
| registered root command | `VERIFICATION_RUN_CLI_SURFACE.rootCommandName` in that descriptor        | `verification` |
| governing PDR filename  | `13-verify-command-surface.pdr.md`, governing the `verification` surface | `verify`       |

The descriptor contradicts itself: it declares `forbiddenRootCommandName: "verify"` while living in `verify.ts`, and the record-run compliance evidence imports it from `@/interfaces/cli/verify`.

**Impact:** every new command path in this family chooses a spelling, and the split between `src/commands/verify/` and `src/commands/verification-exec/` hides that the caller-driven and spx-driven handlers are one command domain.

**Resolution:** one domain name, `verification`, across the three layers: `git mv src/domains/verify → src/domains/verification`, fold `src/commands/verification-exec/` into `src/commands/verification/`, `git mv src/interfaces/cli/verify.ts → src/interfaces/cli/verification.ts`, and `git mv` the PDR to `13-verification-command-surface.pdr.md`, updating every import and the record-run evidence in the same change. Do this after the layer-name decision in `spx/ISSUES.md` ("CLI source layers carry the pre-surfaces layer names") so the descriptor moves once, not twice.

**Skills:** `/refactor`, `/apply`, `/audit-typescript-code`.

## CLI source layers carry the pre-surfaces layer names

Product-wide; recorded in [`spx/ISSUES.md`](../../../ISSUES.md). It gates the naming resolution above because that resolution moves files under `src/interfaces/cli/`.

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/verify.ts` — the caller-driven `spx verification run` command paths' output — git refs and journal file content; the spx-driven `spx verification <type> run` path composes its warning and diagnostics through the primitive and serializes its structured result through the primitive's JSON composition, so it carries none of this debt

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## The execute-run descriptor's production composition has no linked evidence

The `spx verification <type> run` descriptor composes its handler's dependencies in `src/interfaces/cli/verify.ts` — the effective invocation directory it forwards as `cwd`, the journal stream binding it wraps as the recorder, and the default handler map that binds `executeRunCommand` — and the node's decision routes descriptor verification to the built executable. Every descriptor observation the node's evidence drives injects either the handler or the handler's dependencies, so a mutation that forwards a different invocation directory or binds a different handler in the default map leaves the suite green, and no `l2` test exercises the command through `node bin/spx.js`.

**Evidence:** `src/interfaces/cli/verify.ts` `registerExecuteRunCommands` and `DEFAULT_VERIFY_CLI_HANDLERS`; `testing/harnesses/verify/execute-run.ts` `parseExecuteRunCommandLine`; test-evidence audit of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-execute-run.enabler` at `b1bb37f0bfb0fa72fb2f8470032d922fa84d9293`.

**Impact:** the three composition lines between the parsed command line and the real handler are covered only by the shared CLI program's own evidence, not by this node's.

**Settlement condition:** an `l2` compliance case runs the built executable over a temp product with a registered runner and observes the recorded run's root and the structured result on standard output, or the descriptor composition is factored so an `l1` observation reaches it without injecting the handler.
