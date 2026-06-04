# Issues: 21-discovery-parsing.outcome

## FOLLOW-UP: the discovery-exhaustiveness Property is proven by an example test

`discovery-parsing.md`'s Property assertion "Discovery is exhaustive: every `settings.local.json` under the root is found" links to `tests/discovery.scenario.l1.test.ts` — an example-based test. A Property assertion ("for all") should be proven by a fast-check property test, not a single example.

**Resolution:** add a `tests/discovery.property.l1.test.ts` that generates arbitrary directory trees and asserts every planted `settings.local.json` is found, then repoint the exhaustiveness assertion's `[test]` link to it.

**Skills:** `typescript:testing-typescript` (property test), `spec-tree:applying`.
