# Test Evidence Model

PROVIDES test evidence validation over inspected test modules and the product files they read, failing-case findings, and runner-mapped terminal completion
SO THAT the spx-driven verification executor and the verify recorder
CAN record deterministic test-run evidence under `--verification-type test` and reject payloads a deterministic runner never produces

## Assertions

### Conformance

- Test scope payloads conform to the test scope schema: a required module identifier naming one inspected test module and an optional array of product-relative read paths naming the product files the module read during its run ([test](tests/test-scope.conformance.l1.test.ts))
- Test finding payloads conform to the test finding schema: a required module identifier, a required test name, and an errors array of message strings that may be empty when a failing case carries no message ([test](tests/test-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: invalid test scope and finding payloads are rejected before journal events append ([test](tests/test-evidence-validation.compliance.l1.test.ts))
- ALWAYS: a test scope payload whose read paths are not product-relative paths is rejected before any journal event appends, and the rejection reason names the failing read-path field path ([test](tests/test-scope-read-paths.compliance.l1.test.ts))
- ALWAYS: a test scope or finding payload rejection reason names the failing payload field path or the unmet structural requirement ([test](tests/test-evidence-validation.compliance.l1.test.ts))
- NEVER: a test run seals with an agentic disposition or any terminal metadata; a deterministic run seals only with a runner-mapped status of passed, failed, or interrupted ([test](tests/test-evidence-validation.compliance.l1.test.ts))
- NEVER: a test run seals with `passed` when its recorded evidence contains findings — a passing deterministic run produces no findings ([test](tests/test-evidence-validation.compliance.l1.test.ts))
