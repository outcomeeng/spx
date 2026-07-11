# Validation Test Harness

PROVIDES validation-specific real-project environments, command and pipeline execution, controlled tool boundaries, case registration, cleanup, and diagnostics driven by coherent validation scenarios
SO THAT validation CLI, language validation, markdown validation, formatting, configuration, discovery, and scope evidence
CAN exercise production behavior without repeating project setup, dependency bags, execution policy, or assertion configuration

## Assertions

### Compliance

- ALWAYS: the harness consumes domains from `spx/41-validation.enabler/13-validation-test-generators.enabler` and owns reusable validation setup, controlled dependencies, cleanup, execution policy, and failure diagnostics ([audit])
- ALWAYS: validation scenarios materialize in isolated real product directories, and cleanup removes temporary projects and generated artifacts on success and failure while preserving the original result and diagnostics ([audit])
- ALWAYS: filesystem and available-tool success paths use real local systems, and controlled dependencies are limited to the testing methodology's named exception cases ([audit])
- NEVER: executed validation assertion files construct tool identities, project layouts, dependency bags, runner settings, reusable values, or cleanup policy; they register harness cases and assert the governed outcome ([audit])
- NEVER: harness modules redeclare production-owned validation vocabulary or independently derive values owned by the validation test generator ([audit])
