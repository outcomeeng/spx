# Open Issues

## Detached-HEAD handoff produces uninformative `branch` value

Per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md), `spx session handoff` prefills `branch` from `git rev-parse --abbrev-ref HEAD`. In a detached-HEAD state, that command returns the literal string `"HEAD"`. The non-empty validation passes, but the resulting `branch` value is indistinguishable from a branch literally named `HEAD` and does not identify the worktree's actual position.

**Skills:** `spec-tree:applying`, `typescript:coding-typescript`.

**Resolution candidates** for Phase 2 implementation of `src/commands/session/handoff.ts`:

- Refuse handoff in detached-HEAD state with a clear error (e.g., `SessionDetachedHeadError`). Forces the caller to create a branch first.
- Record the commit SHA as the `branch` value and document the convention.
- Accept `"HEAD"` as-is and document the trade-off in PDR-11.

The decision belongs in Phase 2 implementation work; the PDR governs only that `branch` is non-empty and corresponds to the current ref.
