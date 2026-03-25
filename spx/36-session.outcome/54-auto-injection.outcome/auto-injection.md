# Auto-Injection

WE BELIEVE THAT automatically reading and printing files listed in session YAML front matter on pickup
WILL cause agents to reach productive context within seconds instead of manually reading files
CONTRIBUTING TO reduced time-to-productivity after context switches

## Assertions

### Scenarios

- Given a session with `specs:` and `files:` arrays in YAML front matter, when the session is picked up, then all listed file contents are printed to stdout with path-delimited headers ([test](tests/auto-injection.unit.test.ts))
- Given a session listing a file that does not exist, when the session is picked up, then a warning is shown and pickup succeeds ([test](tests/auto-injection.unit.test.ts))
- Given a session with empty `specs:` and `files:` arrays, when the session is picked up, then no injection section appears in the output ([test](tests/auto-injection.unit.test.ts))
- Given the `--no-inject` flag, when a session with listed files is picked up, then file contents are not read or printed ([test](tests/auto-injection.unit.test.ts))

### Properties

- YAML front matter parsing extracts `specs` and `files` arrays; missing or malformed fields produce empty arrays, never errors ([test](tests/auto-injection.unit.test.ts))

### Compliance

- ALWAYS: continue pickup when listed files are missing per ADR `21-auto-injection` ([review](../21-auto-injection.adr.md))
- NEVER: cache file contents — always read fresh per ADR `21-auto-injection` ([review](../21-auto-injection.adr.md))
