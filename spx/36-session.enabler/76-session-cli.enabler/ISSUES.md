# Open Issues

## Session-file tag extraction is duplicated across test helpers

`testing/harnesses/session/harness.ts` exposes `SESSION_FILE_TAG_PATTERN`, which `session-cli.compliance.l2.test.ts` uses to read the file emitted by `spx session handoff`, while `testing/harnesses/session/session-store.ts` owns an `extractSessionFile` helper that parses the same `<SESSION_FILE>` tag.

**Evidence:** Two parsers cover one tag contract — the regex pattern in `harness.ts` and `extractSessionFile` in `session-store.ts`. Keeping both creates a drift point for CLI-level tests.

**Impact:** A future tag-format adjustment could update one parser without the other, leaving one test lane to assert a stale extraction rule.

**Resolution:** Unify on one shared parser — fold `SESSION_FILE_TAG_PATTERN` and `extractSessionFile` into a single session-harness helper and re-point both lanes to it.

## On-branch non-main checkout folds into the detached-at-tip prerequisite

The handoff-base checklist enumerates two base prerequisites — a clean working tree and a HEAD detached at the default-branch tip per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md). A non-main checkout checked out on a named branch resolves the clean prerequisite independently (it can read met) while the detached-at-tip prerequisite reads unmet, so the rendered checklist shows the tree as clean alongside an unmet at-tip line rather than naming "HEAD is on a branch" as its own concern.

**Evidence:** [`session-cli.md`](session-cli.md) and the PDR enumerate exactly the clean-working-tree and detached-at-tip prerequisites; neither names an on-branch prerequisite. The implementation conforms — `detachedAtTipPrerequisite` marks the at-tip line unmet for any non-detached HEAD.

**Impact:** None to correctness; the diagnostic is accurate and the remedy (detach to the tip or run handoff from the main checkout) is actionable. The open question is whether a future spec revision should surface "HEAD is on a branch" as a distinct prerequisite line for sharper agent diagnostics.

**Resolution:** If sharper on-branch diagnostics are wanted, revise [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) and [`session-cli.md`](session-cli.md) through `/authoring` to enumerate the on-branch prerequisite, then extend the resolver and checklist to render it.

## Duplicate built-CLI runner in the session test harness

`testing/harnesses/session/harness.ts` exports two built-CLI runners: `runSessionCli` (the list-output suites) and `runSpxSession` (the handoff-base L2 suites). The two were extracted independently and `runSpxSession` is now a thin alias of `runSessionCli`.

**Evidence:** Both run `node bin/spx.js` through `execa` and return the same `SessionCliResult`. `runSpxSession` exists only so the handoff-base wiring smokes and git_ref tests in `session-cli.compliance.l2.test.ts` need no rename.

**Impact:** None to behavior; the alias forwards to `runSessionCli`. The two names are a drift point — a future runner change could touch one and not the caller's mental model.

**Resolution:** Re-point the `runSpxSession` call sites in `session-cli.compliance.l2.test.ts` to `runSessionCli`, then remove the `runSpxSession` alias.

## Path-segment and branch-name generators duplicated across testing generators

`testing/generators/session/handoff-base.ts` privately defines `PATH_SEGMENT_PATTERN`, a path-segment arbitrary, and exports `arbitraryBranchName()` as that arbitrary — identical to copies in `testing/generators/main-checkout/main-checkout.ts`, `testing/generators/testing/run-state.ts`, and `testing/generators/audit/run-state.ts`. `PATH_SEGMENT_PATTERN` alone also recurs in `testing/generators/git-worktree/git-worktree.ts` and `testing/generators/release/release.ts`.

**Evidence:** Every copy uses `/^[a-z][a-z0-9-]{2,12}$/` and `arbitraryBranchName` is defined four times. No shared module owns the git-name vocabulary, so the implementations agree only by hand.

**Impact:** A domain-driven change to the path-segment pattern must be tracked down and replicated across every copy; a missed site drifts silently.

**Resolution:** Extract `PATH_SEGMENT_PATTERN`, the path-segment arbitrary, and `arbitraryBranchName()` into one shared git-name generator module and re-point every site to it.

## Handoff-base gate test sits at session-store while its rendering ADR sits at session-cli

`handoff-base-gate.property.l1.test.ts` and its `session-store.md` property assertion (node 43) verify `resolveHandoffGitRef`, whose layering invariants are declared by [`spx/36-session.enabler/76-session-cli.enabler/21-handoff-base-rendering.adr.md`](21-handoff-base-rendering.adr.md) (node 76). A reader of that ADR finds the rendering `[test]` evidence co-located at node 76 but the gate-decision `[test]` evidence at node 43.

**Evidence:** The gate decision is consumed by `handoffCommand`, which the session-store node owns, so the placement is defensible; the ADR's resolver rules are `[audit]` constraints, not `[test]` assertions, and node 76 already carries the render-property `[test]` assertions that trace to the ADR.

**Impact:** Navigation only — a reader tracing the ADR's resolver invariants to executable evidence crosses a node boundary.

**Resolution (open question):** Decide via `/refactor` whether the gate-decision property belongs at node 76 beside the rendering ADR, or stays at node 43 with the `handoffCommand` consumer it verifies. No move until that decision is made.
