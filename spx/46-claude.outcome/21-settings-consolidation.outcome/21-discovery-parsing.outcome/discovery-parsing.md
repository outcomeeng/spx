# Discovery Parsing

WE BELIEVE THAT recursively scanning a directory tree and extracting typed permission records from every `settings.local.json` found
WILL give the consolidation pipeline a complete, structured inventory of all Claude Code permissions in use
CONTRIBUTING TO eliminating permission drift by ensuring no project's settings are overlooked

## Assertions

### Scenarios

- Given a directory tree with multiple `settings.local.json` files, when discovery runs, then all files are found regardless of nesting depth ([test](tests/discovery.unit.test.ts))
- Given a `settings.local.json` with valid permissions, when parsing runs, then typed permission records are extracted ([test](tests/parser.unit.test.ts))
- Given a `settings.local.json` with malformed JSON, when parsing runs, then the file is reported as an error without aborting the scan ([test](tests/parser.unit.test.ts))

### Properties

- Discovery is exhaustive: every `settings.local.json` under the root is found ([test](tests/discovery.unit.test.ts))
