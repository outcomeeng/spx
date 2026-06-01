# Open Issues

## Handoff and archive command error-path coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496092724
- Follow-up review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496917494
- Evidence: `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts` covers successful `handoffCommand` git context through `HANDOFF_GIT_DEPS`, while the command-interface failure paths for git context are not covered through the public command handlers. It also does not cover the ordering edge case where content has valid frontmatter syntax but omits `goal` or `next_step` and git context detection throws first.
- Impact: error classes can drift from their command-visible diagnostics without a public workflow test catching the mismatch.
- Resolution: add command-interface scenario coverage for `detectSessionWorkContext` failure paths and validation-vs-git error ordering for missing `goal` / `next_step` before the next session error-handling change.

## Frontmatter key rule ubiquitous-token false-positive coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4499642506
- Evidence: `eslint-rules/no-hardcoded-session-frontmatter-keys.ts` monitors frontmatter key literals including `id`, `branch`, and `files`, while the compliance fixtures do not include non-frontmatter uses of those common strings in session-scoped files.
- Impact: future edits can make the rule noisy by flagging ordinary identifier-like strings as frontmatter violations, or weaken the rule while preserving only the existing happy-path fixtures.
- Resolution: add compliance fixture coverage for monitored ubiquitous tokens used outside frontmatter-key call sites before changing the frontmatter-key rule again.

## Specs/files scenario assertions overlap the property assertion

- Review: `spec-tree:reviewing-changes` on `work/session-store-coverage` — F-001 (consistency, follow_up)
- Evidence: `spx/36-session.enabler/43-session-store.enabler/session-store.md` declares four named scenarios for the `specs` / `files` arrays with YAML-significant characters (`>`, `|`, `{`) and a single empty-string entry. The `arbitraryHandoffHeader` property assertion already proves round-trip fidelity for arbitrary unicode-string arrays, so the four scenarios are subsumed by it — they add named debug-pinpoint witnesses, not coverage breadth.
- Impact: a reader scanning the Scenarios block may infer the property test is narrower than it is, and a future author adding more YAML-sensitive characters may reach for more scenarios rather than trusting the property.
- Resolution: decide whether to replace the four scenario assertions with a cross-reference on the property assertion that names the YAML characters it exercises, or retain them as explicit regression anchors with a note on the property pointing at the named scenarios.

## Handoff warning field is structurally exposed but behaviorally unverified

- Review: `spec-tree:changes-reviewer` on `refactor/cli-session-handoff-stderr` — F-003 (evidence, follow_up)
- Evidence: After ADR-14 reconciliation, `handoffCommand` returns `HandoffResult` with an optional `warning` field that the descriptor at `src/interfaces/cli/session.ts` writes to stderr. No scenario test in `spx/36-session.enabler/43-session-store.enabler/tests/` asserts that `warning` is populated when `resolveSessionConfig` emits its non-git-repo diagnostic, and no test asserts that `warning` is `undefined` under a normal git-repo invocation. The descriptor's stderr write is also unexercised.
- Impact: a future change to the session-config warning text, the handler's pass-through, or the descriptor's stderr formatting can drift without an automated check catching the regression.
- Resolution: add a scenario assertion that injects `GitDependencies` representing a non-git-repo and asserts `result.warning` matches the expected diagnostic, plus a scenario assertion under normal git context that asserts `result.warning === undefined`. Consider a Level 2 assertion that runs `spx session handoff` through the descriptor in a non-git-repo fixture and captures the stderr line.

## Seven session command handlers silently drop the `resolveSessionConfig` warning

- Review: CI `spec-tree-review` on PR #90 — F-001 (consistency, follow_up). [Comment](https://github.com/outcomeeng/spx/pull/90#issuecomment-4587827679).
- Evidence: `src/commands/session/{list,delete,prune,pickup,release,archive,show}.ts` each call `resolveSessionConfig` but destructure only `{ config }`, dropping the optional `warning` field. `src/git/root.ts:258-260` documents the field as "Warning message if not in a git repository". After PR #90 propagates that diagnostic through the `handoff` descriptor, `handoff` is the only session command that surfaces the non-git-repo warning to the user.
- Impact: A user invoking `spx session list` / `delete` / `prune` / `pickup` / `release` / `archive` / `show` outside a git repository receives no indication that session storage is resolving to a fallback path. The asymmetry across the seven peer commands is invisible until someone compares behaviors side-by-side.
- Resolution: Decide whether to (a) return an enriched `{ output, warning? }` result type from each of the seven handlers parallel to `HandoffResult`, with their descriptors emitting the warning to stderr, or (b) introduce a shared `SessionCommandResult` shape every handler returns. Either path is wider scope than a single handler refactor and should land as its own PR once the shape decision is made.

## Session frontmatter serializer duplicated between handoff and the shared writer

- Review: `spec-tree:reviewing-changes` on `fix/session-yaml-round-trip` — F-001 (architecture, follow_up)
- Evidence: `src/commands/session/handoff.ts` builds its own `frontMatterObject` and calls `stringifyYaml` directly because it carries fields (`created_at`, `agent_session_id`) that the shared `stringifySessionFrontMatter` in `src/domains/session/create.ts` does not expose. The two writers are kept aligned by hand: the `defaultStringType: "QUOTE_DOUBLE"` round-trip option from `spx/36-session.enabler/11-session-frontmatter.pdr.md` MUST line 98 is applied at both call sites independently.
- Impact: any future change to the session-frontmatter serialization contract has to be applied in two places, and a drift between the two writers can quietly violate PDR-11 again.
- Resolution: extend `stringifySessionFrontMatter` (or a successor) to accept the optional `created_at` and `agent_session_id` fields so `handoffCommand` composes through it, leaving a single writer that owns the PDR-11 serialization invariant.
