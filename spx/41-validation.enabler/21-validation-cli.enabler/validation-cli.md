# Validation CLI

PROVIDES the `spx validation` CLI surface — subcommand dispatch, argument parsing, and a shared sanitizer for diagnostic echo of unrecognized input — plus the sanitizer as an importable pure function available to every domain
SO THAT operators, agents, and CI pipelines invoking `spx validation <subcommand> [args]`
CAN trust that well-formed subcommands reach the correct stage, malformed or adversarial input never runs a stage, and no unsanitized byte ever reaches a terminal or subshell

## Assertions

### Scenarios

- Given the sanitizer receives `undefined`, then it returns `SENTINEL_UNDEFINED` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives `null`, then it returns `SENTINEL_NULL` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives the empty string, then it returns `SENTINEL_EMPTY` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives a non-string value, then it returns `nonStringSentinel(typeof value)` ([test](tests/sanitize.scenario.l1.test.ts))
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

### Mappings

- For every code point in `[0x00, 0x1F] ∪ {0x7F}`, the sanitizer maps a single-character input containing that code point to the string `\xNN` where `NN` is the lowercase two-digit hex of the code point ([test](tests/sanitize.mapping.l1.test.ts))
- For every input string whose length exceeds `MAX_CLI_ARGUMENT_DISPLAY_LENGTH`, the sanitizer returns a string of exactly `MAX_CLI_ARGUMENT_DISPLAY_LENGTH` characters ending in `ELLIPSIS_TOKEN` ([test](tests/sanitize.mapping.l1.test.ts))
- For every input string whose length is at most `MAX_CLI_ARGUMENT_DISPLAY_LENGTH` and whose every code point is ≥ `FIRST_PRINTABLE_CHAR_CODE` and ≠ `DEL_CHAR_CODE`, the sanitizer returns the input unchanged ([test](tests/sanitize.mapping.l1.test.ts))

### Properties

- Idempotence: for every input `x`, `sanitize(sanitize(x)) === sanitize(x)` ([test](tests/sanitize.property.l1.test.ts))
- Output safety: for every input, every code point in the output is ≥ `FIRST_PRINTABLE_CHAR_CODE` and ≠ `DEL_CHAR_CODE` ([test](tests/sanitize.property.l1.test.ts))
- Length bound: for every input, `sanitize(x).length ≤ MAX_CLI_ARGUMENT_DISPLAY_LENGTH` ([test](tests/sanitize.property.l1.test.ts))
- Dispatch safety: for every string not in the registered-subcommand set, `spx validation <string>` exits non-zero and invokes no stage handler ([test](tests/dispatch.property.l2.test.ts))

### Compliance

- ALWAYS: route every `spx validation <subcommand>` invocation through a dispatcher that resolves against a typed registry; unknown subcommands reach the safe-error path and never enter a stage handler ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: emit unknown-subcommand diagnostics to stderr with the argument passed through `sanitizeCliArgument`; exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: register literal-specific flags on `spx validation literal` and expose them through command help with the same operands accepted by the handler, including the valid `--kind` values `reuse` and `dupe` ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: register `--skip-literal` on `spx validation all` and scope it to that full-pipeline invocation; the flag does not change `spx validation literal` behavior ([test](tests/dispatch.scenario.l2.test.ts), [test](../tests/validation.integration.test.ts))
- ALWAYS: emit the skipped literal step as structured JSON with `skipped: true` and `reason: "skip-literal"` when `spx validation all --skip-literal --json` is invoked ([test](../tests/validation.integration.test.ts))
- ALWAYS: reject invalid `--kind` values before literal detection, emit the sanitized kind to stderr, and exit non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- ALWAYS: development validation scripts invoke `tsx src/cli.ts`; publish validation invokes `node bin/spx.js` only after `pnpm run build` creates `dist/cli.js` ([test](tests/package-scripts.compliance.l1.test.ts))
- ALWAYS: package formatting scripts invoke `dprint fmt .` and `dprint check .`; package scripts do not invoke Prettier ([test](tests/package-scripts.compliance.l1.test.ts))
- NEVER: pass raw user-supplied strings to `console.error`, `process.stderr.write`, or shell execution paths without `sanitizeCliArgument` in the chain ([review])
- NEVER: invoke a stage handler during dispatch failure ([test](tests/dispatch.scenario.l2.test.ts))
- NEVER: the packaged executable imports `src/cli.ts` when built output is absent; it exits with a build-required diagnostic instead ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, or any filesystem-mocking mechanism in tests under this enabler ([review])
