# Known Issues

## One assertion links two test files

[`spx/37-compact.enabler/compact.md`](compact.md) links both `tests/compact-cli.scenario.l2.test.ts` and `tests/compact-cli-io.scenario.l1.test.ts` from the assertion covering retrieval of the latest compact record. The spec audit requires one verification mechanism per assertion and surfaced this link shape while loading the node as constraining context.

**Resolution:** use `/test` to decide whether one test file owns the assertion or whether the declaration splits into independently quantified assertions, then use `/author` to align the spec and `/audit-tests` to verify the resulting evidence map.

**Revisit condition:** before the next `/author`, `/align`, `/test`, or implementation slice touching `spx/37-compact.enabler`.
