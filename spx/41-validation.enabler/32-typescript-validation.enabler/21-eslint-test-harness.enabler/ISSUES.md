# Known Issues

## Audit tags carry decision paths

[`spx/41-validation.enabler/32-typescript-validation.enabler/21-eslint-test-harness.enabler/eslint-test-harness.md`](eslint-test-harness.md) uses path-bearing `[audit](...)` tags on both compliance assertions. Audit verification tags are bare; decision traceability belongs in the assertion prose or an auxiliary link.

**Resolution:** use `/test` to confirm the audit mechanism, then use `/author` to normalize the declarations and `/align` to verify them against `spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/21-enforcement-tooling.adr.md`.

**Revisit condition:** before the next `/author`, `/align`, `/test`, or implementation slice touching `spx/41-validation.enabler/32-typescript-validation.enabler/21-eslint-test-harness.enabler`.
