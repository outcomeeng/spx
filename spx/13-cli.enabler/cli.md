# CLI

PROVIDES the SPX command-line interface boundary — bounded sanitization of individual user-supplied argument echoes, complete terminal-safe Commander diagnostics, a package-script invocation contract that distinguishes development sources from published distributions, and process-lifecycle handling that forwards termination signals to spawned children and exits cleanly under pipe-close
SO THAT every domain handler that echoes user input back to a terminal, every consumer of `package.json` scripts, and every long-running subprocess spawned during a CLI invocation
CAN render diagnostics with no unprintable bytes and bounded length, CAN invoke the CLI through `tsx src/cli.ts` in development and `node bin/spx.js` after `pnpm run build`, and CAN trust that closing stdout, sending SIGINT, sending SIGTERM, or hitting an uncaught exception terminates every spawned child before the parent exits

## Assertions

### Scenarios

- Given the sanitizer receives `undefined`, then it returns `SENTINEL_UNDEFINED` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives `null`, then it returns `SENTINEL_NULL` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives the empty string, then it returns `SENTINEL_EMPTY` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives a non-string value, then it returns `nonStringSentinel(typeof value)` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the CLI's stdout is closed mid-write, when the next write fires, then the process exits with code 0 and stderr emits no `uncaughtException` text ([test](tests/lifecycle.scenario.l2.test.ts))
- Given one tracked child process and a SIGINT signal delivered to the parent, when the handler runs, then the child receives SIGINT and the parent exits with code 130 ([test](tests/lifecycle.scenario.l1.test.ts))
- Given two or more tracked child processes and a SIGTERM signal delivered to the parent, when the handler runs, then every tracked child receives SIGTERM and the parent exits with code 143 ([test](tests/lifecycle.scenario.l1.test.ts))
- Given one tracked child process and an uncaught exception reaching the top of the call stack, when the handler runs, then the child is killed and the parent exits with a non-zero code ([test](tests/lifecycle.scenario.l1.test.ts))
- Given a signal target holding the parent's SIGINT and SIGTERM listeners, when a foreground handoff suspends signal handling, then each foreground signal's original listeners are removed and a single ignore listener is installed; when the returned restore runs, the ignore listener is removed and the original listeners are reinstated ([test](tests/foreground-handoff.scenario.l1.test.ts))

### Mappings

- For every code point in `[0x00, 0x1F] ∪ {0x7F}`, the sanitizer maps a single-character input containing that code point to the string `\xNN` where `NN` is the lowercase two-digit hex of the code point ([test](tests/sanitize.mapping.l1.test.ts))
- For every code point in `[0x00, 0x1F] ∪ {0x7F}`, `escapeCliArgument` maps a single-character input containing that code point to the string `\xNN` where `NN` is the lowercase two-digit hex of the code point ([test](tests/sanitize.mapping.l1.test.ts))
- The lifecycle signal-to-exit-code mapping is: SIGINT → 130, SIGTERM → 143, EPIPE on stdout → 0, uncaught exception → 1 ([test](tests/lifecycle.mapping.l1.test.ts))
- Every production validation-step `ProcessRunner` default maps to the shared lifecycle runner exported from `src/lib/process-lifecycle/` ([test](tests/lifecycle.mapping.l1.test.ts))
- Asynchronous `child_process.spawn` imports outside `src/lib/process-lifecycle/` map to an AST-enforcement violation; synchronous `execSync` and `spawnSync` imports map to no violation ([test](../41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/tests/no-async-spawn-outside-lifecycle.mapping.l1.test.ts))

### Properties

