# Open Issues

## 26-worktree-detection.adr.md non-conformance

The ADR at `spx/36-session.enabler/26-worktree-detection.adr.md` has two findings from the aligning audit:

1. **Temporal language** — Line 15: `"Add`detectMainRepoRoot`alongside the existing`detectGitRoot`"`. The word "Add" is imperative/temporal, narrating a change instruction rather than stating permanent decision truth.

2. **Misplaced Testing Strategy section** — Lines 69-81 contain `## Testing Strategy` with `### Level Assignments` table and `### Escalation Rationale`. Test methodology content belongs in spec assertions or test files, not in an ADR per `what-goes-where`.

**Resolution:** Rewrite line 15 as permanent decision truth (e.g., "`detectMainRepoRoot` resolves the main repository root via `--git-common-dir`; `detectGitRoot` resolves the worktree root via `--show-toplevel`."). Remove the `## Testing Strategy` section entirely — either drop it or, if the level assignments are essential, relocate them to spec assertions with `[test]` evidence links.

**Blocking:** None. The ADR's *decisions* are correctly implemented; only the spec file's voice and structure are non-conformant.
