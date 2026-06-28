# Known Issues: 41-validation.enabler

## Documentation follow-up: validation env toggles moved to config

`KNIP_VALIDATION_ENABLED` and `LITERAL_VALIDATION_ENABLED` are no longer
validation controls. Projects configure these stages through `spx.config.*`:

- `validation.knip.enabled`
- `validation.literal.enabled`

**Migration impact:** projects that enabled Knip with
`KNIP_VALIDATION_ENABLED=1` must set `validation.knip.enabled: true`. Projects
that disabled literal validation with `LITERAL_VALIDATION_ENABLED=0` must set
`validation.literal.enabled: false`.

**Current release state:** `npm view @outcomeeng/spx version` reports `0.6.7`,
and tag `v0.6.5` contains the validation config-descriptor replacement. This
repository has no root `CHANGELOG.md` artifact; release-notes generation is
itself pending under `spx/26-release.enabler/32-release-notes.enabler/`.

**Revisit condition:** include this migration note when adding a changelog,
release-notes surface, validation configuration docs, or another user-facing
validation migration notice.

---

## Validation CLI output stream alignment

The review on
[`outcomeeng/spx#200`](https://github.com/outcomeeng/spx/pull/200#issuecomment-4751202797)
identified that `src/interfaces/cli/validation.ts` writes validation command
output with `console.log(result.output)` for all exit codes, while the audit CLI
routes non-zero command output to stderr.

**Impact:** CLI domains have inconsistent output-stream contracts for failures.
The audit behavior follows the Unix convention: command errors go to stderr.

**Tracking classification:** Follow-up from PR review on June 19, 2026.

**Revisit condition:** Resolve when changing validation CLI rendering, output
stream routing, or the validation command result interface; align validation
failure output with the audit CLI stderr-for-errors behavior.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:test-typescript`, `typescript:code-typescript`,
`typescript:audit-typescript-tests`, and `typescript:audit-typescript`.

---

## Lint path scopes lack TypeScript-scope intersection

The review on `outcomeeng/spx#211` identified that `circularCommand` and
`knipCommand` now resolve explicit path operands through
`resolveTypeScriptValidationScope`, which intersects explicit paths with the
effective TypeScript scope before forwarding them to their tools.
`typescriptCommand` now uses the same resolver. `lintCommand` still applies
validation path filters directly and does not drop explicit paths outside the
tsconfig-backed TypeScript scope.

**Impact:** An explicit path outside the effective TypeScript scope can be
forwarded by lint while TypeScript, circular, and Knip reject the same path, so
validation subcommands do not share one effective-scope contract.

**Tracking classification:** Follow-up from PR #211 review on June 20, 2026.

**Revisit condition:** Resolve before further changing validation path operand
handling, TypeScript scope generation, or lint target selection.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`,
`typescript:test-typescript`, `typescript:code-typescript`,
`typescript:audit-typescript-tests`, and `typescript:audit-typescript`.

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
