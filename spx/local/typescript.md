# SPX TypeScript — Repo-Local Overlay

This file extends `/standardizing-typescript`, `/standardizing-typescript-tests`, `/coding-typescript`, and `/testing-typescript` with SPX-specific lessons. Read it after the canonical skills.

## Commander.js: `isDefault: true` swallows unknown args

When a Commander subcommand is registered with `{ isDefault: true }`, Commander treats unknown tokens on the command line as positional arguments to that default command — it does **not** fire `.on("command:*", handler)`. The effect: unknown-subcommand dispatch handlers never run.

- REQUIRED: if a domain needs to detect unknown subcommands (e.g., to sanitize + error), do **not** use `isDefault`. Users pass the full path (`spx validation all`); `command:*` then fires for anything else.
- Verified in [src/domains/validation/index.ts](../../src/domains/validation/index.ts) after removing `isDefault: true` on `all` — see [21-validation-cli.enabler](../41-validation.enabler/21-validation-cli.enabler/validation-cli.md).

## tsup externals for `@typescript-eslint/parser`

The parser pulls in `@typescript-eslint/typescript-estree` → `debug` → dynamic `require("tty")`, `require("fs")`, etc. Bundled into a single ESM file by tsup, these become `__require2` stubs that fail at runtime with: `Dynamic require of "tty" is not supported`.

- REQUIRED: add to [tsup.config.ts](../../tsup.config.ts) `external[]`:
  - `@typescript-eslint/parser`
  - `@typescript-eslint/visitor-keys`
  - `@typescript-eslint/typescript-estree`
  - `eslint-visitor-keys`
- REQUIRED: install these as **runtime** dependencies (not devDependencies) via `pnpm add <pkg>`.
- OBSERVABLE: bundle size drops by ~10 MB when externalized correctly.

## Property-based tests must be falsifiable

A property test that generates inputs and asserts an invariant is only useful if a real bug class would make it fail. Two anti-patterns:

1. **Filtered identity**: `fc.property(fc.string().filter(s => predicate(s)), x => expect(sanitize(x)).toBe(x))`. The filter encodes the expected output; the test degrades to a parameterized identity assertion, not an invariant over the full input domain.
2. **"Does not throw"**: `expect(() => f(x)).not.toThrow()`. Trivially satisfied by any implementation that returns a constant (e.g., `return ""`). Not falsifiable.

- REQUIRED: derive properties from the **spec**, not from the implementation. The filter (if any) belongs to the input-domain description, not the assertion.
- REQUIRED: every property must name a real bug class that would break it. If you cannot articulate that bug class, the property is useless.
- EXAMPLES of valid properties for a sanitizer: idempotence (`sanitize(sanitize(x)) === sanitize(x)`), output safety (every code point in output is printable), length bound (`sanitize(x).length ≤ MAX`).

## Cross-cutting CLI concerns live at a domain CLI child enabler

Subcommand dispatch, argument parsing, and unknown-subcommand safety are CLI-framework concerns shared by every stage under a domain. They belong at a dedicated child enabler under the domain, following the canonical pattern established by [16-config.enabler/21-config-cli.enabler](../16-config.enabler/21-config-cli.enabler/config-cli.md).

- PATTERN: `spx/{NN}-{domain}.enabler/21-{domain}-cli.enabler/{domain}-cli.md` — typed dispatcher, handler signatures, argument sanitization.
- REQUIRED: do **not** place cross-cutting CLI concerns in `21-core-cli.capability/` (frozen legacy per [spx/ISSUES.md](../ISSUES.md)) or in a specific subcommand's leaf node.
- REFERENCE implementations: [16-config.enabler/21-config-cli.enabler](../16-config.enabler/21-config-cli.enabler/), [41-validation.enabler/21-validation-cli.enabler](../41-validation.enabler/21-validation-cli.enabler/), [36-session.enabler/76-session-cli.enabler](../36-session.enabler/76-session-cli.enabler/).
- Shared pure helpers (e.g., `sanitizeCliArgument`) live in `src/lib/` so any domain's CLI enabler can import them.
