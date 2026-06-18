# Issues: Audit CLI

## Path filter validator delegation

Evidence: [src/commands/audit/lifecycle.ts](../../../src/commands/audit/lifecycle.ts) uses
`isAuditTargetFilter` to narrow target data read from audit run journals, while
[src/config/primitives/path-filter.ts](../../../src/config/primitives/path-filter.ts)
owns the canonical `PathFilterConfig` validator. The current guard and validator
agree on optional `include` and `exclude` string-array fields, so this is a drift
risk rather than a current behavior bug.

Impact: future changes to `PathFilterConfig` constraints could require updates in
two runtime predicates.

Resolution: when audit started-event parsing is next edited, delegate target-filter
narrowing to the canonical path-filter validator or move a shared predicate into
the config primitive so the constraints have one runtime source.

Source: [PR #200 review follow-up](https://github.com/outcomeeng/spx/pull/200#issuecomment-4746623354).
