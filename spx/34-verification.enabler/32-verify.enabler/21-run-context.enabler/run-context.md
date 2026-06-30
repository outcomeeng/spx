# Run Context

PROVIDES start-time verification context creation, run-token selection, run-locator reporting, changeset scope resolution, and recorded-input replay for `spx verify`
SO THAT evidence append and terminal projection lifecycle operations
CAN operate on one scoped verification run with a stable subject, recorded input, and unambiguous run identity

## Assertions

### Scenarios

- Given `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin start`, when standard input supplies the run input, then spx creates a canonical verification context, opens a run journal, and reports the run token, context digest, resolved changed-file scope, exact input descriptor, and run locator ([test](tests/verify-start.scenario.l1.test.ts))
- Given a started run, when `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --run <run-token> input` runs, then it returns the exact verification input whose digest was recorded at start ([test](tests/verify-input.scenario.l1.test.ts))

### Mappings

- The `changeset` scope type resolves `base` and `head` into verification-context reconstruction fields and derives changed product paths as run scope metadata outside the canonical verification context ([test](tests/verify-scope.mapping.l1.test.ts))
- A run locator maps the resolved verification type, scope type, scope identity, backend identity, storage namespace, and journal run path or backend target to the run token reported by `start` ([test](tests/verify-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: `start` requires `--input <input-source>` and records the verification input for replay by the `input` verb ([test](tests/verify-start.compliance.l1.test.ts))
- ALWAYS: `start` reports enough resolved selector context for a caller to persist and replay the run identity without reconstructing journal namespace details itself ([test](tests/verify-start.compliance.l1.test.ts))
- ALWAYS: `input` requires `--run <run-token>` and rejects ambiguous type/scope-only selection ([test](tests/verify-input.compliance.l1.test.ts))
- ALWAYS: when `input` cannot locate a run, the diagnostic names the requested run token, verification type, scope type, scope identity, backend identity, storage namespace, searched target, and selector inputs needed to address it ([test](tests/verify-input.compliance.l1.test.ts))
- NEVER: `input` reads a fresh `--input <input-source>` value instead of replaying the input recorded at `start` ([test](tests/verify-input.compliance.l1.test.ts))
- NEVER: `spx verify` exposes `--scope-type working-tree` without verification-context substrate representation for a working-tree subject kind and reconstruction fields ([test](tests/verify-scope.mapping.l1.test.ts))
