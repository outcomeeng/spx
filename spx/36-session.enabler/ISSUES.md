# Open Issues

## 26-worktree-detection.adr.md non-conformance

The ADR at `spx/36-session.enabler/26-worktree-detection.adr.md` has two findings from the aligning audit:

1. **Temporal language** — Line 15: `"Add`detectMainRepoRoot`alongside the existing`detectGitRoot`"`. The word "Add" is imperative/temporal, narrating a change instruction rather than stating permanent decision truth.

2. **Misplaced Testing Strategy section** — Lines 69-81 contain `## Testing Strategy` with `### Level Assignments` table and `### Escalation Rationale`. Test methodology content belongs in spec assertions or test files, not in an ADR per `what-goes-where`.

**Resolution:** Rewrite line 15 as permanent decision truth (e.g., "`detectMainRepoRoot` resolves the main repository root via `--git-common-dir`; `detectGitRoot` resolves the worktree root via `--show-toplevel`."). Remove the `## Testing Strategy` section entirely — either drop it or, if the level assignments are essential, relocate them to spec assertions with `[test]` evidence links.

**Blocking:** None. The ADR's *decisions* are correctly implemented; only the spec file's voice and structure are non-conformant.

## Test-owned constant warning debt

`pnpm run validate` passed on May 12, 2026 and reported 11 warning-level `spx/no-test-owned-domain-constants` findings in this node. These warnings are existing test-quality debt and should be resolved with `spec-tree:testing`, `typescript:testing-typescript`, and `typescript:auditing-typescript-tests`.

Affected files:

- `spx/36-session.enabler/32-session-identity.enabler/tests/session-identity.unit.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.compliance.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l2.test.ts`
- `spx/36-session.enabler/65-session-claim.enabler/tests/session-claim.integration.test.ts`
- `spx/36-session.enabler/tests/session.unit.test.ts`

Resolution: replace each test-owned semantic constant with source-owned constants, source-owned test-data APIs, or generated domain data, then remove the corresponding warning entry from the validation debt manifest.
