# SPX-MIGRATION: 16-core-config.enabler

## Origin

**From**: `specs/work/doing/capability-42_core-config/feature-21_default-config/story-11_config-schema/`
**Migration Date**: 2026-04-07

## Test Inventory

| Test File                          | Source                                                              | Operation                      |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| `tests/config-schema.unit.test.ts` | `specs/.../story-11_config-schema/tests/config-schema.unit.test.ts` | `git mv`                       |
| (removed)                          | `tests/unit/config/defaults.test.ts`                                | `git rm` — byte-identical pair |

The `tests/unit/config/defaults.test.ts` file was moved then identified as byte-identical to `config-schema.unit.test.ts` and removed. Coverage is preserved by the remaining file.

## Verification

```bash
pnpm exec vitest run "spx/16-core-config.enabler/"
```
