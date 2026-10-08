# Issues: change runs

## The listing rejects a non-canonical Change identity that no assertion declares

`verifyChangeRunsCommand` in `src/commands/verify/change-runs.ts` (lines 94 to 95) rejects a `--change` value outside the canonical `owner/repo#N` form with its own `VERIFY_CHANGE_RUNS_ERROR.CHANGE_IDENTITY_INVALID` diagnostic, declared in the same file (line 26), before it reads any branch scope.

No spec assertion declares that rejection for the listing. [`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`](spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md) states the `--change <owner/repo#N>` option grammar and that `list` requires it, and [`spx/34-verification.enabler/32-verify.enabler/21-run-context.enabler`](spx/34-verification.enabler/32-verify.enabler/21-run-context.enabler/run-context.md) declares the canonical-form rejection for `start` only. This node's spec declares none.

No test invokes the listing with a present but malformed `--change` value. `VERIFY_TEST_GENERATOR.nonCanonicalChangeIdentity()` is consumed only by `verify-change-identity.compliance.l1.test.ts` of the run-context node, which exercises `start`. `tests/run-list.compliance.l2.test.ts` of [`spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler`](spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/verification.md) covers only a missing `--change`. `VERIFY_CHANGE_RUNS_ERROR.CHANGE_IDENTITY_INVALID` is referenced nowhere outside its defining file.

The current-head CI review of pull request 636 raised this as an evidence finding labeled DEBT.

**Impact:** the rejection is implemented behavior that is neither declared nor evidenced. Its diagnostic, its exit code, or the rejection itself can change or disappear without any spec or test exposing the change.

**Settlement condition:** an assertion declares the listing's rejection of a non-canonical Change identity, either in `spx/34-verification.enabler/32-verify.enabler/54-change-runs.enabler/change-runs.md` or in the Testing rules of [`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`](spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md), and a linked test invokes the listing with a non-canonical `--change` value and asserts the rejection.
