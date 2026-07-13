# Issues — Test Environment

## FOLLOW-UP [evidence]: cleanup-failure path of `withTempDir` is unobserved

**Reference:** [`21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) — "A cleanup failure is swallowed so it never masks the callback's own result or error." [`test-environment.md`](test-environment.md) Scenarios — "the callback's result is returned unchanged."

**Evidence:** [`testing/harnesses/with-temp-dir.ts`](../../testing/harnesses/with-temp-dir.ts) swallows cleanup failure via `removeTempDir(dir).catch(() => {})` in `withTempDir`'s `finally`. No test in [`tests/temp-dir.scenario.l1.test.ts`](tests/temp-dir.scenario.l1.test.ts) exercises the path where cleanup fails *after a successful callback* to confirm the callback's result still propagates.

**Impact:** Low. The swallow is defensive against an `rm` I/O error on the return path; the creation-side guard (`createTempDir` refusing prefixes that escape `os.tmpdir()`) and the basename prefixes all live callers pass mean the in-`finally` `removeTempDir` guard never throws in practice. The contract "result returned unchanged" is covered for the success-with-clean-cleanup path; only the success-with-failing-cleanup path is unobserved.

**Resolution (deferred):** Closing this cleanly requires a seam the primitive does not expose — simulating an `rm` failure needs either a forbidden filesystem mock (`vi.mock`/`memfs`, barred by the ADR NEVER), a non-portable immutable-flag trick that will not run on Linux CI runners, or an injected-remover parameter that changes the ADR-declared `withTempDir(prefix, callback)` signature. None is worth the cost relative to the impact. Revisit if `withTempDir` ever grows a dependency-injection seam for its remover for another reason.

## Spec assertions use the legacy audit tag

[`test-environment.md`](test-environment.md) uses legacy `[review]` evidence at lines 29-33. The assertions need current `[test]`, `[eval]`, or `[audit]` routing based on their verification mechanism.

**Resolution:** use `/test` to classify each affected assertion, then use `/author` to rewrite the declarations and `/align` to verify the node against `spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md` and its evidence.

**Revisit condition:** before the next `/author`, `/align`, `/test`, or implementation slice touching `spx/22-test-environment.enabler`.
