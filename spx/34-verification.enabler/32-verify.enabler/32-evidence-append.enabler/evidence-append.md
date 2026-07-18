# Evidence Append

PROVIDES evidence-payload validation, verification-type scope and finding validation, and caller-supplied idempotency for verification-run evidence operations
SO THAT a started verification run
CAN record inspected scope and typed findings exactly once per caller intent before terminal projection renders the run

## Assertions

### Compliance

- ALWAYS: scope evidence and finding evidence validate the evidence payload against the selected verification type and evidence kind before appending a journal event ([test](tests/verify-finding.compliance.l1.test.ts))
- ALWAYS: the `review` verification type validates finding payloads at the finding-evidence boundary so callers do not carry review-specific schema validation outside SPX ([test](tests/verify-finding.compliance.l1.test.ts))
- ALWAYS: `start` rejects an unsupported verification type before any started run exists, so an unregistered type cannot reach finding evidence and append an unvalidated finding ([test](../21-run-context.enabler/tests/verify-start.compliance.l1.test.ts))
- ALWAYS: scope evidence and finding evidence require an evidence payload source and reject reuse of the run input as an evidence payload channel ([test](tests/verify-payload.compliance.l1.test.ts))
- ALWAYS: repeated evidence operations with the same caller-supplied idempotency key return the existing journal sequence instead of duplicating scope or finding evidence ([test](tests/verify-idempotency.compliance.l1.test.ts))
- ALWAYS: scope evidence and finding evidence require a caller-supplied idempotency key for every evidence payload ([test](tests/verify-idempotency.compliance.l1.test.ts))
- ALWAYS: scope evidence and finding evidence reject a run carrying a terminal-completion event ([test](tests/verify-terminal-rejection.compliance.l1.test.ts))
- ALWAYS: an evidence append rejects when the run's recorded drive mode is spx-driven, so a caller holding the run token cannot add scope or finding evidence to a run spx opens, streams, and seals ([test](tests/verify-drive-mode.compliance.l1.test.ts))
