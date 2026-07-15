# Test Evidence Model

PROVIDES test evidence validation over inspected test modules, failing-case findings, and runner-mapped terminal completion
SO THAT the spx-driven verification executor and the verify recorder
CAN record deterministic test-run evidence under `--verification-type test` and reject payloads a deterministic runner never produces

## Assertions

### Conformance

- Test scope payloads conform to the test scope schema: a required module identifier naming one inspected test module ([test](tests/test-scope.conformance.l1.test.ts))
- Test finding payloads conform to the test finding schema: a required module identifier, a required test name, and an errors array of message strings that may be empty when a failing case carries no message ([test](tests/test-finding.conformance.l1.test.ts))

### Compliance

- ALWAYS: invalid test scope and finding payloads are rejected before journal events append ([test](tests/test-evidence-validation.compliance.l1.test.ts))
- NEVER: a test run seals with an agentic disposition or any terminal metadata; a deterministic run seals only with a runner-mapped status of passed, failed, or interrupted ([test](tests/test-evidence-validation.compliance.l1.test.ts))
- NEVER: a test run seals with `passed` when its recorded evidence contains findings — a passing deterministic run produces no findings ([test](tests/test-evidence-validation.compliance.l1.test.ts))
