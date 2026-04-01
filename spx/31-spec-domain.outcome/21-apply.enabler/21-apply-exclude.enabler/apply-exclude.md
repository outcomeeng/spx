# Apply Exclude

PROVIDES exclusion application from `spx/EXCLUDE` to language-specific tool configuration
SO THAT the `apply` command
CAN translate excluded node paths into pytest, mypy, and pyright configuration

The apply-exclude operation reads node paths from `spx/EXCLUDE` and updates `pyproject.toml` to exclude specified nodes from pytest, mypy, and pyright. Ruff is never excluded — style is checked regardless of implementation existence.

## Assertions

### Scenarios

- Given an `spx/EXCLUDE` file with one flat node path, when applied to `pyproject.toml`, then the file contains a pytest `--ignore` flag, a mypy exclude regex, and a pyright exclude path for that node ([test](tests/apply-exclude.unit.test.ts))
- Given an `spx/EXCLUDE` file with comments and blank lines, when parsed, then only non-comment, non-blank lines are returned as node paths ([test](tests/apply-exclude.unit.test.ts))
- Given an `spx/EXCLUDE` file with a nested path (`57-subsystems.outcome/32-risc-v.outcome`), when applied, then all three tool configurations contain the full nested path with correct escaping ([test](tests/apply-exclude.unit.test.ts))
- Given a `pyproject.toml` with previously-applied excluded entries, when applied with different nodes, then old entries are replaced with new entries ([test](tests/apply-exclude.unit.test.ts))
- Given a `pyproject.toml` already in sync with `spx/EXCLUDE`, when applied again, then no changes are made ([test](tests/apply-exclude.unit.test.ts))
- Given `spx/EXCLUDE` does not exist, when the command runs, then it exits with error code 1 ([test](tests/apply-exclude.unit.test.ts))

### Mappings

- Node path `{node}` maps to pytest `--ignore=spx/{node}/`, mypy `^spx/{escaped_node}/`, and pyright `spx/{node}/` ([test](tests/apply-exclude.unit.test.ts))

### Properties

- Apply is idempotent: running twice with the same `spx/EXCLUDE` produces the same `pyproject.toml` content ([test](tests/apply-exclude.unit.test.ts))
- Node paths containing path traversal sequences (`..`), absolute paths, or TOML-unsafe characters are rejected before any file is modified ([test](tests/apply-exclude.unit.test.ts))
- Malformed TOML input (unmatched brackets, missing sections) does not cause infinite loops or crashes — the content is returned unmodified ([test](tests/apply-exclude.unit.test.ts))
- No generated config entry contains unescaped TOML string delimiters — entries written to TOML arrays are safe to parse back ([test](tests/apply-exclude.unit.test.ts))

### Compliance

- NEVER: exclude specified nodes from the linter — style is checked regardless of implementation existence ([review])
- NEVER: write node paths that traverse outside the project root — reject `..` and absolute paths ([test](tests/apply-exclude.unit.test.ts))
- NEVER: write unescaped TOML metacharacters into config values — prevents injection of arbitrary TOML structure ([test](tests/apply-exclude.unit.test.ts))
- ALWAYS: detect previously-applied entries by value pattern, not marker comments ([review])
- ALWAYS: preserve comments and formatting in the target configuration file ([review])
- ALWAYS: terminate TOML parsing in bounded time regardless of input — no unbounded loops ([test](tests/apply-exclude.unit.test.ts))
