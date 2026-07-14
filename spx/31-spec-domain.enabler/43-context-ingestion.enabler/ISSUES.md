# Known Issues: 43-context-ingestion.enabler

## Product-root coordination notes are not resolvable context targets

`resolveSpecContextTarget` (`src/domains/spec/context-target.ts`) classifies a target passed as a product-root coordination note — `spx/PLAN.md` or `spx/ISSUES.md` — as an `unknown-segment` failure rather than a root-artifact diagnostic. `nonSnapshotNodeArtifactOwnerId` matches only node-scoped `${node.id}/PLAN.md` and `${node.id}/ISSUES.md`, and product-root notes are absent from `snapshot.entries`, so a root-note target falls through to segment resolution and reports the note filename as an unknown segment.

Context ingestion loads product-root `PLAN.md`/`ISSUES.md` into every manifest, so root notes are ambient context but not resolvable targets — an asymmetry a user meets when they pass a root-note path they saw in a manifest.

This conforms to `spx/31-spec-domain.enabler/43-context-ingestion.enabler/21-context-target-resolution.adr.md`: each failure variant maps to an actionable diagnostic, and the decision names only product-spec and root-decision inputs as root artifacts — product-root coordination notes are not declared targets. The current behavior is an enhancement gap, not a spec violation.

**Decision needed:** whether `spx spec context spx/PLAN.md` returns the product-root artifact guidance (choose a node whose context includes the note) instead of an unknown-segment diagnostic. If adopted, it is a pure, snapshot-independent syntactic classification — a normalized target equal to a coordination-note filename with no separator — consistent with the decision's no-filesystem-access rule, and it needs a mapping assertion plus co-located test in this node before the code change.
