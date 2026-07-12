# Verification

PROVIDES the public `spx verification` command family — the run-inspection command paths every verification run is read through, and the vocabulary boundary its child command paths observe
SO THAT agents, CI jobs, and launchers recording a verification run, and callers asking spx to execute one
CAN address, inspect, and render any verification run through one command family without constructing journal events directly

## Assertions

### Compliance

- ALWAYS: every verification run is inspected and rendered through the run-inspection command paths of `spx verification run`, whichever child command path produced it ([audit])
- NEVER: public verification command paths expose journal mechanics such as `append-scope`, `append-finding`, `event`, or `journal` ([test](tests/verification.compliance.l1.test.ts))
- NEVER: a top-level verb command such as `spx verify` manages verification runs ([test](tests/verification.compliance.l1.test.ts))
