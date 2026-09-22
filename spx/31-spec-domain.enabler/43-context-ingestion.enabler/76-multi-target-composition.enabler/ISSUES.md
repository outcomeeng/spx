# Open Issues

## The invalidation assertion declares caller behavior under a test tag

The Compliance assertion `A changed covered entry invalidates every declaration whose projection contains it; after compaction the caller supplies no loaded declaration and requests every target the continuing work requires` carries a `[test]` link, and neither clause is behavior spx performs. [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.adr.md`](../32-context-manifest-schema.adr.md) assigns both to the caller: the declarations persist no state, and a caller drops them after compaction or after any covered entry changes.

**Evidence:** the local review of this branch at head `4bb2d5854`, run token `2026-09-22_20-47-59-884-6cc6b61b4e41`, finding `F-002`, severity debt. The linked evidence at [tests/multi-target-composition.compliance.l1.test.ts](tests/multi-target-composition.compliance.l1.test.ts) asserts that after a covered entry changes, a run still declaring that target loaded returns an empty projection — production does not invalidate the declaration.

**Impact:** the node declares as product behavior an obligation the decision record places on the caller, so the linked test cannot fail for the clause it is linked to.

**Settlement condition:** the assertion states only what spx does — the declarations persist nothing across invocations — under evidence that can fail, and the caller's obligation is declared separately with the verification type its verdict admits. The same correction applies to the parallel clause at [`spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/understand-payload.md`](../65-understand-payload.enabler/understand-payload.md), whose "after compaction the agent requests `--methodology` again" conjunct is likewise the agent's behavior rather than spx's.
