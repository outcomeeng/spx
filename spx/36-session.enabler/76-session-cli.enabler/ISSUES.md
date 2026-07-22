# Open Issues

## On-branch non-main checkout folds into the detached-at-tip prerequisite

The handoff-base checklist enumerates two base prerequisites — a clean working tree and a HEAD detached at the default-branch tip per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md). A non-main checkout checked out on a named branch resolves the clean prerequisite independently (it can read met) while the detached-at-tip prerequisite reads unmet, so the rendered checklist shows the tree as clean alongside an unmet at-tip line rather than naming "HEAD is on a branch" as its own concern.

**Evidence:** [`session-cli.md`](session-cli.md) and the PDR enumerate exactly the clean-working-tree and detached-at-tip prerequisites; neither names an on-branch prerequisite. The implementation conforms — `detachedAtTipPrerequisite` marks the at-tip line unmet for any non-detached HEAD.

**Impact:** None to correctness; the diagnostic is accurate and the remedy (detach to the tip or run handoff from the main checkout) is actionable. The open question is whether a future spec revision should surface "HEAD is on a branch" as a distinct prerequisite line for sharper agent diagnostics.

**Resolution:** If sharper on-branch diagnostics are wanted, revise [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) and [`session-cli.md`](session-cli.md) through `/authoring` to enumerate the on-branch prerequisite, then extend the resolver and checklist to render it.

## Color-choice precedence is duplicated between the session list and the styled-output primitive

The session list resolves the `--color`/`--no-color` → `NO_COLOR` → TTY precedence through `resolveListColor` and `colorFlagFromOption` in [`src/domains/session/list.ts`](../../../src/domains/session/list.ts) and [`src/interfaces/cli/session.ts`](../../../src/interfaces/cli/session.ts), while the shared styled-output primitive owns the same precedence in `resolveColorChoice` at [`src/lib/styled-output/styled-output.ts`](../../../src/lib/styled-output/styled-output.ts).

**Evidence:** Two derivations of one precedence contract. They are currently equivalent on every documented input — both treat an empty-string `NO_COLOR` as unset and both fall through to TTY status when neither flag is set.

**Impact:** None to correctness today; the drift risk is a future override input (for example `FORCE_COLOR`) added to one derivation but not the other, leaving the two color decisions inconsistent.

**Resolution:** Migrate the session path to the shared `resolveColorChoice` primitive in `src/lib/styled-output/`, removing `resolveListColor` as a second derivation. Deferred from the styled-output slice, which scoped the primitive so session output can adopt it later without refactoring session output in that slice.

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/session.ts` — `writeOutput`, `writeError`, and `formatError` — session file fields (goal, next step, branch, identifiers) and caught session-store errors

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.
