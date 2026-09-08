# Understand Payload

PROVIDES the Outcome Engineering foundation as a manifest-sourced document set — the core foundation body and an extended-resource catalog read from the foundation-resource manifest of spx's shipped methodology tree for the declared methodology line and the coding agent in scope, stamped with the configured methodology identity
SO THAT coding agents loading context through `spx/31-spec-domain.enabler/43-context-ingestion.enabler`
CAN receive the foundation and the product context bundle in one deterministic payload, once, at the methodology version the product declares, in place of loading a skill file and walking the tree by hand

## Assertions

- `--coding-agent <name>` names the coding agent in scope; absent the option, the agent is the invoking coding agent when spx can identify it, else the command fails naming the coding agents spx ships trees for
- While `methodology.migratingFrom` is declared, the payload serves the declared version's tree and reports the migration source alongside the declared version
- Where the shipped tree's `source.json` records `provides`, the payload fails when that value differs from the declared `methodology.version`, and fails when a declared `methodology.migratingFrom` falls outside the recorded `supports` range

### Scenarios

- Given the methodology payload is requested, when the manifest is built, then the tree read is `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` under spx's package root, where `MAJOR.MINOR` is the line of the declared `methodology.version` and the coding agent is the one in scope, and when spx ships no tree for that line the whole command fails naming the declared version and the lines spx ships ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the methodology payload is requested, when the manifest is built, then each core foundation document appears as a `methodology` read entry carrying its exact content, raw-byte digest, and byte count in every output mode, ordered after the `lifecycle-overlay` group ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the methodology payload is not requested, when the manifest is built, then no `methodology` or `methodology-catalog` entry appears and the shipped methodology tree is not read ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the methodology payload is requested and the selected tree's foundation-resource manifest is absent, unreadable, or carries an unrecognized schema version, when the manifest is built, then the whole command fails naming the resolved manifest path and the expected contract ([test](tests/understand-payload.scenario.l1.test.ts))
- Given the manifest names a resource whose path or symbolic-link resolution escapes the selected tree, when the manifest is built, then the whole command fails naming the offending path and no bytes outside the tree are embedded ([test](tests/understand-payload.scenario.l1.test.ts))

### Mappings

- Foundation-resource manifest catalog entries map to listed `methodology-catalog` entries carrying each resource's identity and no body ([test](tests/understand-payload.mapping.l1.test.ts))

### Compliance

- ALWAYS: foundation bodies and the extended-resource catalog come from the foundation-resource manifest of spx's shipped methodology tree for the declared methodology line and the coding agent in scope, and every `methodology` entry is stamped with the identity the top-level `methodology` config descriptor resolves — no installed plugin, plugin cache, consumer-side copy, keyword search, or network source participates ([test](tests/understand-payload.compliance.l1.test.ts), [test](tests/understand-payload.compliance.l2.test.ts))
