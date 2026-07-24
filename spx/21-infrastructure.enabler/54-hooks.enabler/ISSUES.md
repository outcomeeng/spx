# Known Issues

## Composed terminal text carries no node-local escaping evidence

This node's terminal output path composes through the `src/lib/terminal-text/` primitive, so an externally-originated segment is escaped where it is embedded and product-authored segments keep their bytes, as [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) requires. The node carries no co-located evidence of its own that the property holds at its surface.

**Composed sites:**

- `src/interfaces/cli/hook.ts` — the hook warnings and the agent-environment config read error — filesystem paths, git state, and environment values
- `src/interfaces/hooks/cli-runner.ts` — the stdin read error, the hook-event error, the hook diagnostics, and the hook payload written to stdout — stdin JSON, environment variables, and session file content

**Impact:** the property rests on the primitive's own evidence under [`spx/13-cli.enabler`](../../13-cli.enabler/cli.md). A later change that hands a finished string to a write at one of these sites reintroduces the defect without failing anything this node owns, because `spx/no-unescaped-terminal-text` reports a value embedded in a write argument and not a bare identifier handed to one.

**Resolution:** add this node's compliance assertion and co-located evidence that a control-byte-bearing value renders escaped through this node's own surface. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries that shape.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
