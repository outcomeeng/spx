# Known Issues: 43-semantic.enabler

Tracked, not blocking.

## Missing scenario test for a skip-only REJECT

`21-semantic.adr.md` declares overall-verdict coherence as: `APPROVED` requires all gates `PASS`; `REJECT` requires at least one gate that is not `PASS` (a `FAIL` or `SKIPPED` gate). The implementation at `src/domains/audit/semantic.ts` already supports a coherent REJECT whose only non-passing gates are `SKIPPED` (no `FAIL`), and `semantic.md` carries the corresponding `### Mappings` case, but the scenario test set (`tests/semantic.scenario.l1.test.ts`, S1–S6) has no case exercising "overall `REJECT` with all gates `SKIPPED` and no `FAIL` → no incoherent-verdict defect."

Resolution (a test addition, out of scope for the decision-record migration that surfaced this): add a scenario — GIVEN a verdict with overall verdict `REJECT` and all gates `SKIPPED`, WHEN semantic validation runs, THEN no incoherent-verdict defect is reported (the missing-skipped-reason rule may still fire separately).
