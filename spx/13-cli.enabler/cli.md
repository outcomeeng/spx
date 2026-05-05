# CLI

PROVIDES the SPX command-line interface boundary — sanitization of user-supplied bytes for diagnostic echo and a package-script invocation contract that distinguishes development sources from published distributions
SO THAT every domain handler that echoes user input back to a terminal and every consumer of `package.json` scripts
CAN render diagnostics with no unprintable bytes and bounded length, and CAN invoke the CLI through `tsx src/cli.ts` in development and `node bin/spx.js` after `pnpm run build`

## Assertions

### Scenarios

- Given the sanitizer receives `undefined`, then it returns `SENTINEL_UNDEFINED` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives `null`, then it returns `SENTINEL_NULL` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives the empty string, then it returns `SENTINEL_EMPTY` ([test](tests/sanitize.scenario.l1.test.ts))
- Given the sanitizer receives a non-string value, then it returns `nonStringSentinel(typeof value)` ([test](tests/sanitize.scenario.l1.test.ts))

### Mappings

- For every code point in `[0x00, 0x1F] ∪ {0x7F}`, the sanitizer maps a single-character input containing that code point to the string `\xNN` where `NN` is the lowercase two-digit hex of the code point ([test](tests/sanitize.mapping.l1.test.ts))
- For every input string whose length exceeds `MAX_CLI_ARGUMENT_DISPLAY_LENGTH`, the sanitizer returns a string of exactly `MAX_CLI_ARGUMENT_DISPLAY_LENGTH` characters ending in `ELLIPSIS_TOKEN` ([test](tests/sanitize.mapping.l1.test.ts))
- For every input string whose length is at most `MAX_CLI_ARGUMENT_DISPLAY_LENGTH` and whose every code point is ≥ `FIRST_PRINTABLE_CHAR_CODE` and ≠ `DEL_CHAR_CODE`, the sanitizer returns the input unchanged ([test](tests/sanitize.mapping.l1.test.ts))

### Properties

- Idempotence: for every input `x`, `sanitize(sanitize(x)) === sanitize(x)` ([test](tests/sanitize.property.l1.test.ts))
- Output safety: for every input, every code point in the output is ≥ `FIRST_PRINTABLE_CHAR_CODE` and ≠ `DEL_CHAR_CODE` ([test](tests/sanitize.property.l1.test.ts))
- Length bound: for every input, `sanitize(x).length ≤ MAX_CLI_ARGUMENT_DISPLAY_LENGTH` ([test](tests/sanitize.property.l1.test.ts))

### Compliance

- ALWAYS: development scripts invoke `tsx src/cli.ts`; publish scripts invoke `node bin/spx.js` only after `pnpm run build` produces `dist/cli.js` ([test](tests/package-scripts.compliance.l1.test.ts))
- ALWAYS: package formatting scripts invoke `dprint fmt .` and `dprint check .`; package scripts do not invoke Prettier ([test](tests/package-scripts.compliance.l1.test.ts))
- NEVER: pass raw user-supplied strings to `console.error`, `process.stderr.write`, or shell execution paths without `sanitizeCliArgument` in the chain ([review])
- NEVER: the packaged executable imports `src/cli.ts` when built output is absent; it exits with a build-required diagnostic instead ([review])
