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
