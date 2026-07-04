# Review Payload

Review verification runs store a platform-neutral review envelope and anchored review comments. GitHub formal reviews are an external shape SPX can ingest or project, while the product model stays provider-neutral: review envelope data records submission identity and state, and comment data records anchored human-readable findings.

## Rationale

Formal review systems separate the review submission from inline comments. Preserving that shape lets SPX persist review evidence once and project it to GitHub, local output, or other delivery surfaces without making one provider's API the product model.

## Product properties

1. A review envelope records provider identity when present, actor, state, body, submitted time, commit identity, and URL.
2. A review comment records provider identity when present, path, line or position, side, original commit identity, diff hunk, body, URL, and SPX finding metadata when the comment is a finding.
3. Reviewed scope units and review findings remain separate evidence: a reviewed unit can be clean, and a finding anchors to the reviewed unit it concerns.

## Verification

### Testing

- ALWAYS: review finding validation accepts platform-neutral review comment payloads carrying GitHub-shaped anchors without requiring GitHub-specific command vocabulary ([conformance])
- ALWAYS: review projection maps review envelopes and review comments into separate structured fields ([mapping])
- ALWAYS: clean reviewed units can be recorded through scope evidence without inventing a finding ([compliance])
- NEVER: the review payload schema makes GitHub provider fields mandatory for non-GitHub backends or local runs ([property])

### Audit

- ALWAYS: review payload specifications keep platform provider identity optional and distinguish provider projection from the SPX product model ([audit])
