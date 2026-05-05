# Validation CLI

PROVIDES the `spx validation` CLI surface — subcommand dispatch, validation-specific flag registration, and routing of well-formed subcommands to their stage handlers
SO THAT operators, agents, and CI pipelines invoking `spx validation <subcommand> [args]`
CAN trust that well-formed subcommands reach the correct stage and that malformed or adversarial input never runs a stage

## Assertions

### Scenarios

- Given a well-formed subcommand that matches a registered stage, when `spx validation <subcommand>` is invoked, then the subcommand's handler runs and its exit code propagates ([test](tests/dispatch.scenario.l2.test.ts))
- Given built artifacts exist, when `node bin/spx.js validation <subcommand>` is invoked, then the packaged executable loads the built CLI and routes the subcommand handler ([test](tests/dispatch.scenario.l2.test.ts))
- Given an unknown subcommand, when `spx validation <garbage>` is invoked, then no stage runs, stderr reports "unknown subcommand" with the sanitized argument, and exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- Given an argument containing ASCII control characters, when `spx validation <arg>` is invoked, then stderr shows each control character as its `\xNN` escape form and no stage runs ([test](tests/dispatch.scenario.l2.test.ts))
- Given an argument containing multi-byte Unicode code points, when `spx validation <arg>` is invoked, then stderr shows those code points unchanged ([test](tests/dispatch.scenario.l2.test.ts))
- Given literal validation help is requested, when `spx validation literal --help` is invoked, then the help output lists `--allowlist-existing`, `--kind <kind>`, `--files-with-problems`, `--literals`, `--verbose`, and the valid `--kind` values `reuse` and `dupe` ([test](tests/dispatch.scenario.l2.test.ts))
- Given an unknown literal problem kind, when `spx validation literal --kind <kind>` is invoked, then no literal detection runs, stderr reports "unknown problem kind" with the sanitized kind, and exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- Given validation-all help is requested, when `spx validation all --help` is invoked, then the help output lists `--skip-literal` ([test](tests/dispatch.scenario.l2.test.ts))
- Given literal validation is skipped for one full-pipeline run, when `spx validation all --skip-literal` is invoked, then literal detection exits zero with skip output unless `--quiet` is set, and the other validation stages still run ([test](../tests/validation.integration.test.ts))
- Given literal validation is skipped for one JSON full-pipeline run, when `spx validation all --skip-literal --json` is invoked, then the literal step emits a structured skipped sentinel instead of the human skip message ([test](../tests/validation.integration.test.ts))
- Given literal validation is skipped for one production-scope full-pipeline run, when `spx validation all --scope production --skip-literal` is invoked, then the literal step is skipped and the other production-scope validation stages still run ([test](../tests/validation.integration.test.ts))

### Properties

- Dispatch safety: for every string not in the registered-subcommand set, `spx validation <string>` exits non-zero and invokes no stage handler ([test](tests/dispatch.property.l2.test.ts))

### Compliance

- ALWAYS: route every `spx validation <subcommand>` invocation through a dispatcher that resolves against a typed registry; unknown subcommands reach the safe-error path and never enter a stage handler ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: emit unknown-subcommand diagnostics to stderr with the argument passed through `sanitizeCliArgument`; exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: register literal-specific flags on `spx validation literal` and expose them through command help with the same operands accepted by the handler, including the valid `--kind` values `reuse` and `dupe` ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: register `--skip-literal` on `spx validation all` and scope it to that full-pipeline invocation; the flag does not change `spx validation literal` behavior ([test](tests/dispatch.scenario.l2.test.ts), [test](../tests/validation.integration.test.ts))
- ALWAYS: emit the skipped literal step as structured JSON with `skipped: true` and `reason: "skip-literal"` when `spx validation all --skip-literal --json` is invoked ([test](../tests/validation.integration.test.ts))
- ALWAYS: apply `--skip-literal` to the literal step regardless of whether `spx validation all` runs with full or production scope ([test](../tests/validation.integration.test.ts))
- ALWAYS: reject invalid `--kind` values before literal detection, emit the sanitized kind to stderr, and exit non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- NEVER: invoke a stage handler during dispatch failure ([test](tests/dispatch.scenario.l2.test.ts))
- NEVER: use `vi.mock()`, `jest.mock()`, or any filesystem-mocking mechanism in tests under this enabler ([review])
