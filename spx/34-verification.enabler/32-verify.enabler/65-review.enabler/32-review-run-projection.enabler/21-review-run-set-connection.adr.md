# Review Run-Set Connection

The review verification type connects to the run-set projection through review-owned pure functions in `src/domains/verify/review-run-set.ts`: a finding-identity extractor mapping a validated review finding to the run-set identity-field record — verification type `review`, a normalized subject composed of the anchor side and path, the review-owned empty rule component, and the SPX finding summary as the fingerprint — and a reviewed-unit scope key composed of the anchor side and path. Payload-shaped adapters narrow journal payloads through the review payload validators and enter `readRunSetContext` as the typed extractor parameters `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/21-run-set-architecture.adr.md` prescribes. Review supplies no prior-context narrowing selector: prior review runs reach the producer whole.

## Rationale

The run-set architecture routes verification-type identity extraction through consumer-supplied typed parameters, so review's connection is a small module that owns the mapping and nothing else. It imports review payload contracts from the verify domain and identity-field contracts from the run-set domain — the dependency graph stays acyclic (`review-run-set → {verify, run-set}`, `run-set → verify`) where placing the mapping in either imported module would blur the substrate/type boundary or create a cycle.

The identity mapping keeps only what survives a merge period. The anchor side and path name where the defect lives across commits; the SPX finding summary names what the defect is, in the stable one-line metadata the review payload model requires of every finding. Line, position, provider record identity, URL, diff hunk, and comment body move with each re-publication of the same defect, and the finding disposition is receiver-action metadata — a defect re-filed as `BLOCKING` after being `DEBT` is the same finding, so disposition changes never fabricate a resolved-plus-new pair. Review has no rule vocabulary, so the identity record's rule component is a review-owned empty constant rather than a fabricated taxonomy. The reviewed-unit scope key excludes the unit's commit and coverage state for the same reason: coverage gaps compare which units a run reviewed, and every run records fresh commits and fresh coverage observations for the same units.

A prior-context narrowing selector is omitted rather than stubbed: review prior context has no partition vocabulary to filter by — the run set is already addressed by merge period, verification type, scope type, and run-set scope key — and the projection's selector parameter remains open for a review filter if one ever earns its place.

The payload-shaped adapters stay total over journal payloads: evidence reaching them has already passed the review validators at fold time, but a non-conforming payload maps to a whole-payload canonical identity instead of throwing, so the projection remains a total function of its inputs.

## Invariants

- Two validated review findings share an identity key exactly when their anchor side, path, and SPX finding summary are equal.
- A validated review finding's identity is invariant under changes to line, position, URL, provider identity, diff hunk, body, original commit, and finding disposition.
- Two reviewed units share a scope key exactly when their anchor side and path are equal.
- The payload-shaped adapters are deterministic and total: identical payloads produce identical identity records and scope keys, whether or not the payload conforms to the review schemas.

## Verification

### Testing

- ALWAYS: the finding-identity extractor composes the identity-field record from the source-owned review verification-type token, a normalized subject built from the anchor side and path, the review-owned empty rule constant, and the SPX finding summary as the fingerprint ([property])
- NEVER: line, position, URL, provider identity, diff hunk, comment body, original commit, or finding disposition participate in review finding identity ([property])
- NEVER: commit, coverage state, line, position, URL, or provider identity participate in the reviewed-unit scope key ([property])
- ALWAYS: payload-shaped adapters narrow through the review payload validators and map a non-conforming payload to a whole-payload canonical identity instead of throwing ([property])

### Audit

- ALWAYS: review run-set connection functions live in `src/domains/verify/review-run-set.ts` as pure functions with no filesystem, process, journal-storage, or command-layer imports, importing review payload contracts from the verify domain and identity-field contracts from the run-set domain ([audit])
- NEVER: review redefines merge-period identity, run-set addressing, or the finding-identity key function — the connection consumes the run-set domain's exports ([audit])
- ALWAYS: connection functions are exercised through constructed typed evidence and the domain's public generators; `vi.mock()`, `jest.mock()`, and module interception never stand in for payloads or the projection ([audit])
