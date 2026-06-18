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

## TypeScript `--files` path scopes are passed to TypeScript as files

`spx validation typescript --files <directory>` can fail before validation
because directory scopes are forwarded into the generated TypeScript file list
as if they were files.

Observed on June 10, 2026 while validating audit-boundary code changes:

```bash
pnpm exec tsx src/cli.ts validation typescript --files \
  src/commands/audit \
  src/domains/audit \
  spx/36-audit.enabler/32-verify.enabler/21-verdict-reader.enabler/tests \
  spx/36-audit.enabler/32-verify.enabler/tests \
  spx/36-audit.enabler/54-branch-run-state.enabler/tests
```

Output:

```text
error TS6231: Could not resolve the path
'/Users/shz/Code/outcomeeng/spx/spx-a/src/commands/audit'
with the extensions: '.ts', '.tsx', '.d.ts', '.cts', '.d.cts', '.mts',
'.d.mts'.
  The file is in the program because:
    Part of 'files' list in tsconfig.json
error TS6231: Could not resolve the path
'/Users/shz/Code/outcomeeng/spx/spx-a/src/domains/audit'
with the extensions: '.ts', '.tsx', '.d.ts', '.cts', '.d.cts', '.mts',
'.d.mts'.
  The file is in the program because:
    Part of 'files' list in tsconfig.json
TypeScript exited with code 2
```

Observed on June 17, 2026 while validating a mixed focused set containing
TypeScript source, TypeScript tests, and a Markdown spec:

```bash
pnpm run validate --files \
  src/validation/discovery/tool-finder.ts \
  spx/41-validation.enabler/tests/tool-discovery.compliance.l1.test.ts \
  spx/41-validation.enabler/validation.md \
  src/commands/validation/circular.ts \
  src/validation/steps/circular.ts \
  spx/41-validation.enabler/tests/scope-resolution.compliance.l1.test.ts
```

Output:

```text
error TS6054: File
'/Users/shz/Code/outcomeeng/spx/spx-c/spx/41-validation.enabler/validation.md'
has an unsupported extension. The only supported extensions are '.ts', '.tsx',
'.d.ts', '.cts', '.d.cts', '.mts', '.d.mts'.
```

An explicit-file version of the same focused check passed:

```bash
run_state_tests=spx/36-audit.enabler/54-branch-run-state.enabler/tests

pnpm exec tsx src/cli.ts validation typescript --files \
  src/commands/audit/run-state.ts \
  src/domains/audit/run-state.ts \
  src/domains/audit/config.ts \
  "$run_state_tests"/run-file.compliance.l1.test.ts \
  "$run_state_tests"/run-state.compliance.l1.test.ts \
  "$run_state_tests"/branch-slug.property.l1.test.ts
```

```text
TypeScript: ✓ No type errors
```

**Impact:** Focused TypeScript validation with directory scopes can fail for
valid changes, forcing operators to expand directories to individual files or
run the full validation gate.

**Tracking classification:** Tracked deferral, chosen by the operator during the
audit-boundary work on June 10, 2026.

