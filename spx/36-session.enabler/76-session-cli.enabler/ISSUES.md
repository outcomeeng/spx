# Open Issues

## Detached-HEAD scenario has no CLI-level test coverage

`spx/36-session.enabler/76-session-cli.enabler/session-cli.md` declares a scenario for `SessionDetachedHeadError` propagation through the CLI binding and links it to `tests/session-cli.scenario.l2.test.ts`. Neither `session-cli.scenario.l2.test.ts` nor `session-cli.compliance.l2.test.ts` exercises the detached-HEAD path through `node bin/spx.js` — `grep -rn "SessionDetachedHeadError\|HEAD is detached" tests/` returns nothing.

**Evidence:** The scenario assertion in `session-cli.md` lines 23-24 is unbacked at the CLI level; `SessionDetachedHeadError` raises through the domain layer but no compliance/scenario test asserts the exit-code-1 + stderr-naming behavior through the Commander binding.

**Impact:** The compliance ALWAYS rule that names `SessionDetachedHeadError` in the diagnostic-line set has no concrete fixture; a regression that swallows the error name or routes the error through a different exit code would land silently.

**Resolution:** Add a `runSpx` case to `session-cli.compliance.l2.test.ts` (or a sibling test file) that creates a temp git repo, detaches HEAD via `git checkout <sha>`, pipes a valid JSON handoff header, and asserts `exitCode === 1` with `"SessionDetachedHeadError"` in stderr. Then update the scenario link to point at the file that carries the new test.
