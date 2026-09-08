# Issues

## Release property tests fail intermittently under a full parallel run

Two property cases under this enabler have each failed once during a `spx test --changed` run spanning the full suite, and each passed both in isolation and on an immediate re-run of the same scope, on the same tree:

- `produces identical release data for identical repository state` in [21-release-data.enabler](21-release-data.enabler/tests/release-data.property.l1.test.ts), which builds a real git repository per generated sample and runs several `git` subprocesses per computation.
- `rejects every generated unrelated semantic-version rewrite before promotion` in [32-documentation-sync.enabler](32-documentation-sync.enabler/tests/documentation-sync.property.l1.test.ts), which materializes real product directories per sample.

Both build real filesystem and git state per generated sample, so a run executing hundreds of test files concurrently puts many temp-directory lifecycles and `git` invocations against the same machine at once. Neither failure's assertion message or fast-check counterexample was captured.

**Impact:** a CI run can fail on a release node whose behavior did not change, and each failure reads as a defect in the property it names — determinism in one case, version-rewrite rejection in the other.

**Resolution when addressed:** capture the failing counterexample and seed on the next occurrence rather than filtering the run output to test names. Then decide whether these properties need the real repository at all: the determinism claim in particular composes over an injected git runner per [18-release-architecture.adr.md](18-release-architecture.adr.md), so it can hold without a repository while the node's scenario tests keep the real-git evidence.
