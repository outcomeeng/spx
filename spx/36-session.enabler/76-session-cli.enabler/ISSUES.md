# Open Issues

## Session-file tag extraction is duplicated across test helpers

`spx/36-session.enabler/76-session-cli.enabler/tests/session-cli.compliance.l2.test.ts` parses `<SESSION_FILE>` tags locally while `spx/36-session.enabler/43-session-store.enabler/tests/helpers.ts` owns an `extractSessionFile` helper for the same output.

**Evidence:** The CLI compliance test uses `SESSION_FILE_TAG_PATTERN` to read the file emitted by `spx session handoff`. The session-store tests call `extractSessionFile(output)` for the same tag contract. Keeping both parsers creates a drift point for CLI-level tests.

**Impact:** A future tag-format adjustment could update one parser without the other, leaving one test lane to assert a stale extraction rule.

**Resolution:** Promote `extractSessionFile` to `testing/harnesses/session/harness.ts` or another shared session test harness module, then update the session-store and session-cli tests to import that helper.

## On-branch non-main checkout folds into the detached-at-tip prerequisite

The handoff-base checklist enumerates two base prerequisites — a clean working tree and a HEAD detached at the default-branch tip per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md). A non-main checkout checked out on a named branch resolves the clean prerequisite independently (it can read met) while the detached-at-tip prerequisite reads unmet, so the rendered checklist shows the tree as clean alongside an unmet at-tip line rather than naming "HEAD is on a branch" as its own concern.

**Evidence:** [`session-cli.md`](session-cli.md) and the PDR enumerate exactly the clean-working-tree and detached-at-tip prerequisites; neither names an on-branch prerequisite. The implementation conforms — `detachedAtTipPrerequisite` marks the at-tip line unmet for any non-detached HEAD.

**Impact:** None to correctness; the diagnostic is accurate and the remedy (detach to the tip or run handoff from the main checkout) is actionable. The open question is whether a future spec revision should surface "HEAD is on a branch" as a distinct prerequisite line for sharper agent diagnostics.

**Resolution:** If sharper on-branch diagnostics are wanted, revise [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) and [`session-cli.md`](session-cli.md) through `/authoring` to enumerate the on-branch prerequisite, then extend the resolver and checklist to render it.

## Bare-pool non-main handoff refusal has no L2 coverage

The `session-cli.compliance.l2` test exercises the `SessionHandoffBaseError` refusal only from a non-bare repository's linked worktree (via `withGitWorktreeEnv`). The bare-pool code path — where `mainCheckoutPath` constructs `join(container, repositoryName)` and the checklist renders that as the `main checkout:` fact line — has no end-to-end L2 coverage. The unit-level bare-pool classifier is covered in [`spx/24-worktree-detection.enabler/tests/main-checkout.scenario.l1.test.ts`](../../24-worktree-detection.enabler/tests/main-checkout.scenario.l1.test.ts), but the full `spx session handoff` flow from a bare-pool non-main worktree, including the rendered checklist path, is unexercised.

**Evidence:** [`session-cli.md`](session-cli.md) asserts the checklist carries the main-checkout path; `session-cli.compliance.l2.test.ts` provisions only the non-bare linked-worktree topology.

**Impact:** None observed; the classifier and the checklist rendering are each unit-tested. The gap is end-to-end assurance that the bare-pool path renders the checklist correctly through the CLI.

**Resolution:** Add an L2 case that provisions a bare-repository pool (via `withWorktreeLayoutEnv`) and runs `spx session handoff` from a non-main worktree, asserting the rendered `main checkout:` fact line names the repository-named path.
