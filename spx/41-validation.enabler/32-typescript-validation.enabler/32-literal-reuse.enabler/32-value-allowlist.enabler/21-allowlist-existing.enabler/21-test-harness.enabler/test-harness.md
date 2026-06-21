# Allowlist Existing Test Harness

PROVIDES allowlist config fixtures — `buildBaselineConfig`, `buildConfigWithAllowlist`, and `buildConfigWithForeignSection` composing literal-validation configs over the production literal defaults, the `writeProjectConfig`/`readProductConfigSections` env round-trip, the `writeDuplicatedLiteralFixture`/`writeMultipleLiteralFixtures` generator-driven fixture writers, and `readLiteralAllowlist` extracting the allowlist values from a parsed config
SO THAT the allowlist-existing enabler's L1 tests
CAN build configs and reuse fixtures and read back their allowlist without restating the config section shape or the literal defaults

## Assertions

### Properties

- For all allowlist include lists, `readLiteralAllowlist` applied to `buildConfigWithAllowlist`'s config returns the same include list, merged over the production literal defaults ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: built configs compose over the production `LITERAL_DEFAULTS`, and fixture paths and literals are drawn from the literal generators — never restated literals ([audit])
- ALWAYS: project config files and literal fixtures are written through the spec-tree test env, which owns temp-directory lifecycle — the harness creates and removes no directory itself ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — fixtures are written to the real filesystem under the env's temp product directory ([audit])
