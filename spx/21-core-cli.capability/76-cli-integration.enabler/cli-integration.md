# CLI Integration

PROVIDES the compiled CLI binary entry point that routes subcommands to domain handlers, parses arguments, selects output formatters, and enforces exit code and error-message conventions
SO THAT every developer or automation tool invoking the spx CLI
CAN get work-item status, the next work item, and error feedback with correct exit codes and format output without knowing the internal domain structure

## Assertions

### Scenarios

- Given a project with work items in the specs directory, when running `spx spec status`, then stdout contains the tree structure and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project with no work items, when running `spx spec status`, then stdout contains "No work items found" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project with no specs directory, when running `spx spec status`, then the process exits with code 1 and stderr contains "Error:" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project with work items, when running `spx spec status --json`, then stdout is valid JSON that JSON.parse accepts without throwing ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project, when running `spx spec status --format markdown`, then the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project, when running `spx spec status --format invalid`, then the process exits with code 1 and stderr contains 'Invalid format "invalid"' ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project with an IN_PROGRESS work item, when running `spx spec next`, then stdout contains "Next work item:" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project where all work items are DONE, when running `spx spec next`, then stdout contains "All work items are complete" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project with no work items, when running `spx spec next`, then stdout contains "No work items found" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given an unknown subcommand, when running `spx invalid`, then the process exits with code 1 and stderr matches /unknown command|error/i ([test](tests/cli-integration.scenario.l2.test.ts))
- Given no command, when running `spx` with no arguments, then output contains "Usage:" or "Commands:" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given the --help flag, when running `spx --help`, then the process exits with code 0 and stdout contains "spec" and "session" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a command with the --help flag, when running `spx spec status --help`, then the process exits with code 0 and stdout contains "--json" and "--format" ([test](tests/cli-integration.scenario.l2.test.ts))

### Compliance

- ALWAYS: every error condition writes a message beginning with "Error:" to stderr ([test](tests/cli-integration.scenario.l2.test.ts))
