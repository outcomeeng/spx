# Open Issues

## Detached-HEAD scenario has no CLI-level test coverage

`spx/36-session.enabler/76-session-cli.enabler/session-cli.md` declares a scenario for `SessionDetachedHeadError` propagation through the CLI binding and links it to `tests/session-cli.scenario.l2.test.ts`. Neither `session-cli.scenario.l2.test.ts` nor `session-cli.compliance.l2.test.ts` exercises the detached-HEAD path through `node bin/spx.js` — `grep -rn "SessionDetachedHeadError\|HEAD is detached" tests/` returns nothing.

**Evidence:** The scenario assertion in `session-cli.md` lines 23-24 is unbacked at the CLI level; `SessionDetachedHeadError` raises through the domain layer but no compliance/scenario test asserts the exit-code-1 + stderr-naming behavior through the Commander binding.

**Impact:** The compliance ALWAYS rule that names `SessionDetachedHeadError` in the diagnostic-line set has no concrete fixture; a regression that swallows the error name or routes the error through a different exit code would land silently.

**Resolution:** Add a `runSpx` case to `session-cli.compliance.l2.test.ts` (or a sibling test file) that creates a temp git repo, detaches HEAD via `git checkout <sha>`, pipes a valid JSON handoff header, and asserts `exitCode === 1` with `"SessionDetachedHeadError"` in stderr. Then update the scenario link to point at the file that carries the new test.

## Session-file tag extraction is duplicated across test helpers

`spx/36-session.enabler/76-session-cli.enabler/tests/session-cli.compliance.l2.test.ts` parses `<SESSION_FILE>` tags locally while `spx/36-session.enabler/43-session-store.enabler/tests/helpers.ts` owns an `extractSessionFile` helper for the same output.

**Evidence:** The CLI compliance test uses `SESSION_FILE_TAG_PATTERN` to read the file emitted by `spx session handoff`. The session-store tests call `extractSessionFile(output)` for the same tag contract. Keeping both parsers creates a drift point for CLI-level tests.

**Impact:** A future tag-format adjustment could update one parser without the other, leaving one test lane to assert a stale extraction rule.

**Resolution:** Promote `extractSessionFile` to `testing/harnesses/session/harness.ts` or another shared session test harness module, then update the session-store and session-cli tests to import that helper.
