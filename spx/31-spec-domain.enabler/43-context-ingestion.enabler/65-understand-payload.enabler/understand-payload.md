# Understand Payload

PROVIDES the Outcome Engineering foundation methodology as a manifest-sourced document set — core foundation bodies and an extended-resource catalog read from the installed methodology package's foundation-resource manifest, stamped with the configured methodology identity
SO THAT Skill-less agents consuming `spx/31-spec-domain.enabler/43-context-ingestion.enabler` output
CAN satisfy the foundation contract from one deterministic command without LLM inference, network access, or agent-side plugin traversal

## Assertions

### Scenarios

- Given the methodology payload is requested, when the manifest is built, then each core foundation document appears as a `methodology` read entry carrying its exact content, raw-byte digest, and byte count in every output mode, ordered after the `lifecycle-overlay` group ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the methodology payload is not requested, when the manifest is built, then no `methodology` or `methodology-catalog` entry appears and the installed methodology package is not read ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the methodology payload is requested and the installed methodology package's foundation-resource manifest is absent, unreadable, or carries an unrecognized schema version, when the manifest is built, then the whole command fails naming the resolved manifest path and the expected contract ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the manifest names a resource whose path or symbolic-link resolution escapes the installed package location, when the manifest is built, then the whole command fails naming the offending path and no bytes outside the package are embedded ([test](tests/understand-payload.scenario.l1.test.ts))

### Mappings

- Foundation-resource manifest catalog entries map to listed `methodology-catalog` entries carrying each resource's identity and no body ([test](tests/understand-payload.mapping.l1.test.ts))

### Compliance

- ALWAYS: foundation bodies and the extended-resource catalog come from the foundation-resource manifest of the installed methodology source named by the top-level `methodology` config descriptor, and every `methodology` entry is stamped with that configured identity — no embedded snapshot, keyword search, or network source participates ([test](tests/understand-payload.compliance.l1.test.ts), [test](tests/understand-payload.compliance.l2.test.ts))
