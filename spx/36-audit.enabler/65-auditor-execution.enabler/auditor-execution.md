# Auditor Execution

PROVIDES hermetically separated execution of configured auditor agents
SO THAT `spx audit`
CAN produce branch-scoped verdict artifacts without sharing mutable state with the invoking agent

## Assertions

### Compliance

- ALWAYS: configured auditors run in isolated execution state separate from the invoking agent ([audit])
- ALWAYS: auditor target selection is resolved from audit config and file-inclusion path filters ([audit])
- ALWAYS: auditor results write verdict artifacts and terminal branch run state through the audit state API ([audit])
- NEVER: let auditor processes mutate the invoking agent's runtime configuration or conversation state ([audit])
