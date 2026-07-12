PROVIDES the `spx validation` CLI surface — subcommand dispatch, validation-specific flag registration, and routing of well-formed subcommands to their stage handlers
SO THAT operators, agents, and CI pipelines invoking `spx validation <subcommand> [args]`
CAN trust that well-formed subcommands reach the correct stage and that malformed or adversarial input never runs a stage

## Assertions

### Scenarios

- Given a well-formed subcommand that matches a registered stage, when its handler succeeds, then the handler runs, its returned output is written to stdout, and its zero exit code propagates ([test](tests/dispatch.scenario.l2.test.ts))
- Given a well-formed subcommand that matches a registered stage, when its handler fails, then the handler runs, its returned output is written to stderr, and its non-zero exit code propagates ([test](tests/dispatch.scenario.l2.test.ts))
- Given `spx validation all` streams stage progress before a later stage fails, when dispatch completes, then the streamed progress remains on stdout, the handler's returned failure summary is written to stderr, and the non-zero exit code propagates ([test](tests/dispatch.scenario.l2.test.ts))
- Given built artifacts exist, when `node bin/spx.js validation circular` is invoked, then the packaged executable routes the circular subcommand handler ([test](tests/dispatch.scenario.l2.test.ts))
- Given an unknown subcommand, when `spx validation <garbage>` is invoked, then no stage runs, stderr reports "unknown subcommand" with the sanitized argument, and exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- Given an argument containing ASCII control characters, when `spx validation <arg>` is invoked, then stderr shows each control character as its `\xNN` escape form and no stage runs ([test](tests/dispatch.scenario.l2.test.ts))
- Given an argument containing multi-byte Unicode code points, when `spx validation <arg>` is invoked, then stderr shows those code points unchanged ([test](tests/dispatch.scenario.l2.test.ts))
- Given a path operand escapes the product directory, when `spx validation <subcommand> <operand>` is invoked, then no stage runs, stderr reports "invalid path operand" with the sanitized operand and escape reason, and exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- Given the invocation directory reaches the product through a filesystem symlink, when `spx validation <subcommand> <operand>` is invoked with a non-existent in-product path operand, then the operand resolves inside the product instead of being rejected as an escape ([test](tests/dispatch.scenario.l2.test.ts))
- Given literal validation help is requested, when `spx validation literal --help` is invoked, then the help output lists `[paths...]`, `--allowlist-existing`, `--kind <kind>`, `--files-with-problems`, `--literals`, `--verbose`, and the valid `--kind` values `reuse` and `dupe` ([test](tests/dispatch.scenario.l2.test.ts))
- Given an unknown literal problem kind, when `spx validation literal --kind <kind>` is invoked, then no literal detection runs, stderr reports "unknown problem kind" with the sanitized kind, and exit code is non-zero ([test](tests/dispatch.scenario.l2.test.ts))
- Given validation-all help is requested, when `spx validation all --help` is invoked, then the help output lists the full-pipeline override flags derived from registered stage participation metadata ([test](tests/dispatch.scenario.l2.test.ts))
- Given a validation stage's default participation is overridden for one full-pipeline run, when `spx validation all <override-flag>` is invoked, then that stage follows the override, emits its configured skip output unless `--quiet` is set, and the other validation stages follow their defaults ([test](tests/dispatch.scenario.l2.test.ts))
- Given a validation stage's default participation is overridden for one JSON full-pipeline run, when `spx validation all <override-flag> --json` is invoked, then the overridden stage emits a structured skipped sentinel with its configured reason instead of the human skip message ([test](tests/dispatch.scenario.l2.test.ts))
- Given `spx validation all --json` emits stage results, when stdout is consumed, then it contains exactly one aggregate JSON document with every ordered stage result and no human output ([test](tests/dispatch.scenario.l2.test.ts))
- Given a validation stage's default participation is overridden for one production-scope full-pipeline run, when `spx validation all --scope production <override-flag>` is invoked, then the override applies to that stage and the other production-scope validation stages follow their defaults ([test](tests/dispatch.scenario.l2.test.ts))

### Properties

- Dispatch safety: for every non-empty, non-option string not in the registered-subcommand set, `spx validation <string>` exits non-zero and invokes no stage handler ([test](tests/dispatch.property.l2.test.ts))

### Mappings

- Literal report output modes map findings to a non-zero exit code with the report on stdout and no report content on stderr ([test](tests/dispatch.mapping.l2.test.ts))

### Compliance

- ALWAYS: route every `spx validation <subcommand>` invocation against the registered subcommand set; unknown subcommands reach the safe-error path and never enter a stage handler ([test](tests/dispatch.compliance.l2.test.ts))
- ALWAYS: emit unknown-subcommand diagnostics to stderr with the argument passed through `sanitizeCliArgument`; exit code is non-zero ([test](tests/dispatch.compliance.l2.test.ts))
- ALWAYS: register full-pipeline participation override flags on `spx validation all` from stage descriptors and scope them to that full-pipeline invocation; standalone stage subcommands do not accept full-pipeline override flags ([test](tests/dispatch.compliance.l2.test.ts))
- ALWAYS: reject invalid `--kind` values before literal detection, emit the sanitized kind to stderr, and exit non-zero ([test](tests/dispatch.compliance.l2.test.ts))
- NEVER: invoke a stage handler during dispatch failure ([test](tests/dispatch.compliance.l2.test.ts))
- NEVER: invoke a stage handler when Commander rejects an unknown option ([test](tests/dispatch.compliance.l2.test.ts))
- NEVER: use `vi.mock()`, `jest.mock()`, or any filesystem-mocking mechanism in tests under this enabler ([audit])
