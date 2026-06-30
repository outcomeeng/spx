# Run Context

PROVIDES start-time verification context creation, run-token selection, changeset scope resolution, and recorded-input replay for `spx verify`
SO THAT evidence append and terminal projection lifecycle operations
CAN operate on one scoped verification run with a stable subject, recorded input, and unambiguous run identity

## Assertions

### Scenarios

- Given `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin start`, when standard input supplies the run input, then spx creates a canonical verification context, opens a run journal, and reports the run token, context digest, resolved changed-file scope, and exact input descriptor ([test](tests/verify-start.scenario.l1.test.ts))
- Given a started run, when `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --run <run-token> input` runs, then it returns the exact verification input whose digest was recorded at start ([test](tests/verify-input.scenario.l1.test.ts))

### Mappings

- The `changeset` scope type resolves `base` and `head` into verification-context reconstruction fields and derives changed product paths as run scope metadata outside the canonical verification context ([test](tests/verify-scope.mapping.l1.test.ts))

### Compliance

- ALWAYS: `start` requires `--input <input-source>` and records the verification input for replay by the `input` verb ([test](tests/verify-start.scenario.l1.test.ts))
- ALWAYS: `input` requires `--run <run-token>` and rejects ambiguous type/scope-only selection ([test](tests/verify-input.scenario.l1.test.ts))
- NEVER: `input` reads a fresh `--input <input-source>` value instead of replaying the input recorded at `start` ([test](tests/verify-input.scenario.l1.test.ts))
- NEVER: `spx verify` exposes `--scope-type working-tree` without verification-context substrate representation for a working-tree subject kind and reconstruction fields ([test](tests/verify-scope.mapping.l1.test.ts))
