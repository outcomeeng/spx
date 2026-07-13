# Issues: discovery parsing

The discovery-exhaustiveness Property assertion lacks property-based evidence.

## Discovery exhaustiveness uses example evidence

The Property assertion in `spx/46-claude.outcome/21-settings-consolidation.outcome/21-discovery-parsing.outcome/discovery-parsing.md` links to `spx/46-claude.outcome/21-settings-consolidation.outcome/21-discovery-parsing.outcome/tests/discovery.scenario.l1.test.ts`, which supplies example-based evidence. A Property assertion quantified over every valid tree requires a fast-check property test.

**Resolution:** Add `spx/46-claude.outcome/21-settings-consolidation.outcome/21-discovery-parsing.outcome/tests/discovery.property.l1.test.ts`, generate directory trees, assert that discovery returns every planted `settings.local.json`, and repoint the assertion's `[test]` link.

**Skills:** `typescript:test-typescript`, `spec-tree:apply`.
