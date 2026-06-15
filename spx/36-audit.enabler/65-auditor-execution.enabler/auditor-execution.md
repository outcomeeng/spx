# Auditor Execution

PROVIDES hermetically separated execution of configured auditor agents
SO THAT `spx audit`
CAN record a branch-scoped audit run journal without sharing mutable state with the invoking agent

## Assertions

### Compliance

- ALWAYS: configured auditors run in isolated execution state separate from the invoking agent ([audit])
- ALWAYS: auditor target selection is resolved from audit config and file-inclusion path filters ([audit])
- ALWAYS: auditor execution appends run events and seals the run journal through the audit run-state API per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- NEVER: let auditor processes mutate the invoking agent's runtime configuration or conversation state ([audit])
