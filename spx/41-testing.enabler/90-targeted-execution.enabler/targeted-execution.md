# Targeted Execution

PROVIDES explicit target-operand selection for `spx test` and `spx test passing` — resolving caller-supplied node-path and test-file-path operands after `--` to a concrete set of discovered test files, with an opt-in recursive flag that extends a node-path operand to its descendant nodes, and routing that set through the same runner adapters, runner environment, passing-scope policy, and last-run recording as a full run
SO THAT agents and developers running focused spec-tree verification
CAN run only the tests for the node or file they changed instead of the full suite, while obtaining the same runner selection, agent output, and recorded evidence the full command produces

## Assertions

### Scenarios

- Given a test-file-path operand, when target scope is resolved, then that file is the selected set routed to its registered language runner ([test](tests/targeted-execution.scenario.l1.test.ts))
- Given a node-path operand without the recursive flag, when target scope is resolved, then only that node's own `tests/` files are selected and descendant nodes' files are excluded ([test](tests/targeted-execution.scenario.l1.test.ts))
- Given a node-path operand with the recursive flag, when target scope is resolved, then the node's own `tests/` files and every descendant node's test files are selected ([test](tests/targeted-execution.scenario.l1.test.ts))
- Given an operand that resolves to no discovered test file, when target scope is resolved, then the operand is reported as unresolved and the command exits non-zero ([test](tests/targeted-execution.scenario.l1.test.ts))

### Properties

- Operand resolution is order-independent and deduplicated: the selected set for a list of operands is the union of each operand's resolved files, unchanged by operand order or repetition ([test](tests/targeted-execution.property.l1.test.ts))

### Compliance

- ALWAYS: `spx test passing` with operands applies the configured passing-scope exclusions to the operand-selected set, while `spx test` with operands routes the selected set unfiltered ([test](tests/targeted-execution.compliance.l1.test.ts))
- ALWAYS: operand-selected files route through the same registry adapters, runner environment, last-run recording, and `--agent` output handling as a full run — operands change the selected set only, per `spx/41-testing.enabler/11-test-runner-environments.pdr.md` ([audit])
