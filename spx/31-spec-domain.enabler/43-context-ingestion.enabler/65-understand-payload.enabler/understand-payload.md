# Understand Payload

PROVIDES the Outcome Engineering foundation methodology as a build-embedded document set — foundation bodies baked into the spx executable at build time, stamped with the configured methodology identity, plus a path catalog for extended references and templates
SO THAT Skill-less agents consuming `spx/31-spec-domain.enabler/43-context-ingestion.enabler` output
CAN satisfy the foundation contract from one deterministic command without plugin installation state, filesystem lookup, or network access

## Assertions

### Scenarios

- Given the methodology payload is requested, when the manifest is built, then each foundation document appears as a `methodology` read entry carrying its exact content, raw-byte digest, and byte count in every output mode, ordered after the `lifecycle-overlay` group ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the methodology payload is not requested, when the manifest is built, then no `methodology` entry appears ([test](tests/understand-payload.scenario.l1.test.ts))

### Mappings

- The extended methodology catalog maps each extended reference and authoring template to a listed `methodology-catalog` entry carrying its identity and no body ([test](tests/understand-payload.mapping.l1.test.ts))

### Compliance

- ALWAYS: foundation bodies come from the snapshot embedded in the executable at build time, stamped with the `methodology` config identity — no runtime plugin, filesystem, or network source participates ([test](tests/understand-payload.compliance.l1.test.ts))
