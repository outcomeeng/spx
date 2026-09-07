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

## `spx verification <type> run` is unwired and its evidence links are broken

`21-execute-run.enabler/execute-run.md` carries three `[compliance]` assertions linking `tests/execute-run.compliance.l1.test.ts`; no `tests/` directory exists under that node, so all three links are broken. The node sits in `spx/EXCLUDE`, and `src/interfaces/cli/verify.ts` registers no `spx verification <type> run` command path. The executor it would drive exists (`src/commands/verification-exec/`), and its `test` runner now resolves the product's own Vitest (`spx/41-test.enabler/21-typescript-test.enabler/typescript-test.md`, the Vitest-resolution compliance assertions), so nothing below the surface blocks it.

**Resolution:** `/apply` the execute-run node: wire the command paths per product property 2 of the PDR, write the compliance evidence the spec links, remove the `spx/EXCLUDE` entry, and regenerate the committed status through the projector on fresh `dist/` (never by hand). Place the descriptor code according to the layer-name decision above.

**Skills:** `/apply`, `/test-typescript`, `/code-typescript`.

## The executor fold and seal erase the unresolved-runner outcome

A descriptor's journal-streaming run reports three outcomes (`JournalRunInvocation` in `src/test/languages/types.ts`): gated out by language detection, `{ invoked: false, unresolvedRunner: { productDir } }` when the product directory supplies no runner, and invoked with a terminal status. `resolveTestRunner` in `src/commands/verification-exec/test-runner.ts` folds only invoked statuses, so an unresolved runner collapses to `{ invoked: false }`, and `executeVerificationRun` seals both non-invoked outcomes as `interrupted` (`GATED_OUT_TERMINAL_STATUS`). The run journal and any command diagnostic built on it cannot tell "language absent" from "product has no runner".

**Owner:** the fold and seal semantics belong to `spx/34-verification.enabler/43-execute.enabler`; the diagnostic a caller reads belongs to `21-execute-run.enabler`.

**Resolution:** with the execute-run `/apply`: decide the seal status and terminal metadata for an unresolved runner at the executor node, propagate the searched product directory into the command's exit diagnostic, and add executor-node evidence for the fold.

**Skills:** `/apply`, `/test-typescript`.

## CLI source layers carry the pre-surfaces layer names

Product-wide; recorded in [`spx/ISSUES.md`](../../../ISSUES.md). It gates the two resolutions above because both move files under `src/interfaces/cli/`.

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/verify.ts` — the verification surface output — git refs and journal file content

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