**Revisit condition:** Fix before changing TypeScript scope generation,
file-inclusion directory expansion, or the planned positional-path replacement
for `--files`; add evidence that directory scopes expand to TypeScript files
before writing the temporary tsconfig.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:test-typescript`, `typescript:code-typescript`,
`typescript:audit-typescript-tests`, and `typescript:audit-typescript`.

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
- `validateKnip` returns success when `typescriptScope.directories` is empty,
  even when filtered `filePatterns` still contains targets; gate the skip on
  both collections so path-filtered file patterns still run Knip.
- `eslint.config.production.ts` participates in production lint selection; add
  a compliance assertion in the lint enabler or validation configuration ADR if
  it is the durable production linting contract.
- `hasValidationPathFilter` relies on `&&` binding before `||`; add explicit
  parentheses around the metadata/no-match clause so the filter activation rule
  is unambiguous to readers.

**Scope:** follow-up work, not part of the managed subprocess lifecycle fix.

## Positional path arguments to replace `--files` flag

All `spx validation <step>` subcommands currently accept `--files <paths...>` to
scope which files are validated. The flag is redundant naming — paths are paths.
ESLint, ruff, mypy, and cat all accept files and directories as positional
arguments with no flag:

```bash
eslint src/
ruff check src/ tests/
mypy src/
cat *.md /tmp/drafts/ > out.md
```

The equivalent spx interface would be:

```bash
spx validation literal              # whole project
spx validation literal src/         # directory
spx validation literal src/ tests/  # two directories
spx validation all src/             # all validators scoped to src/
```

**Scope:** every `spx validation <step>` subcommand and the `spx validation all`
orchestrator. The orchestrator must thread positional paths through to each
validator's stage runner.

**Affected nodes:**

- `21-validation-cli.enabler` — CLI surface (argument parsing convention)
- `17-file-inclusion.enabler` — directory expansion behavior (walking a
  directory to its language-appropriate files); current spec says nothing about
  directory input, only explicit file lists
- Every leaf validator enabler (lint, type-check, ast-enforcement,
  circular-deps, literal-reuse, markdown)

**Related gap:** `17-file-inclusion.enabler` does not currently declare
directory expansion behavior. When a directory is supplied, the resolver should
walk it and return all language-appropriate files (`.ts`/`.tsx` for TypeScript,
`.py` for Python, etc.) as if they were supplied explicitly. This gap exists
independently of the positional-args decision.

**Decision needed:** PDR at `41-validation.enabler` level establishing
positional paths as the convention for all validation subcommands, with
`--files` deprecated or removed.

**Constraint:** `32-literal-reuse.enabler` output-mode redesign (in-flight)
retains `--files` as-is. Apply the positional-args change after the PDR is
authored and as a separate pass across all affected nodes.

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

## Validation test evidence filenames still use legacy integration/e2e suffixes

Several validation spec-tree tests still use legacy runner-style filenames rather
than the canonical `<subject>.<evidence>.<level>.test.ts` model required by the
testing methodology.

Observed on June 17, 2026:

```bash
rg --files spx/41-validation.enabler | rg '(integration|e2e)\.test\.ts$'
```

```text
spx/41-validation.enabler/65-markdown-validation.enabler/tests/markdown-validation.integration.test.ts
spx/41-validation.enabler/65-markdown-validation.enabler/tests/markdown-validation.e2e.test.ts
spx/41-validation.enabler/tests/validation.integration.test.ts
spx/41-validation.enabler/32-typescript-validation.enabler/tests/typescript-validation.integration.test.ts
spx/41-validation.enabler/32-typescript-validation.enabler/32-circular-deps.enabler/tests/circular-deps.integration.test.ts
spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/tests/lint.integration.test.ts
```

`spx/41-validation.enabler/65-markdown-validation.enabler/ISSUES.md` and
`spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/ISSUES.md`
track parts of the same naming debt locally; this entry keeps the remaining
validation-wide cleanup visible from the parent node.

**Impact:** the filenames hide which assertion type and execution level each
file proves, and several specs link many assertion classes to one legacy file.
That weakens agent routing through `spec-tree:test` and
`typescript:test-typescript`.

**Resolution:** split or rename each legacy file into canonical evidence files
such as `validation.scenario.l2.test.ts`,
`typescript-validation.mapping.l2.test.ts`, and
`circular-deps.compliance.l2.test.ts`, then update every affected `[test]` link
in the owning spec.

**Tracking classification:** Tracked deferral, chosen by the operator during
test-suite agent-output research on June 17, 2026.

**Revisit condition:** fix before changing validation test discovery, validation
test command output, or spec-tree test-evidence naming enforcement.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`spec-tree:test`, `typescript:test-typescript`,
`typescript:code-typescript`, `typescript:audit-typescript-tests`, and
`typescript:audit-typescript`.