- Idempotence: for every input `x`, `sanitize(sanitize(x)) === sanitize(x)` ([test](tests/sanitize.property.l1.test.ts))
- Output safety: for every input, every code point in the output is ≥ `FIRST_PRINTABLE_CHAR_CODE` and ≠ `DEL_CHAR_CODE` ([test](tests/sanitize.property.l1.test.ts))
- Length bound: for every input, `sanitize(x).length ≤ MAX_CLI_ARGUMENT_DISPLAY_LENGTH` ([test](tests/sanitize.property.l1.test.ts))
- Truncation shape: for every input string whose length exceeds `MAX_CLI_ARGUMENT_DISPLAY_LENGTH`, the sanitizer returns a string of exactly `MAX_CLI_ARGUMENT_DISPLAY_LENGTH` characters ending in `ELLIPSIS_TOKEN` ([test](tests/sanitize.property.l1.test.ts))
- Printable preservation: for every non-empty input string whose length is at most `MAX_CLI_ARGUMENT_DISPLAY_LENGTH` and whose every code point is ≥ `FIRST_PRINTABLE_CHAR_CODE` and ≠ `DEL_CHAR_CODE`, the sanitizer returns the input unchanged ([test](tests/sanitize.property.l1.test.ts))
- Escape-only preservation: for every printable input string whose length exceeds `MAX_CLI_ARGUMENT_DISPLAY_LENGTH`, `escapeCliArgument` returns the input unchanged rather than applying the sanitizer's display-length bound ([test](tests/sanitize.property.l1.test.ts))
- Registry conservation: for every interleaved sequence of child-handle add and remove operations, the registry is empty when every added handle has been removed ([test](tests/lifecycle.property.l1.test.ts))
- Cleanup idempotence: for every tracked child handle and every count `n ≥ 1`, invoking the SIGINT handler `n` times kills the child exactly once ([test](tests/lifecycle.property.l1.test.ts))
- Spawn registration: for every call to `lifecycleProcessRunner.spawn(...)`, the resulting child handle is added to the registry before the spawn returns ([test](tests/lifecycle.property.l1.test.ts))

### Compliance

- ALWAYS: development scripts invoke `tsx src/cli.ts`; publish scripts invoke `node bin/spx.js` only after `pnpm run build` produces `dist/cli.js` ([test](tests/package-scripts.compliance.l1.test.ts))
- ALWAYS: package formatting scripts invoke `dprint fmt .` and `dprint check .`; package scripts do not invoke Prettier ([test](tests/package-scripts.compliance.l1.test.ts))
- ALWAYS: `installLifecycle()` is the first call executed in `src/cli.ts` before any domain registration ([audit])
- ALWAYS: every production async `ProcessRunner` default in the validation steps points at the shared lifecycle runner exported from `src/lib/process-lifecycle/` ([test](tests/lifecycle.compliance.l1.test.ts))
- ALWAYS: managed long-running subprocesses use the process-lifecycle helper that owns parent-piped stdio rather than setting stdio at the domain call site ([test](tests/lifecycle.compliance.l1.test.ts))
- ALWAYS: the foreground exec-handoff runner spawns its child through the lifecycle module's `spawn` with inherited stdio and leaves the lifecycle registry untouched, so a terminal-owning child is neither tracked nor killed by the parent's signal cleanup ([audit])
- ALWAYS: a foreground exec-handoff ignores SIGINT and SIGTERM on the parent for the child's lifetime, then restores the parent's signal handling and exits with the child's status ([audit])
- NEVER: pass raw user-supplied strings to `console.error`, `process.stderr.write`, or shell execution paths without `sanitizeCliArgument` in the chain ([audit])
- ALWAYS: Commander diagnostics preserve trusted multiline layout and complete generated usage text while escaping terminal-control bytes without applying the individual-argument display-length bound to the complete diagnostic ([test](tests/commander-diagnostics.compliance.l1.test.ts))
- NEVER: the packaged executable imports `src/cli.ts` when built output is absent; it exits with a build-required diagnostic instead ([audit])
- NEVER: import `child_process.spawn` for asynchronous child processes outside `src/lib/process-lifecycle/`; synchronous `execSync`/`spawnSync` are exempt because they self-reap before parent exit ([test](../41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/tests/no-async-spawn-outside-lifecycle.mapping.l1.test.ts))
