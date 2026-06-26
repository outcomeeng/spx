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

## Status projection fails the pickup no-inject assertion

Running the status projection with `pnpm exec tsx src/cli.ts spec status --update --format json > /tmp/spx-status.json` exits 0 but reports the session CLI compliance assertion `ALWAYS: pickup --no-inject suppresses CLI auto-injection` as failing.

**Evidence:** The projection reports an expected exit code of 0 and an actual exit code of 1 for [`tests/session-cli.compliance.l2.test.ts`](tests/session-cli.compliance.l2.test.ts), exposed at line 281 in the assertion `ALWAYS: pickup --no-inject suppresses CLI auto-injection`.

**Impact:** The test-status projection records stale or failing evidence for the session CLI node even though the projection command itself exits successfully, weakening confidence in status-derived readiness views for this node.

**Resolution:** Diagnose the `pickup --no-inject` fixture and CLI path under `/apply` for the session CLI node, then refresh the node status after the assertion passes.
