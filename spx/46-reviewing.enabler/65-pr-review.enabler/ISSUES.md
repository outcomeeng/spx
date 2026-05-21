# Issues: PR Review

## Align DEBT severity with PR merge-gate behavior

**Class:** FOLLOW-UP [consistency]

**Surfaced by:** [PR #56 automated review](https://github.com/outcomeeng/spx/pull/56#issuecomment-4506319279).

**Evidence:** [CLAUDE.md](../../../CLAUDE.md) treats `DEBT` as an active-loop category that must be fixed in the same PR, while the shared Spec Tree review taxonomy describes `DEBT` as a must-fix-eventually defect that does not jeopardize shipping.

**Impact:** Reviewers and managing agents can apply different merge-gate weight to the same `DEBT` label.

**Resolution:** Align the shared managing-PR/review taxonomy with the repository PR-loop rule, or update the repository rule after the shared taxonomy defines a different merge-blocking label.
