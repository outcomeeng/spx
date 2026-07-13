# Parsing result contract

Settings-file parsing returns a source-owned discriminated result for every input path. A successful result carries the parsed settings and typed permission records; an error result carries the input path and an error diagnostic. Multi-file parsing preserves input order and retains both variants so one malformed file cannot abort or disappear from the scan.

## Rationale

One result per path makes partial success explicit and keeps the complete scan observable. Returning `null` or omitting a failed path erases the distinction between malformed input, unreadable input, and settings without permissions. A source-owned union also gives consumers and tests one exhaustive contract for successful records and errors.

## Invariants

- The result count equals the input-path count.
- Result order equals input-path order.
- Every successful permission record traces to the result's input path and parsed settings.

## Verification

### Testing

- ALWAYS: parsing any sequence of settings-file paths yields exactly one result per input path in the same order ([property])
- ALWAYS: every valid permission entry maps to one typed permission record carrying its raw value, type, scope, and category ([mapping])
- ALWAYS: malformed JSON yields an error result for its path while later paths are still parsed ([scenario])

### Audit

- ALWAYS: the success and error variants, discriminant values, and diagnostic shape are owned by the production permissions module ([audit])
- ALWAYS: filesystem evidence uses real callback-scoped temporary directories composed on `testing/harnesses/with-temp-dir.ts` ([audit])
- NEVER: test files or test infrastructure redeclare the parsing-result discriminants, permission-category values, or error shape ([audit])
- NEVER: module interception or filesystem replacement substitutes for the production parsing boundary ([audit])
