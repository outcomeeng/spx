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
