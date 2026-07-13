# Discovery Parsing

WE BELIEVE THAT recursively scanning a directory tree and extracting typed permission records from every `settings.local.json` found
WILL give the consolidation pipeline a complete, structured inventory of all Claude Code permissions in use
CONTRIBUTING TO eliminating permission drift by ensuring no project's settings are overlooked

## Assertions

### Scenarios

- Given a directory tree with `settings.local.json` files inside `.claude/` directories at varying depths, when discovery runs, then all are found ([test](tests/discovery.scenario.l1.test.ts))
- Given a `settings.local.json` with valid permissions, when parsing runs, then typed permission records are extracted ([test](tests/parser.scenario.l1.test.ts))
- Given a `settings.local.json` with malformed JSON, when parsing runs, then the file is reported as an error without aborting the scan ([test](tests/parser.scenario.l1.test.ts))

### Properties

- Discovery is exhaustive: every `settings.local.json` under the root is found ([test](tests/discovery.property.l1.test.ts))
- Parsing preserves input cardinality and order: every settings-file path yields one ordered success or error result ([test](tests/parser.property.l1.test.ts))
