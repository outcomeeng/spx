# SPX-MIGRATION: 46-claude.outcome

## Origin

**From**: `specs/work/doing/capability-33_claude-settings/`, `specs/work/doing/capability-32_claude-marketplace/`
**Migration Date**: 2026-04-07

## Test Inventory

| Test File                                                                                             | Source                                                                             | Operation         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| `21-settings-consolidation.outcome/21-discovery-parsing.outcome/tests/discovery.unit.test.ts`         | `specs/.../story-21_discovery-parsing/tests/unit/discovery.test.ts`                | `git mv` + rename |
| `21-settings-consolidation.outcome/21-discovery-parsing.outcome/tests/parser.unit.test.ts`            | `specs/.../story-21_discovery-parsing/tests/unit/parser.test.ts`                   | `git mv` + rename |
| `21-settings-consolidation.outcome/32-subsumption-merging.outcome/tests/merger.unit.test.ts`          | `specs/.../story-32_subsumption-merging/tests/unit/merger.test.ts`                 | `git mv` + rename |
| `21-settings-consolidation.outcome/32-subsumption-merging.outcome/tests/merger.property.test.ts`      | `specs/.../story-32_subsumption-merging/tests/unit/merger.properties.test.ts`      | `git mv` + rename |
| `21-settings-consolidation.outcome/32-subsumption-merging.outcome/tests/subsumption.unit.test.ts`     | `specs/.../story-32_subsumption-merging/tests/unit/subsumption.test.ts`            | `git mv` + rename |
| `21-settings-consolidation.outcome/32-subsumption-merging.outcome/tests/subsumption.property.test.ts` | `specs/.../story-32_subsumption-merging/tests/unit/subsumption.properties.test.ts` | `git mv` + rename |
| `21-settings-consolidation.outcome/43-cli-integration.outcome/tests/consolidate.integration.test.ts`  | `tests/integration/cli/claude-settings-consolidate.integration.test.ts`            | `git mv` + rename |

## Notes

- `32-marketplace.outcome` has no tests — spec declaration only
- `src/lib/claude/permissions/*` coverage preserved via moved tests

## Verification

```bash
pnpm test -- spx/46-claude.outcome/
# 128 files, 1291 tests, 0 failures
```
