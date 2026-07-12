# Issues: 21-discovery-parsing.outcome

## FOLLOW-UP: the discovery-exhaustiveness Property is proven by an example test

`discovery-parsing.md`'s Property assertion "Discovery is exhaustive: every `settings.local.json` under the root is found" links to `tests/discovery.scenario.l1.test.ts` — an example-based test. A Property assertion ("for all") should be proven by a fast-check property test, not a single example.

**Resolution:** add a `tests/discovery.property.l1.test.ts` that generates arbitrary directory trees and asserts every planted `settings.local.json` is found, then repoint the exhaustiveness assertion's `[test]` link to it.

**Skills:** `typescript:testing-typescript` (property test), `spec-tree:applying`.

## FOLLOW-UP: isolate discovery-test temporary directories under broad runs

The repository-wide status projection command
`pnpm exec tsx src/cli.ts spec status --update --format json` produced three
failures in `tests/discovery.scenario.l1.test.ts` while other test groups were
running: `EEXIST` creating `fake.json`, `ENOTEMPTY` removing a discovery test
directory, and an unexpected second discovered settings file. The failing paths
shared timestamp-derived `discovery-test-*` directory names, so concurrent or
closely timed cases can observe the same temporary directory.

A focused rerun through
`spx test spx/46-claude.outcome/21-settings-consolidation.outcome/21-discovery-parsing.outcome`
passed 2 files and 58 tests, and the current-head CI run passed the same node.
The evidence therefore identifies a nondeterministic isolation gap rather than
a deterministic discovery regression.

**Resolution:** route discovery test directories through the product's governed
callback-scoped temporary-directory primitive so every case receives a unique
directory with guaranteed cleanup, then verify the node under concurrent and
broad status-projection execution.

**Revisit condition:** the discovery-parsing node enters an `/apply` flow, or
another broad run reports `EEXIST`, `ENOTEMPTY`, or cross-case file leakage in
`tests/discovery.scenario.l1.test.ts`.

**Skills:** `spec-tree:apply`, `spec-tree:test`, `typescript:test-typescript`.
