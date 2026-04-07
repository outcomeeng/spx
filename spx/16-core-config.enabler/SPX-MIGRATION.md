# SPX-MIGRATION: 16-core-config.enabler

## Origin

**From**: `specs/work/doing/capability-42_core-config/feature-21_default-config/story-11_config-schema/`
**Migration Date**: 2026-04-07

## Test Inventory

| Test File                          | Source                                                              | Operation         |
| ---------------------------------- | ------------------------------------------------------------------- | ----------------- |
| `tests/config-schema.unit.test.ts` | `specs/.../story-11_config-schema/tests/config-schema.unit.test.ts` | `git mv`          |
| `tests/defaults.unit.test.ts`      | `tests/unit/config/defaults.test.ts`                                | `git mv` + rename |

## Verification

```bash
pnpm test -- spx/16-core-config.enabler/
# 128 files, 1291 tests, 0 failures
```
