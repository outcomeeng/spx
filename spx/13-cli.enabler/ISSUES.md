# Known Issues

## The CLI write boundary still accepts unescaped strings

`CliIo.writeStdout` and `CliIo.writeStderr` in `src/interfaces/cli/product-context.ts` take a plain `string`, so the type system permits a caller to hand raw external text to a process stream. Narrowing both to the composed `TerminalText` of `src/lib/terminal-text/` would make [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md)'s escaping invariant unbypassable rather than merely stated.

**Impact:** the invariant is currently enforced by review rather than by the compiler. Until the signature narrows, a new write site can skip composition without any gate objecting.

**Blocked by:** narrowing the signature breaks every unmigrated write site at once. Seventeen nodes still pass raw strings and each carries its own `ISSUES.md` entry naming its sites — among them `spx/41-validation.enabler/21-validation-cli.enabler`, `spx/36-session.enabler/76-session-cli.enabler`, `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler`, and `spx/46-agent.enabler/21-resume.enabler`. This node cannot close the boundary alone.

**Resolution:** after those nodes migrate to `src/lib/terminal-text/`, narrow both `CliIo` write signatures to `TerminalText`, unwrap once inside `DEFAULT_CLI_IO`, and add the compliance assertion and evidence that no write site accepts an unescaped string.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.
