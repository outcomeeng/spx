# Allowlist Existing Test Harness

PROVIDES allowlist config helpers — `buildBaselineConfig`, `buildConfigWithAllowlist`, `buildConfigWithValidationPaths`, and `buildConfigWithForeignSection` composing validation configs over the production literal defaults, the `writeProjectConfig`/`readProductConfigSections` env round-trip, and `readLiteralAllowlist` extracting the allowlist values from a parsed config
SO THAT the allowlist-existing enabler's L1 tests
CAN build validation configs and read back their allowlist without restating the config section shape or the literal defaults

## Assertions

### Scenarios

- Given a config carrying an allowlist, when `writeProjectConfig` writes it through the env and `readProductConfigSections` reads it back, then the allowlist section survives the serialization round-trip ([test](tests/test-harness.scenario.l1.test.ts))
- Given validation path config and allowlist config, when `buildConfigWithValidationPaths` builds the config, then `validation.paths` is nested beside `validation.literal.values` ([test](tests/test-harness.scenario.l1.test.ts))

### Properties

- For all allowlist include lists, `readLiteralAllowlist` applied to `buildConfigWithAllowlist`'s config returns the same include list, merged over the production literal defaults ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: built configs compose over the production `LITERAL_DEFAULTS`, and validation path prefixes and literal values are drawn from the literal generators — never restated literals ([audit])
- ALWAYS: project config files are written through the spec-tree test env, which owns temp-directory lifecycle — the harness creates and removes no directory itself ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — fixtures are written to the real filesystem under the env's temp product directory ([audit])
