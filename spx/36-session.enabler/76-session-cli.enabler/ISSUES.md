# Open Issues

## Session-file tag extraction is duplicated across test helpers

`spx/36-session.enabler/76-session-cli.enabler/tests/session-cli.compliance.l2.test.ts` parses `<SESSION_FILE>` tags locally while `spx/36-session.enabler/43-session-store.enabler/tests/helpers.ts` owns an `extractSessionFile` helper for the same output.

**Evidence:** The CLI compliance test uses `SESSION_FILE_TAG_PATTERN` to read the file emitted by `spx session handoff`. The session-store tests call `extractSessionFile(output)` for the same tag contract. Keeping both parsers creates a drift point for CLI-level tests.

**Impact:** A future tag-format adjustment could update one parser without the other, leaving one test lane to assert a stale extraction rule.

**Resolution:** Promote `extractSessionFile` to `testing/harnesses/session/harness.ts` or another shared session test harness module, then update the session-store and session-cli tests to import that helper.
