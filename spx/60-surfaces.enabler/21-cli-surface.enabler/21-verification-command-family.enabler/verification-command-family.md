# Verification Command Family

PROVIDES the public `spx verification run` command-family contract for typed verification-run management
SO THAT agents, CI jobs, and launchers
CAN start, inspect, append evidence to, finish, report status for, and render scoped verification runs through noun-grouped CLI commands without constructing journal events directly

## Assertions

### Compliance

- ALWAYS: the public verification-run lifecycle is exposed under `spx verification run` ([test](tests/verification-command-family.compliance.l1.test.ts))
- ALWAYS: verification-run evidence resources use noun-local command paths, including `spx verification run scope add` and `spx verification run finding add` ([test](tests/verification-command-family.compliance.l1.test.ts))
- ALWAYS: `spx verification run scope add` and `spx verification run finding add` require a payload source and caller-supplied idempotency key ([test](tests/verification-command-family.compliance.l1.test.ts))
- NEVER: public verification-run command paths expose journal mechanics such as `append-scope`, `append-finding`, `event`, or `journal` ([test](tests/verification-command-family.compliance.l1.test.ts))
- NEVER: a top-level verb command such as `spx verify` manages verification runs ([test](tests/verification-command-family.compliance.l1.test.ts))
