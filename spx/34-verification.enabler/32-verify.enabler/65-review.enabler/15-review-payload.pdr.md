# Review Payload

Review verification runs store a platform-neutral review envelope and anchored review comments. GitHub formal reviews are an external shape SPX can ingest or project, while the product model stays provider-neutral: review terminal metadata records submission identity and state, and comment data records anchored human-readable findings. A review finding's SPX metadata carries one disposition, `BLOCKING`, `DEBT`, `FILED`, or `STALE`: `BLOCKING` and `DEBT` name a defect the changeset introduces and are the only dispositions the envelope-derived terminal status reads; `FILED` names a defect the changeset does not introduce — the owning node's `ISSUES.md` entry exists at the scope's base ref, or the defect is observable at the base ref — and the finding names both the entry and the base-ref evidence; `STALE` names an `ISSUES.md` entry whose defect the Verifier can no longer observe, carries no defect, names the entry and the evidence of absence, and never enters the rollup.

## Rationale

Formal review systems separate the review submission from inline comments. Preserving that shape lets SPX persist review evidence once and project it to GitHub, local output, or other delivery surfaces without making one provider's API the product model.

The disposition is one axis, extended rather than paired with a second field, so the projection reads one value per finding. `DEBT` names a defect this changeset introduces and the merge accepts as owed; `FILED` names a defect outside the changeset already owed elsewhere, so a Reviewer records it without re-raising it and without rejecting the run; `STALE` records that an owed defect is gone so the Author removes the entry through the coordination note's own workflow. A defect the changeset introduces keeps `BLOCKING` or `DEBT` whatever `ISSUES.md` says, because the entry reference and base-ref evidence a `FILED` finding carries are what place the defect outside the changeset.

## Product properties

1. Review `finish` records the review envelope as verification-type terminal metadata with provider identity when present, actor, state, body, submitted time, commit identity, and URL when present. Review states `approved` and `changes_requested` derive terminal status when evidence does not already determine it; review state `commented` and omitted terminal metadata do not derive terminal status, so the supplied terminal status is preserved unless finding or scope evidence creates a conflict. Review evidence determines rejection only through a finding whose disposition is `BLOCKING` or `DEBT` or a reviewed unit whose coverage state is a finding; a run whose findings are all `FILED` or `STALE` takes the envelope's status, with those findings retained under their own disposition.
2. A review comment records provider identity when present, path, line or position, side, original commit identity, diff hunk, URL when present, body, and SPX finding metadata when the comment is a finding: the disposition (`BLOCKING`, `DEBT`, `FILED`, or `STALE`) and summary, plus the `ISSUES.md` entry reference — the note's path and the entry's heading — for a `FILED` or `STALE` finding and base-ref evidence, a location observable at the scope's base ref, for a `FILED` finding.
3. Reviewed scope units and review findings remain separate evidence: a reviewed scope unit records provider identity when present, path, optional line or position range, side, commit identity, coverage state, and optional URL; a reviewed unit can be clean, and a finding anchors to the reviewed unit it concerns.

## Verification

### Testing

- ALWAYS: review terminal metadata validation accepts platform-neutral review envelope payloads with or without provider identity and without requiring GitHub-specific command vocabulary ([conformance])
- ALWAYS: review finding validation accepts platform-neutral review comment payloads carrying GitHub-shaped anchors without requiring GitHub-specific command vocabulary ([conformance])
- ALWAYS: a `FILED` or `STALE` review finding without its entry reference, or a `FILED` finding without base-ref evidence, is rejected before any journal event appends, naming the missing field path ([compliance])
- ALWAYS: review scope validation accepts platform-neutral reviewed-unit payloads carrying GitHub-shaped anchors without requiring GitHub-specific command vocabulary ([conformance])
- ALWAYS: review projection maps review envelopes and review comments into separate structured fields ([mapping])
- ALWAYS: review evidence determines rejection only through a finding whose disposition is `BLOCKING` or `DEBT` or a reviewed unit in a finding coverage state; a run whose findings are all `FILED` or `STALE` takes the envelope's status ([mapping])
- ALWAYS: clean reviewed units can be recorded through scope evidence without inventing a finding ([compliance])
- NEVER: the review payload schema makes GitHub provider fields mandatory for non-GitHub backends or local runs ([property])

### Audit

- ALWAYS: review payload specifications keep platform provider identity optional and distinguish provider projection from the SPX product model ([audit])
