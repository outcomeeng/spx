# Evidence Append

PROVIDES append-payload validation, finding validation, and caller-supplied idempotency for `spx verify` evidence append operations
SO THAT a started verification run
CAN record inspected scope and typed findings exactly once per caller intent before terminal projection renders the run

## Assertions

### Compliance

- ALWAYS: `append-finding` validates the finding payload against the selected verification type before it appends a journal event ([test](tests/verify-finding.compliance.l1.test.ts))
- ALWAYS: `append-scope` and `append-finding` require `--payload <payload-source>` for appended evidence and reject reuse of the run input as an append payload channel ([test](tests/verify-payload.compliance.l1.test.ts))
- ALWAYS: repeated append commands with the same caller-supplied idempotency key return the existing journal sequence instead of duplicating scope or finding evidence ([test](tests/verify-idempotency.compliance.l1.test.ts))
- ALWAYS: `append-scope` and `append-finding` require a caller-supplied idempotency key for every append payload ([test](tests/verify-idempotency.compliance.l1.test.ts))
