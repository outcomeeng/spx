# Open Issues

## Handoff and archive command error-path coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496092724
- Follow-up review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496917494
- Evidence: `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts` covers successful `handoffCommand` git context through `HANDOFF_GIT_DEPS`, while the command-interface failure paths for git context are not covered through the public command handlers. It also does not cover the ordering edge case where content has valid frontmatter syntax but omits `goal` or `next_step` and git context detection throws first.
- Impact: error classes can drift from their command-visible diagnostics without a public workflow test catching the mismatch.
- Resolution: add command-interface scenario coverage for `detectSessionWorkContext` failure paths and validation-vs-git error ordering for missing `goal` / `next_step` before the next session error-handling change.

## Frontmatter key rule ubiquitous-token false-positive coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4499642506
- Evidence: `eslint-rules/no-hardcoded-session-frontmatter-keys.ts` monitors frontmatter key literals including `id`, `git_ref`, and `files`, while the compliance fixtures do not include non-frontmatter uses of those common strings in session-scoped files.
- Impact: future edits can make the rule noisy by flagging ordinary identifier-like strings as frontmatter violations, or weaken the rule while preserving only the existing happy-path fixtures.
- Resolution: add compliance fixture coverage for monitored ubiquitous tokens (including `git_ref`) used outside frontmatter-key call sites before the implementation PR renames the monitored constant and changes the frontmatter-key rule.

## Specs/files scenario assertions overlap the property assertion

- Review: `spec-tree:reviewing-changes` on `work/session-store-coverage` — F-001 (consistency, follow_up)
- Evidence: `spx/36-session.enabler/43-session-store.enabler/session-store.md` declares four named scenarios for the `specs` / `files` arrays with YAML-significant characters (`>`, `|`, `{`) and a single empty-string entry. The `arbitraryHandoffHeader` property assertion already proves round-trip fidelity for arbitrary unicode-string arrays, so the four scenarios are subsumed by it — they add named debug-pinpoint witnesses, not coverage breadth.
- Impact: a reader scanning the Scenarios block may infer the property test is narrower than it is, and a future author adding more YAML-sensitive characters may reach for more scenarios rather than trusting the property.
- Resolution: decide whether to replace the four scenario assertions with a cross-reference on the property assertion that names the YAML characters it exercises, or retain them as explicit regression anchors with a note on the property pointing at the named scenarios.

## Session frontmatter serializer duplicated between handoff and the shared writer

- Review: `spec-tree:reviewing-changes` on `fix/session-yaml-round-trip` — F-001 (architecture, follow_up)
- Evidence: `src/commands/session/handoff.ts` builds its own `frontMatterObject` and calls `stringifyYaml` directly because it carries fields (`created_at`, `agent_session_id`) that the shared `stringifySessionFrontMatter` in `src/domains/session/create.ts` does not expose. The two writers are kept aligned by hand: the `defaultStringType: "QUOTE_DOUBLE"` round-trip option from `spx/36-session.enabler/11-session-frontmatter.pdr.md` MUST line 98 is applied at both call sites independently.
- Impact: any future change to the session-frontmatter serialization contract has to be applied in two places, and a drift between the two writers can quietly violate PDR-11 again.
- Resolution: extend `stringifySessionFrontMatter` (or a successor) to accept the optional `created_at` and `agent_session_id` fields so `handoffCommand` composes through it, leaving a single writer that owns the PDR-11 serialization invariant.
