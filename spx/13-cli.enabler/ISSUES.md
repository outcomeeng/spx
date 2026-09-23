# Known Issues

## The CLI write boundary still accepts unescaped strings

`CliIo.writeStdout` and `CliIo.writeStderr` in `src/interfaces/cli/product-context.ts` take a plain `string`, so the type system permits a caller to hand raw external text to a process stream. Narrowing both to the composed `TerminalText` of `src/lib/terminal-text/` would make [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md)'s escaping invariant unbypassable rather than merely stated.

**Impact:** the invariant is currently enforced by review rather than by the compiler. Until the signature narrows, a new write site can skip composition without any gate objecting.

**Blocked by:** narrowing the signature breaks every unmigrated write site at once. Sixteen nodes still pass raw strings and each carries its own `ISSUES.md` entry naming its sites — among them `spx/41-validation.enabler/21-validation-cli.enabler`, `spx/36-session.enabler/76-session-cli.enabler`, `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler`, and `spx/46-agent.enabler/21-resume.enabler`. This node cannot close the boundary alone.

**Resolution:** after those nodes migrate to `src/lib/terminal-text/`, narrow both `CliIo` write signatures to `TerminalText`, unwrap once inside `DEFAULT_CLI_IO`, and add the compliance assertion and evidence that no write site accepts an unescaped string.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.

## No product diagnostic composes the bounded external token

[`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md) declares that a product diagnostic whose subject is one caller-supplied operand the message echoes back composes that operand as a bounded external token — escaped and truncated to the display length — through the `src/lib/terminal-text/` primitive. `externalToken` in `src/lib/terminal-text/terminal-text.ts` is that composition, and no production module calls it; the only other references are this node's own `tests/terminal-text.compliance.l1.test.ts` and `tests/terminal-text.property.l1.test.ts`. Each diagnostic the decision describes interpolates `sanitizeCliArgument` into a plain string and hands that string to the write boundary instead:

- `src/interfaces/cli/hook.ts:152` — the unknown hook event
- `src/interfaces/cli/validation.ts:272` — the invalid path operand
- `src/interfaces/cli/validation.ts:520` — the unknown subcommand

`src/interfaces/hooks/cli-runner.ts:72`, `src/interfaces/cli/spec.ts:91`, `:103`, `:105`, and `src/interfaces/cli/agent.ts:140`, `:144`, `:153`, `:164` escape their operands the same way.

**Impact:** the bytes reaching the terminal are the same today, because the raw sanitizer applies the same escaping and the same display bound. The composition is what is absent: the decision's rule places the escape where the value is embedded, through the primitive, and these sites decide it at the write site instead, so the property holds by repetition rather than by construction and a new operand diagnostic can omit it with no gate objecting.

**Resolution:** each owning node migrates its operand diagnostic to compose the operand through `externalToken` at its embedding point, under the same per-node migration that clears the write-boundary entry above.

**Skills:** `/apply`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.

## Relayed documents still travel through the composed-text write

[`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md) names a relayed document — agent-authored release notes, a session file's own content, a subprocess's own output — as the case for the pass-through channel that `CliIo.writePassThrough` and `CliIo.writePassThroughError` now carry. The descriptors that relay such documents still hand them to the composed-text write:

- `src/interfaces/cli/session.ts:87` — `spx session show` writes the session file's content through `writeStdout`
- `src/interfaces/cli/compact.ts:62` — the compact command writes its result through `writeStdout`
- `src/interfaces/cli/spec.ts:61` — `spx spec context` hands the context bundle, whose document content is the exact bytes of each read spec, decision, and methodology file, to `writeStdout` through the shared `writeOutput` helper; the `spx spec status` and `spx spec next` reports that share the helper are composed and stay on the composed-text write
- `src/interfaces/cli/agent.ts:242`, `:246`, and `:280` — the resume JSON and list output and the search output reach `writeStdout` through the shared `writeOutput` helper; the composed diagnostics that share `writeError` (`:130`, `:191`, `:228`) are the product's own speech and stay on the composed-text write

**Impact:** none observable today, because both writes take a plain `string` and reach one stream; the channel a command selects states which of the two claims its output makes, and these sites state the wrong one.

**Resolution:** each owning node migrates its descriptor to select the pass-through channel for the document it relays and the composed-text write for the report it composes — `spx/36-session.enabler/76-session-cli.enabler`, `spx/37-compact.enabler`, `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler`, `spx/46-agent.enabler/21-resume.enabler`, and `spx/46-agent.enabler/32-search.enabler` — under the same per-node migration that clears the write-boundary entry above.

**Skills:** `/apply`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.

## Error diagnostics render a doubled `Error:` prefix for base-class errors

Descriptor error handlers compose a literal `Error:` prefix around a message that already interpolates `error.name`, so a plain `Error` renders `Error: Error: <message>`. The sites are `handleError` in `src/interfaces/cli/agent.ts` and the caught-error branch at `src/interfaces/cli/session.ts:381`, both shaped `` `Error: ${error.name}: ${error.message}` ``. The `error.name` clause carries information only for a subclass such as `TypeError`; for the base class it repeats the literal.

Observed through the published executable:

```bash
spx agent search --since abc
# stderr: Error: Error: agent search since must be a positive safe-integer duration: abc
spx agent search --limit abc
# stderr: Error: Error: agent search limit must be a positive integer: abc
```

**Impact:** every base-class error diagnostic on these two domains reads with a duplicated prefix. Exit code, stream routing, and message content are correct, so no gate objects.

**Resolution:** compose the name segment only when it differs from the literal prefix — emit `error.name` when the error is a subclass and omit it for the base class — then cover the composition with evidence under the node's existing Commander-diagnostics compliance assertion, which already governs what these handlers echo to stderr.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.
