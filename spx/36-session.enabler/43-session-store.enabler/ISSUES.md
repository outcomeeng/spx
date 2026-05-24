# Open Issues

## Handoff and archive command error-path coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496092724
- Follow-up review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496917494
- Evidence: `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts` covers successful `handoffCommand` git context through `HANDOFF_GIT_DEPS`, while the command-interface failure paths for git context and empty archive `result` are not covered through the public command handlers. It also does not cover the ordering edge case where content has valid frontmatter syntax but omits `goal` or `next_step` and git context detection throws first.
- Impact: error classes can drift from their command-visible diagnostics without a public workflow test catching the mismatch.
- Resolution: add command-interface scenario coverage for `detectSessionWorkContext` failure paths, validation-vs-git error ordering for missing `goal` / `next_step`, and `SessionInvalidResultError` before the next session error-handling change.

## Frontmatter key rule ubiquitous-token false-positive coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4499642506
- Evidence: `eslint-rules/no-hardcoded-session-frontmatter-keys.ts` monitors frontmatter key literals including `id`, `branch`, `result`, and `files`, while the compliance fixtures do not include non-frontmatter uses of those common strings in session-scoped files.
- Impact: future edits can make the rule noisy by flagging ordinary identifier-like strings as frontmatter violations, or weaken the rule while preserving only the existing happy-path fixtures.
- Resolution: add compliance fixture coverage for monitored ubiquitous tokens used outside frontmatter-key call sites before changing the frontmatter-key rule again.

## CRLF separator between JSON header and body is not stripped

- Evidence: `src/commands/session/parse-handoff-input.ts` separator-stripping logic tests only `NEWLINE_CHAR_CODE` (0x0A) at the body-start offset. A caller that emits a `\r\n` line terminator between the JSON header's closing `}` and the body — e.g., PowerShell `Write-Output`, a Windows-side shell, or a CRLF-normalising pipe — leaves the leading `\r` (0x0D) in `body`, which is then written verbatim to the session file. The current spec is silent on `\r\n` separators, so the implementation is internally consistent.
- Impact: cross-platform behavior is unspecified — Windows callers piping through CRLF-normalising tools see a stray `\r` at the head of the body, surprising the "body bytes verbatim" expectation.
- Resolution: extend PDR-11's input wire format clause to declare the separator semantics explicitly (either "single LF" with CRLF rejection, or "single LF or CRLF" with stripping). Then update `parseHandoffInput` to match the declared semantic and add a scenario test for the chosen behavior.

## Scenario regressions for YAML-significant characters in specs/files arrays

- Evidence: `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts` carries bug-report regressions for `#` in `goal`, `#` in `next_step`, and `:` in `next_step`, but no dedicated scenario regression documents the `specs` / `files` array round-trip for YAML-significant characters like `>`, `|`, or `{`, nor for empty-string entries that `fc.array(fc.string())` already generates inside the property test. The `arbitraryHandoffHeader` property test covers the input domain (any unicode string in array entries, including the empty string), so the round-trip behavior is asserted, but a future failure shrinks through fast-check rather than landing on a named scenario.
- Impact: a regression that affects only `specs` / `files` (and not `goal` / `next_step`) would surface as a property-test counterexample without a debug-pinpoint scenario; the named scenarios for `#` and `:` in `goal` / `next_step` are easier to triage when a single field's encoding regresses.
- Resolution: add explicit scenarios under `describe("handoffCommand with real filesystem", ...)` exercising `specs: [">", "|", "{"]`, `files: [">", "|", "{"]`, and `specs: [""]` / `files: [""]` round-trip when this node is next touched.
