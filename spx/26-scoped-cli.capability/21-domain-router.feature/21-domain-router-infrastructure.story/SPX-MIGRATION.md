# SPX Migration Log: 21-domain-router-infrastructure.story

## Migration Date

2026-01-29

## Tests Migrated

| Legacy Location                          | SPX Location                         | Coverage Verified               |
| ---------------------------------------- | ------------------------------------ | ------------------------------- |
| `tests/unit/domains/registry.test.ts`    | `tests/domain-registry.unit.test.ts` | 100% src/domains/registry.ts    |
| `tests/unit/domains/spec-domain.test.ts` | `tests/spec-domain.unit.test.ts`     | 4.16% src/domains/spec/index.ts |

## Verification

- Legacy tests: 9 passing
- SPX tests: 9 passing
- Coverage: Identical (100% on registry.ts, 4.16% on spec/index.ts)

## Legacy Tests Removed

```
git rm tests/unit/domains/registry.test.ts
git rm tests/unit/domains/spec-domain.test.ts
```

## Notes

- Tests are identical in content
- Coverage verified by running both test sets with --coverage flag
- spec-domain.unit.test.ts tests the Domain interface properties, not the register() implementation (which is story-32's scope)
