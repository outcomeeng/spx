# Known Issues

## The CLI write boundary still accepts unescaped strings

`CliIo.writeStdout` and `CliIo.writeStderr` in `src/interfaces/cli/product-context.ts` take a plain `string`, so the type system permits a caller to hand raw external text to a process stream. Narrowing both to the composed `TerminalText` of `src/lib/terminal-text/` would make [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md)'s escaping invariant unbypassable rather than merely stated.

**Impact:** the invariant is currently enforced by review rather than by the compiler. Until the signature narrows, a new write site can skip composition without any gate objecting.

**Blocked by:** narrowing the signature breaks every unmigrated write site at once. Eight nodes still pass raw strings and each carries its own `ISSUES.md` entry naming its remaining sites:

- fully unmigrated — `spx/16-config.enabler/21-config-cli.enabler`, `spx/21-infrastructure.enabler/43-precommit.enabler`, `spx/34-verification.enabler/21-verification-context.enabler`, `spx/34-verification.enabler/32-verify.enabler`, `spx/36-session.enabler/87-session-pick.enabler`, `spx/37-compact.enabler`, `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler`
- partly migrated — `spx/46-agent.enabler/21-resume.enabler`

One of those remainders needs a boundary this node does not expose: an Ink component tree renders through the React reconciler rather than a process stream, so an interactive row has no write site to compose at.

**Resolution:** settle where an interactive interface escapes an external value, migrate the eight nodes above, then narrow both `CliIo` write signatures to `TerminalText`, unwrap once inside `DEFAULT_CLI_IO`, and add the compliance assertion and evidence that no write site accepts an unescaped string. Narrowing is what closes the residual class for good: a bare identifier handed to a write is exactly what a type check reads and what `spx/no-unescaped-terminal-text` structurally cannot see.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.
