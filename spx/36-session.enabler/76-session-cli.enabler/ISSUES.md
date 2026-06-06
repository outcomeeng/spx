# Open Issues

## Session-file tag extraction is duplicated across test helpers

`spx/36-session.enabler/76-session-cli.enabler/tests/session-cli.compliance.l2.test.ts` parses `<SESSION_FILE>` tags locally while `spx/36-session.enabler/43-session-store.enabler/tests/helpers.ts` owns an `extractSessionFile` helper for the same output.

**Evidence:** The CLI compliance test uses `SESSION_FILE_TAG_PATTERN` to read the file emitted by `spx session handoff`. The session-store tests call `extractSessionFile(output)` for the same tag contract. Keeping both parsers creates a drift point for CLI-level tests.

**Impact:** A future tag-format adjustment could update one parser without the other, leaving one test lane to assert a stale extraction rule.

**Resolution:** Promote `extractSessionFile` to `testing/harnesses/session/harness.ts` or another shared session test harness module, then update the session-store and session-cli tests to import that helper.

## Handoff-base checklist git-fact resolution site is unspecified

The `SessionHandoffBaseError` checklist requires resolved git values on every line (resolved default branch, `origin/<default>` tip SHA, observed HEAD SHA, current worktree path, root-worktree path) per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md). [`session-cli.md`](session-cli.md) states the descriptor renders the checklist from those facts per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md), but neither the spec nor that ADR pins where the facts are resolved.

**Evidence:** [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) makes the descriptor the sole site of stderr writes and fixes the `interfaces/cli → commands → domains` dependency direction, but it does not say whether the domain `SessionHandoffBaseError` object carries the resolved facts or the descriptor resolves them at render time.

**Impact:** The implementation PR could pick either resolution site without a recorded decision, leaving the layering choice implicit and prone to drift.

**Resolution:** In the handoff-base implementation PR, make the resolution site explicit — either the domain error object carries the resolved git facts, or the descriptor resolves them at render time — and confirm or amend [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) (and [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) if behavior is affected) to record it.

## Non-git SessionHandoffBaseError refusal is silent — the implementation renders it distinctly from the checklist

`spx session handoff` raises `SessionHandoffBaseError` in three contexts the implementation PR renders distinctly: a linked-worktree refusal renders the prerequisite checklist; a linked-worktree refusal where `origin/HEAD` is unset marks the base ref unresolved within that checklist (both specified in [`session-cli.md`](session-cli.md) and [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md)); and a non-git base refuses with no diagnostic — a silent non-zero exit.

**Evidence:** [`session-cli.md`](session-cli.md)'s opening statement, its non-git ALWAYS rule, and the companion NEVER rule now agree that the non-git refusal surfaces no diagnostic: the NEVER rule reads that the non-git-repo diagnostic "reads correctly for the read, claim, and retention subcommands that write it; `handoff` writes no non-git diagnostic". The checklist rules are scoped to the linked-worktree refusal and do not govern the non-git case, so the spec is internally consistent on `handoff`'s non-git silence.

**Resolution:** In the handoff-base implementation PR, render the non-git refusal as a silent non-zero exit with no stderr output, distinct from the linked-worktree checklist, and confirm the implementation behavior matches the now-consistent rules — `handoff` writes no non-git diagnostic.
