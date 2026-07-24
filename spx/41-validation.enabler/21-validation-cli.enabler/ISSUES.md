# Known Issues

## Tool output reaches the terminal through the composed-text channel

[`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) resolves a command's standard output to one of two kinds: composed spx output, whose external segments are escaped where they are embedded, or a document relayed byte-for-byte through the pass-through channel. A tool's own output is a relayed document — escaping it would mangle every tool's formatting and colour. The per-stage completion output takes that channel; this node's remaining tool-output paths still hand raw subprocess bytes to the composed-text write, which is the mixture the invariant forbids.

**Resolved site:**

- `src/interfaces/cli/validation.ts` — `onStageComplete` — relayed through the pass-through channel

**Remaining sites:**

- `src/interfaces/cli/validation.ts` — `validationSubprocessOutputStreams` — the streamed stdout and stderr chunks from tsc, eslint, knip, dprint, and markdownlint, passed to `writeStdout` and `writeStderr` as raw strings
- `src/interfaces/cli/validation.ts` — `emitValidationResult` — `result.terminalOutput ?? result.output`, which carries tool output composed by `src/commands/validation/`

**Impact:** the composed-text write claims its argument carries the escaping decisions made where its values were embedded. These sites hand it a foreign document instead, so the claim is false at three paths and the tool bytes reach the terminal unescaped. `spx/no-unescaped-terminal-text` reports a value embedded in a write argument and cannot see a bare identifier handed to one, so nothing fails.

**Blocked by:** the pass-through channel relays standard output only. A subprocess's stderr is equally a foreign document and has no relay, so `writeStderr` cannot express the correct claim until the channel covers both streams.

**Resolution:** extend the pass-through channel to standard error, route both streamed chunks and the tool-output portion of the result through it, and add this node's compliance assertion and co-located evidence that a tool's bytes reach the terminal unchanged while a spx-composed stage line escapes a control-byte-bearing path.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
