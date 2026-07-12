# Execute Run

PROVIDES the `spx verification <type> run` command paths that ask spx to execute a verification of a named type and record the run it drives
SO THAT operators, agents, and CI jobs
CAN have spx run a verification over selected product paths and read the resulting run back through the verification command family

## Assertions

### Compliance

- ALWAYS: spx-driven verification execution is exposed as `spx verification <type> run`, a verification-type noun carrying the `run` verb ([test](tests/execute-run.compliance.l1.test.ts))
- ALWAYS: `spx verification <type> run` narrows execution through positional product path operands, per `spx/29-verification-path-scope.pdr.md` ([test](tests/execute-run.compliance.l1.test.ts))
- NEVER: a verification type is exposed as a verb command path such as `spx verification validate` or `spx verification eval` ([test](tests/execute-run.compliance.l1.test.ts))
- NEVER: the verification-type noun slot admits only deterministic types — an spx-driven agentic verification occupies the same slot ([audit])
