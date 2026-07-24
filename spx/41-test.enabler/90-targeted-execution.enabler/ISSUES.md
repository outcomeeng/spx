# Known Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node's diagnostic path composes through that primitive; its agent-mode output path does not.

**Composed sites:**

- `src/interfaces/cli/test.ts` — the caught-error branches and the unresolved-target warnings — caught errors embedding filesystem paths, and argv-supplied target operands

**Remaining sites:**

- `src/interfaces/cli/test-agent-output.ts` — `formatAgentTestOutput` returns a plain `string` built from run, stdout, stderr, and failing-test filesystem paths
- `src/interfaces/cli/test.ts` — the agent-mode write hands that string to the composed-text channel as a bare identifier, so neither the type nor the rule objects

**Impact:** a runner's stdout carrying an escape byte can reposition the cursor, recolor the terminal, or clear the screen, and a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls a failing test's output controls those bytes. `spx/no-unescaped-terminal-text` reports a value embedded in a write argument and cannot see a bare identifier handed to one, so the agent-mode path passes every gate.

**Resolution:** decide the agent-mode output's kind — a report the product composes, or a runner document relayed byte-for-byte — then route it through the matching channel and add this node's compliance assertion and co-located evidence. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the composed-side shape.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
