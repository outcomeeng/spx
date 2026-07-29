# Known Issues

## A formatted target failure is escaped once here and again at the write site

`formatSpecContextTargetFailure` in `src/interfaces/cli/spec.ts` passes every interpolated
value through `sanitizeCliArgument`, and its only production consumer throws the result as an
`Error`. `handleCommandError` in the same file catches that error and composes the message
through `externalValue`, because a caught-error message is externally originated and
[`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../../13-cli.enabler/15-cli-architecture.adr.md)
requires escaping it where it is embedded. The escaper therefore runs twice over the same
text, which that decision's "NEVER escape a value twice" rule forbids.

**Impact:** none observable. `escapeCliArgument` finds no raw control byte in its own output, so
the second pass is an identity and the rendered diagnostic is byte-identical either way.

**Blocked by:** the two escapes are each correct where they stand. `handleCommandError` receives
`unknown` from every throw site in the domain and cannot know which of them pre-escaped, so the
write-site escape stays. Removing the formatter's escape instead changes this node's declared
contract — `target-resolution.md` states the formatter renders a failure safe for terminal
presentation, and `tests/context-target-resolution.mapping.l1.test.ts` asserts the sanitized
value appears in the returned message.

**Resolution:** decide whether this node's formatter owns terminal safety or returns a plain
diagnostic string its CLI consumer composes. If the consumer owns it, drop `sanitizeCliArgument`
from the formatter, restate the assertion in `target-resolution.md` in terms of the returned
diagnostic rather than its escaping, and update the mapping test with it.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.
