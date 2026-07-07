# Methodology Context

PROVIDES the `methodology-context` diagnose check over configured methodology source and version
SO THAT `spx diagnose`
CAN report whether the product's methodology selection is configured, observable, mismatched, or unavailable

## Assertions

### Scenarios

- Given top-level methodology config uses version `installed` and the local methodology resolver observes the configured source with a concrete installed version, when `spx diagnose --format json` runs, then the `methodology-context` check reports the observed version with a healthy verdict ([test](tests/methodology-context.scenario.l1.test.ts))
- Given top-level methodology config uses an exact version that differs from the observed local version, when `spx diagnose --format json` runs, then the `methodology-context` check reports a version-mismatch verdict ([test](tests/methodology-context.scenario.l1.test.ts))
- Given no local methodology observation is available, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unavailable verdict with configured source and version readings ([test](tests/methodology-context.scenario.l1.test.ts))
- Given methodology observation errors, when `spx diagnose --format json` runs, then the `methodology-context` check reports an unknown verdict ([test](tests/methodology-context.scenario.l1.test.ts))

### Compliance

- ALWAYS: the text diagnose report renders a concise methodology-context line from the same check record as JSON output ([test](tests/methodology-context.compliance.l1.test.ts))
- ALWAYS: manifest-driven diagnose runs without methodology facts render methodology-context as not configured rather than configured ([test](tests/methodology-context.compliance.l1.test.ts))
- NEVER: the methodology-context classifier reads files, environment variables, processes, or plugin surfaces directly; observations enter through an injected probe ([test](tests/methodology-context.compliance.l1.test.ts))
