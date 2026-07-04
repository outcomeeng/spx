# Run Set Orchestration

PROVIDES merge-period run-set projection over repeated verification runs for one verification type and scope
SO THAT review and audit verification-type payloads, agent harness workflows, and backend delivery projections
CAN restore prior-run context, classify active/resolved/reopened findings, expose coverage gaps, and preserve expanding scope without reading rendered comments or raw journal logs

## Assertions

### Mappings

- A run-set selector maps merge-period identity, verification type, scope type, and scope identity to prior runs and current scope for that run set ([test](tests/run-set-selector.mapping.l1.test.ts))
- Prior and current finding evidence maps to active, resolved, and reopened finding groups using stable finding identity ([test](tests/run-set-projection.mapping.l1.test.ts))
- Prior and current scope evidence maps to coverage gaps without requiring each verification type to define its own merge-period envelope ([test](tests/run-set-projection.mapping.l1.test.ts))

### Properties

- Finding identity is stable across display-only line movement when verification type, producer identity, normalized subject, rule, and message or evidence fingerprint remain unchanged ([test](tests/finding-identity.property.l1.test.ts))

### Compliance

- NEVER: verification producers parse rendered pull-request comments, terminal output, or raw journal-event envelopes to restore prior-run context ([test](tests/run-set-boundary.compliance.l1.test.ts))
- ALWAYS: review and audit verification-type payload specs consume this node's merge-period identity and finding identity instead of redefining them locally ([audit])
