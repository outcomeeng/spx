# Methodology Context

PROVIDES the `methodology-context` diagnose check over configured methodology source and version
SO THAT `spx diagnose`
CAN report whether the product's methodology selection is configured, observable, mismatched, or unavailable

## Assertions

### Scenarios

- Given top-level methodology config uses version `installed` and the local methodology resolver observes the configured source with a concrete installed version, when `spx diagnose --json` runs, then the `methodology-context` check reports the observed version with a healthy verdict ([test](tests/methodology-context.scenario.l1.test.ts))
- Given a diagnose manifest carries methodology source and version facts, when `spx diagnose --manifest <path> --json` runs, then the `methodology-context` check reports the observed version against the manifest methodology facts ([test](tests/methodology-context.scenario.l1.test.ts))
- Given top-level methodology config uses an exact version that differs from the observed local version, when `spx diagnose --json` runs, then the `methodology-context` check reports a version-mismatch verdict ([test](tests/methodology-context.scenario.l1.test.ts))
- Given no local methodology observation is available, when `spx diagnose --json` runs, then the `methodology-context` check reports an unavailable verdict with configured source and version readings ([test](tests/methodology-context.scenario.l1.test.ts))
- Given methodology observation errors, when `spx diagnose --json` runs, then the `methodology-context` check reports an unknown verdict ([test](tests/methodology-context.scenario.l1.test.ts))

### Compliance

- ALWAYS: the detailed human report under `spx diagnose --verbose` renders methodology-context facts from the same check record as JSON output ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: manifest-driven diagnose runs selecting `methodology-context` without methodology facts are rejected before checks run ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: methodology version cache resolution reads supported local agent caches, uses the configured exact version when present, reports the highest numeric dotted installed version when the configured exact version is missing, and resolves `installed` to the highest numeric dotted version while ignoring non-version directory names ([test](tests/methodology-context.compliance.l1.test.ts))
- NEVER: the methodology-context classifier reads files, environment variables, processes, or plugin surfaces directly; observations enter through an injected probe ([test](tests/methodology-context.compliance.l1.test.ts))
