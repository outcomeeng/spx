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

**Current release state:** `package.json` on `origin/main` declares `0.6.8`,
tag `v0.6.8` exists, `npm view @outcomeeng/spx version` reports `0.6.7`, and
tag `v0.6.5` contains the validation config-descriptor replacement. This
repository has no root `CHANGELOG.md` artifact; release-notes generation is
itself pending under `spx/26-release.enabler/32-release-notes.enabler/`.

**Revisit condition:** include this migration note when adding a changelog,
release-notes surface, validation configuration docs, or another user-facing
validation migration notice.

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
