# CLI Integration

WE BELIEVE THAT exposing settings consolidation as `spx claude settings consolidate` with preview, dry-run, and write modes
WILL let developers verify the merge result before committing to it
CONTRIBUTING TO safe, confident adoption of consolidated settings

## Assertions

### Scenarios

- Given `spx claude settings consolidate` without `--write`, when run, then the merged result is displayed but no files are modified ([test](tests/consolidate.integration.test.ts))
- Given `--write`, when run, then a backup is created and the merged settings are written to the global settings file ([test](tests/consolidate.integration.test.ts))
- Given `--write` with subsumable permissions, when run, then subsumed permissions are reported and removed from the output ([test](tests/consolidate.integration.test.ts))
- Given `--output-file path`, when run, then merged settings are written to the specified path and global settings are unchanged ([test](tests/consolidate.integration.test.ts))
- Given `--output-file` with a nested path, when run, then parent directories are created ([test](tests/consolidate.integration.test.ts))
- Given no `settings.local.json` files exist under the scan root, when run, then the command reports nothing to consolidate ([test](tests/consolidate.integration.test.ts))

### Compliance

- NEVER: `--write` and `--output-file` used together — the command exits with an error explaining mutual exclusion ([test](tests/consolidate.integration.test.ts))
