# Test Runner Environments

`spx test` runs a product's selected test runner in an explicit environment: `operator` or `agent`. The default environment is `operator`, where child runner output streams to the terminal for local least-surprise behavior; `agent` captures child output to artifacts and prints a compact summary.

## Rationale

Agents need bounded, inspectable test evidence and developers need native local runner behavior, but both environments must exercise the same selected runner and the same selected test files. Consumer products do not all use the same runner, so `spx test` makes runner support explicit and reports unsupported selections clearly.

## Product properties

1. Unqualified `spx test` and `spx test passing` run in `operator` environment with native child stdout and stderr streaming.
2. `agent` environment writes child stdout and stderr to artifact files and reports a compact terminal summary without child stream passthrough.

## Verification

### Testing

- ALWAYS: environment mode preserves runner selection, selected test files, passing-scope filtering, and exit-code aggregation while changing only output handling and reporting shape ([compliance])
- ALWAYS: `agent` environment writes child stdout and stderr to artifact files and reports artifact paths without streaming child output to the invoking terminal ([compliance])
- Given failed test paths are unavailable for a failing runner group, `spx test` reports the requested paths for that failing runner group ([scenario])

### Audit

- ALWAYS: supported runners are declared explicitly per language; unsupported language or runner selections fail with a diagnostic naming the unsupported selection ([audit])
- NEVER: the selected environment changes which runner or test files `spx test` executes ([audit])
