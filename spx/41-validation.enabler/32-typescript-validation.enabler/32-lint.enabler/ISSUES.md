# Known Issues: 32-lint.enabler

## Legacy lint CLI test filename

`tests/lint.integration.test.ts` uses the legacy `.integration.test.ts` suffix instead of the canonical `<subject>.<evidence>.<level>.test.ts` model required by the TypeScript testing skill.

**Consequence:** the filename hides the test's evidence mode and execution level, and the file currently carries multiple assertion links from `lint.md`.

**Remediation:** split the CLI behavior evidence into canonical files such as `lint.scenario.l2.test.ts` and `lint-cli.compliance.l2.test.ts`, then update the assertion links in `lint.md`.

## Repository lint migration quarantine

`eslint.config.ts` downgrades selected test-only lint rules from error to warning for paths listed in `eslint.test-lint-debt-nodes.json`.

The quarantined rule set is:

- `no-restricted-syntax` entries for assertion string literals and `readFileSync`
- `spx/no-hardcoded-work-item-kinds`
- `spx/no-hardcoded-statuses`

**Consequence:** `spx validation lint` remains portable for consuming projects, but this repository still carries test-string and registry-literal debt in the manifest paths.

**Remediation:** migrate the manifest-listed tests to import source-owned values or obtain inputs from generators, harnesses, or fixture files. Remove entries from `eslint.test-lint-debt-nodes.json` as each node is migrated; when the manifest is empty, remove the warning override block from `eslint.config.ts`.
