# Worktree CLI Issues

## Composed terminal text carries no node-local escaping evidence

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node composes through that primitive. It carries no co-located evidence of its own that the property holds at its surface.

**Composed sites:**

- `src/interfaces/cli/worktree.ts` — `writeOutput`, `writeError`, and `handleError` — `git worktree` subprocess output, worktree paths, and occupancy file content

**Impact:** the property rests on the primitive's own evidence under [`spx/13-cli.enabler`](../../13-cli.enabler/cli.md). A later change that hands a finished string to one of these writes reintroduces the defect without failing anything this node owns, because `spx/no-unescaped-terminal-text` reports a value embedded in a write argument and cannot see a bare identifier handed to one.

**Resolution:** add this node's compliance assertion and co-located evidence that a control-byte-bearing worktree path renders escaped through this node's own surface. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries that shape.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
