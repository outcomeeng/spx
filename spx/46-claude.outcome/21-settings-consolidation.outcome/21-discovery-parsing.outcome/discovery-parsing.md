# Discovery Parsing

WE BELIEVE THAT recursively scanning a directory tree and extracting typed permission records from every `settings.local.json` found
WILL give the consolidation pipeline a complete, structured inventory of all Claude Code permissions in use
CONTRIBUTING TO eliminating permission drift by ensuring no project's settings are overlooked

## Assertions

### Scenarios

- Given a directory tree with `settings.local.json` files at varying depths, when discovery runs, then all files inside `.claude/` directories are found ([test](tests/discovery.unit.test.ts))
- Given a `settings.local.json` outside a `.claude/` directory, when discovery runs, then it is ignored ([test](tests/discovery.unit.test.ts))
- Given a `.claude/` directory with subdirectories, when discovery runs, then it does not recurse into `.claude/` children ([test](tests/discovery.unit.test.ts))
- Given symlink loops in the directory tree, when discovery runs, then it completes without hanging ([test](tests/discovery.unit.test.ts))
- Given a valid permission string like `Bash(git:*)`, when parsed, then type, scope, and category are extracted ([test](tests/parser.unit.test.ts))
- Given a malformed permission string, when parsed, then an error is thrown ([test](tests/parser.unit.test.ts))
- Given a `settings.local.json` with malformed JSON, when batch parsing runs, then the file is skipped and remaining files are still parsed ([test](tests/parser.unit.test.ts))

### Mappings

- Permission categories allow, deny, and ask each map to their respective parsed records ([test](tests/parser.unit.test.ts))

### Properties

- Discovery results are consistent: the same directory always produces the same file list in the same order ([test](tests/discovery.unit.test.ts))
- Batch parsing preserves input order: parsed results correspond positionally to input files ([test](tests/parser.unit.test.ts))
