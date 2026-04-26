# Open Issues

## Legacy test file naming in tests/

`tests/session-store.unit.test.ts` and `tests/session-store.integration.test.ts` use legacy naming
(`*.unit.test.ts` / `*.integration.test.ts`) instead of the canonical model:
`<subject>.<evidence>.<level>.test.ts` (evidence ∈ {scenario, mapping, conformance, property, compliance},
level ∈ {l1, l2, l3}).

The 5 new assertions added for `created_at` and `agent_session_id` pre-fill on handoff reference
`session-store.unit.test.ts` — no tests for those behaviours exist in that file yet.

**Resolution:** Rename legacy files to canonical names and write the missing tests in new
canonical-named files. The assertion links in `session-store.md` must be updated to point to the
canonical files after they exist. See PLAN.md for the ordered steps.

**Blocking:** None. Existing behaviour is tested; the legacy names do not break CI.
