# Known Issues: 41-validation.enabler

## Release note: validation env toggles moved to config

`KNIP_VALIDATION_ENABLED` and `LITERAL_VALIDATION_ENABLED` are no longer
validation controls. Projects configure these stages through `spx.config.*`:

- `validation.knip.enabled`
- `validation.literal.enabled`

**Migration impact:** projects that enabled Knip with
`KNIP_VALIDATION_ENABLED=1` must set `validation.knip.enabled: true`. Projects
that disabled literal validation with `LITERAL_VALIDATION_ENABLED=0` must set
`validation.literal.enabled: false`.

**Release requirement:** include this migration note in the next published
release notes before tagging a release that contains the config-descriptor
replacement.

---

## PR 19 review follow-ups for validation path filtering

The review on
[`outcomeeng/spx#19`](https://github.com/outcomeeng/spx/pull/19#issuecomment-4437790114)
identified follow-ups after the managed subprocess and validation path-filter
cleanup:

- `applyValidationPathFilterToScope` falls back from file patterns to directory
  names; confirm the TypeScript temp `include` semantics recurse the same way
  ESLint directory targets do, or normalize directory fallbacks to recursive
  globs before writing temp tsconfig files.
- `eslint.config.production.ts` participates in production lint selection; add
  a compliance assertion in the lint enabler or validation configuration ADR if
  it is the durable production linting contract.

**Scope:** follow-up work, not part of the managed subprocess lifecycle fix.

---

## `allCommand` hardcodes stage dispatch (ADR-19 violation)

`src/commands/validation/all.ts` imports each stage handler by name and invokes it in a fixed sequence. This violates [ADR-19 language registration](../19-language-registration.adr.md), which mandates:

> NEVER: Hardcode language-specific dispatch in orchestration code (`allCommand`, `testCommand`, pipeline composition) — orchestration iterates over the registry.

**Scope:** all 6 stages (`circularCommand`, `knipCommand`, `lintCommand`, `typescriptCommand`, `markdownCommand`, `literalCommand`) are hardcoded. `literalCommand` participates in the same direct-dispatch pattern as the other validation stages.

**Consequence:** no language registry exists. The prior `src/validation/languages/` descriptor stub was removed as vacuous. Every stage is wired by direct import from `src/commands/validation/{stage}.ts` into `allCommand`, with a hardcoded `TOTAL_STEPS = 6` constant that must be updated manually whenever stages are added or removed.

**Remediation:** refactor `allCommand` to iterate a typed language registry. Steps:

1. Author `src/validation/registry.ts` that imports each language descriptor explicitly.
2. Author language descriptors at `src/validation/languages/{language}.ts` with a typed stage shape; each stage carries a `run: (ctx) => Promise<ValidationCommandResult>` callable.
3. Rewrite `allCommand` to iterate `registry.languages.flatMap(l => l.stages)` and dispatch via each stage's `run`.
4. Derive step count from the stage list — replace the `TOTAL_STEPS = 5` constant with `stages.length`, so appending or removing a stage self-numbers without a constant update.
5. Delete the by-name imports in `src/commands/validation/all.ts`.
6. Update `spx/41-validation.enabler/tests/validation.integration.test.ts` to derive its expected step count from the registry rather than hardcoding `TOTAL_STEPS = 5`.

**Scope:** this is follow-up work, not part of any in-flight cycle.

---

## Positional path arguments to replace `--files` flag

All `spx validation <step>` subcommands currently accept `--files <paths...>` to scope which files are validated. The flag is redundant naming — paths are paths. ESLint, ruff, mypy, and cat all accept files and directories as positional arguments with no flag:

```
eslint src/
ruff check src/ tests/
mypy src/
cat *.md /tmp/drafts/ > out.md
```

The equivalent spx interface would be:

```
spx validation literal              # whole project
spx validation literal src/         # directory
spx validation literal src/ tests/  # two directories
spx validation all src/             # all validators scoped to src/
```

**Scope:** every `spx validation <step>` subcommand and the `spx validation all` orchestrator. The orchestrator must thread positional paths through to each validator's stage runner.

**Affected nodes:**

- `21-validation-cli.enabler` — CLI surface (argument parsing convention)
- `17-file-inclusion.enabler` — directory expansion behavior (walking a directory to its language-appropriate files); current spec says nothing about directory input, only explicit file lists
- Every leaf validator enabler (lint, type-check, ast-enforcement, circular-deps, literal-reuse, markdown)

**Related gap:** `17-file-inclusion.enabler` does not currently declare directory expansion behavior. When a directory is supplied, the resolver should walk it and return all language-appropriate files (`.ts`/`.tsx` for TypeScript, `.py` for Python, etc.) as if they were supplied explicitly. This gap exists independently of the positional-args decision.

**Decision needed:** PDR at `41-validation.enabler` level establishing positional paths as the convention for all validation subcommands, with `--files` deprecated or removed.

**Constraint:** `32-literal-reuse.enabler` output-mode redesign (in-flight) retains `--files` as-is. Apply the positional-args change after the PDR is authored and as a separate pass across all affected nodes.

**Scope:** follow-up work, not part of any in-flight cycle.

---

## `validation all --quiet --json` emits warning text before JSON

`pnpm exec tsx src/cli.ts validation all --quiet --json` is not parseable JSON
when ESLint reports `spx/no-test-owned-domain-constants` warnings. During the
May 8, 2026 verification pass, parsing `/tmp/spx-validation-all-current.json`
failed because the file began with human warning output:

```text
/Users/shz/Code/outcomeeng/spx/spx/16-config.enabler/...
```

**Consequence:** agents and scripts cannot rely on `validation all --quiet
--json` as a machine-readable gate while warnings are present, even though
`pnpm run validate` exits 0.

**Remediation:** route diagnostics through the JSON result shape when `--json`
is set, or emit human warning text on a separate stream that callers can keep
out of the JSON capture.

**Scope:** follow-up work for the next validation cleanup tranche.

---

## Repository-wide `dprint check .` drift

`pnpm run format:check` failed on May 12, 2026 with 17 unrelated files that
would be rewritten by `dprint fmt .`, including `eslint-rules/index.ts`,
multiple `spx/16-config.enabler/**/tests/*.ts` files, session/audit legacy test
files, and `pnpm-lock.yaml`.

The active review-thread fix formatted its touched files directly with
`pnpm exec dprint fmt <paths...>`, and the source validation gate passed. The
repo-wide formatter drift is deferred because including the full cleanup would
add broad lockfile and cross-node formatting churn to a targeted validation PR.

**Revisit condition:** run as a dedicated formatter cleanup pass before making
`pnpm run format:check` a required PR gate.

---

## Resolved: PR 15 review follow-ups for validation metadata and markdown targets

The review on
[`outcomeeng/spx#15`](https://github.com/outcomeeng/spx/pull/15#issuecomment-4398198837)
identified non-blocking follow-ups after the validation-gate cleanup. The
validation review cleanup branch resolved that list.

The metadata cleanup now uses `formatTypeScriptAbsentSkipMessage(stageName)` for
TypeScript-absence skip text, imports runtime anti-markers from their canonical
runtime diagnostics module, derives validation step-line matching from
`VALIDATION_PIPELINE.TOTAL_STEPS`, removes validation generator aliases that only
renamed canonical metadata or samplers, and renames the ESLint expectation for no
reported diagnostics to `noDiagnostics`.

The subprocess cleanup now handles parent-stream backpressure while forwarding
child output and gives ESLint validation the same injectable output-stream
surface used by TypeScript validation.

Markdown target cleanup keeps directory targets on the existing `**/*.md`
discovery policy, while direct file targets still accept existing `.md` and
`.markdown` files. Explicit file scopes that are missing or unrelated now emit a
source-owned skipped-scope diagnostic. Target classification accepts injected
filesystem state, and the markdown harness uses generator-owned diagnostics for
missing fixture-backed scenarios.

The no-spec-reference rule exemption for the ADR/PDR snippet generator now has a
local comment explaining the test-data ownership.
