# Worktree CLI Issues

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Migrated:** `src/commands/worktree/status.ts` composes the status report — the grouped text tree's parent directories, worktree basenames, runtimes, and pids as external segments, and the JSON projection through the primitive's JSON composition — and the non-git-repo diagnostic arrives composed from the shared root resolution.

**Unescaped sites:**

- `src/interfaces/cli/worktree.ts` — `writeOutput` accepts the rendered status report as a plain string, and `writeError` and `handleError` splice the claim, release, and status failure messages — `git worktree` subprocess output, worktree paths, and occupancy file content — into a plain string

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
