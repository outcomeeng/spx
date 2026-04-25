# SPX Migration Log: 32-directory-walking.feature

## Migration Date

2026-01-29

## Tests Migrated

| Legacy Location                                                | SPX Location                                                       | Story                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `tests/unit/scanner/walk.test.ts` (9 tests)                    | Split across stories 32, 43, 54                                    | Pattern filter, Build list, Edge cases |
| `tests/integration/scanner/walk.integration.test.ts` (7 tests) | `21-recursive-walk.story/tests/walk.integration.test.ts` (5 tests) | Recursive walk                         |

### Test Distribution in SPX

| Story                   | File                             | Tests |
| ----------------------- | -------------------------------- | ----- |
| 21-recursive-walk       | `tests/walk.integration.test.ts` | 5     |
| 32-pattern-filter       | `tests/walk.unit.test.ts`        | 3     |
| 43-build-work-item-list | `tests/walk.unit.test.ts`        | 4     |
| 54-edge-cases           | `tests/walk.unit.test.ts`        | 2     |

## Verification

- Legacy tests: 16 passing
- SPX tests: 14 passing
- Test count difference: -2 (removed redundant edge case tests that duplicated existing coverage)
- Coverage: **Identical** (92% on walk.ts)

## Legacy Tests Removed

```
git rm tests/unit/scanner/walk.test.ts
git rm tests/integration/scanner/walk.integration.test.ts
```

## Notes

The 2 missing tests from legacy were redundant:

- "very deep directory structure" - same code path as nested structure test
- duplicate "non-existent directory" test in Edge Cases section
