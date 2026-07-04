# Run Set Orchestration

A verification run set is the backend-neutral merge-period projection over repeated `spx verification run` records for one verification type and scope. It provides prior-run context, current scope, active findings, resolved findings, reopened findings, and coverage gaps without requiring verification producers to parse rendered comments or raw journal logs.

## Rationale

Agentic verification improves across repeated local and CI runs only when producers can compare the current run against prior runs for the same merge period. A run-set projection gives producers that context through SPX-owned structure while keeping backend storage, external delivery surfaces, and verifier prompts separate.

## Product properties

1. A run set is addressed by merge-period identity, verification type, scope type, and scope identity.
2. A run-set projection contains prior runs, current scope, active findings, resolved findings, reopened findings, and coverage gaps in a backend-neutral shape.
3. Finding identity is stable across line movement by combining verification type, producer identity, normalized subject, rule, and message or evidence fingerprint; line numbers are display metadata.

## Verification

### Testing

- ALWAYS: run-set selection maps merge-period identity, verification type, scope type, and scope identity to the same backend-neutral run set across local and pull-request backends ([mapping])
- ALWAYS: run-set projection maps prior run evidence and current run evidence into active, resolved, reopened, and coverage-gap groups ([mapping])
- ALWAYS: finding identity remains stable when display-only line numbers change but verification type, producer identity, normalized subject, rule, and message or evidence fingerprint remain unchanged ([property])
- NEVER: prior-run context depends on parsing rendered pull-request comments, terminal output, or raw journal-event envelopes ([compliance])

### Audit

- ALWAYS: specifications for review and audit verification types consume the run-set projection as shared verification context rather than redefining merge-period identity or finding identity ([audit])
