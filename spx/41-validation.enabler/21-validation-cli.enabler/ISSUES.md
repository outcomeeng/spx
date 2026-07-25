# Known Issues

## Tool output reaches the terminal through the composed-text channel

[`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) resolves a command's standard output to one of two kinds: composed spx output, whose external segments are escaped where they are embedded, or a document relayed byte-for-byte through the pass-through channel. A tool's own document — its streamed bytes, formatting and colour intact — is relayed; escaping it would mangle every tool's output. A stage line that quotes a tool's summary between an spx-authored counter and duration is not that document but a report spx composes about the run, so it composes and escapes the quoted segment. This node's remaining paths hand a tool's document itself to the composed-text write, which is the mixture the invariant forbids.

**Resolved site:**

- `src/interfaces/cli/validation.ts` — `onStageComplete` — the stage line is a mixture: an authored `[n/total]` counter and duration around a tool's own output. It composes as `TerminalText`, so the counter and duration keep their bytes while the tool segment is escaped where it is embedded

- `src/interfaces/cli/validation.ts` — `validationSubprocessOutputStreams` — the streamed stdout and stderr chunks from tsc, eslint, knip, dprint, and markdownlint, relayed through `writePassThrough` and `writePassThroughError` so each tool's own bytes reach the terminal intact

**Remaining site:**

- `src/interfaces/cli/validation.ts` — `emitValidationResult` — `result.terminalOutput ?? result.output`, whose kind varies by subcommand. A leaf subcommand's `terminalOutput` is the tool's own document (`streamedValidationTerminalOutput` in `src/commands/validation/{lint,typescript,knip,formatting}.ts`), while `all` sets it to an spx-composed aggregate summary (`src/commands/validation/all.ts`). One write site serves both, so it cannot state which kind it holds.

**Impact:** the composed-text write claims its argument carries the escaping decisions made where its values were embedded. At this site the claim is false whenever the payload is a leaf tool's document, and the tool bytes reach the terminal unescaped. `spx/no-unescaped-terminal-text` reports a value embedded in a write argument and cannot see a bare identifier handed to one, so nothing fails.

**Resolution:** the write site cannot infer the kind, so the producer declares it — add a discriminant to `ValidationCommandResult` in `src/commands/validation/types.ts`, set it to the document kind in each leaf tool producer and the composed kind in `all`, and branch `emitValidationResult` on it so each payload takes the channel that matches what it is. Then add this node's compliance assertion and co-located evidence that a tool's bytes reach the terminal unchanged while an spx-composed stage line escapes a control-byte-bearing path.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
