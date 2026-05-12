# CLI Integration

PROVIDES the compiled CLI binary entry point that routes subcommands to domain handlers, parses arguments, selects output formats, and enforces exit code and error-message conventions
SO THAT every developer or automation tool invoking the spx CLI
CAN inspect current spec-tree state, find the next current spec-tree node, and receive command feedback with correct exit codes and format output without knowing the internal domain structure

## Assertions

### Scenarios

- Given a tracked `spx/` tree contains current spec-tree nodes, when running `spx spec status`, then stdout contains the tree structure and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a tracked `spx/` tree contains no current spec-tree nodes, when running `spx spec status`, then stdout contains the current empty-tree message and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a tracked `spx/` tree contains current spec-tree nodes, when running `spx spec status --json`, then stdout is valid JSON that JSON.parse accepts without throwing ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a tracked `spx/` tree contains current spec-tree nodes, when running `spx spec status --format markdown`, then stdout renders markdown output and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a tracked `spx/` tree contains current spec-tree nodes, when running `spx spec status --format table`, then stdout renders table output and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a project, when running `spx spec status --format invalid`, then the process exits with code 1 and stderr contains an invalid-format error ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a tracked `spx/` tree contains current spec-tree nodes, when running `spx spec next`, then stdout reports the first non-passing spec-tree node and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a tracked `spx/` tree contains no current spec-tree nodes, when running `spx spec next`, then stdout contains the current empty-tree message and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given an unknown subcommand, when running `spx invalid`, then the process exits with code 1 and stderr matches /unknown command|error/i ([test](tests/cli-integration.scenario.l2.test.ts))
- Given no command, when running `spx` with no arguments, then output contains "Usage:" or "Commands:" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given the --help flag, when running `spx --help`, then the process exits with code 0 and stdout contains "spec" and "session" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given the --version flag, when invoking the spx binary directly via its shebang, then stdout is exactly the version string from package.json and the process exits with code 0 ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a command with the --help flag, when running `spx spec status --help`, then the process exits with code 0 and stdout contains "--json" and "--format" ([test](tests/cli-integration.scenario.l2.test.ts))
- Given a command with the --help flag, when running `spx spec next --help`, then the process exits with code 0 and stdout contains current spec-tree wording ([test](tests/cli-integration.scenario.l2.test.ts))
