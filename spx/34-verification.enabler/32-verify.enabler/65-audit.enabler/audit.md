# Audit

PROVIDES the audit verification-type boundary for nestable audit coverage and unit-scoped findings
SO THAT audit run drivers, leaf skill producers, merge workflows, and renderers
CAN record audit evidence under `--verification-type audit` without adding audit subtype commands

## Assertions

### Mappings

- A sealed audit run maps to the claim entry it yields: a run over a rule slug yields the node's `audit` entry for that slug, each unit of audit kind `tests` or `eval-evidence` over an implementation-malleable node with linked evidence of that kind yields the node's `evidence` entry of kind `test` or `eval`, so a run carrying units of both kinds yields both entries, and over any other node yields no entry, with the run's Verifier as actor and its run id as run ([test](tests/audit-claim-entry.mapping.l1.test.ts))

### Compliance

- ALWAYS: `audit` is the public verification type for every audit run; audit class and audit kind stay inside payloads ([test](tests/audit-command-surface.compliance.l1.test.ts))
- NEVER: audit payload handling introduces `spx audit` or audit subtype commands under `spx verification run` ([test](tests/audit-command-surface.compliance.l1.test.ts))
- ALWAYS: one audit run has one sequential run driver; leaf skill producers supply structured audit evidence through that driver and do not write independent run journals ([audit])
