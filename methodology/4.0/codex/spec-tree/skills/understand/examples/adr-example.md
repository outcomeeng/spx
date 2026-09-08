# Status Derivation

Node status is derived exclusively from the presence and pass/fail state of co-located tests — a pure, computed property, never a stored label. No status field exists in any file.

## Rationale

Stored status requires someone to keep it synchronized with reality, and that synchronization always drifts. Deriving status from tests guarantees accuracy — the status is literally "do the tests pass?" Rejected alternatives: a `status.yaml` per node (manual synchronization) and CI-badge integration (external dependency).

## Invariants

- Status is a pure function of test results — same test results always produce the same status.
- Adding tests can only improve status precision, never degrade it.

## Verification

### Testing

- ALWAYS: compute status fresh on every invocation — ensures accuracy ([property])
- ALWAYS: use only test pass/fail as input — no other signals ([mapping])
- NEVER: store status in any committed file — prevents drift ([compliance])
- NEVER: allow manual status override — defeats the derivation principle ([scenario])
