# Discovery Parsing

WE BELIEVE THAT recursively scanning a directory tree and extracting typed permission records from every `settings.local.json` found
WILL give the consolidation pipeline a complete, structured inventory of all Claude Code permissions in use
CONTRIBUTING TO eliminating permission drift by ensuring no project's settings are overlooked

## Assertions

### Scenarios

- Given a directory tree with `settings.local.json` files inside `.claude/` directories at varying depths, when discovery runs, then all are found ([test](tests/discovery.scenario.l1.test.ts))
- Given a missing root or a root that is a file, when discovery runs, then it rejects with a path-specific directory diagnostic ([test](tests/discovery.scenario.l1.test.ts))
- Given an exact `.claude/settings.local.json` target alongside non-target entries and a `settings.local.json` outside `.claude/`, when discovery runs, then only the exact target is returned ([test](tests/discovery.scenario.l1.test.ts))

### Properties

- Discovery is exhaustive: every `.claude/settings.local.json` target under the root is found ([test](tests/discovery.property.l1.test.ts))
- Parsing maps every valid permission entry to a typed record carrying its raw value, type, scope, and category ([test](tests/parser.property.l1.test.ts))
- Parsing retains an error result for every malformed JSON file while continuing with later paths ([test](tests/parser.property.l1.test.ts))
- Parsing preserves input cardinality and order: every settings-file path yields one ordered success or error result ([test](tests/parser.property.l1.test.ts))
