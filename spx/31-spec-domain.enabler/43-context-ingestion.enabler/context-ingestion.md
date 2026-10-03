---
malleability: spec
---

# Context Ingestion

PROVIDES deterministic Product Tree discovery and context delivery for CLI consumers
SO THAT agents and developers requesting work context
CAN first locate relevant subtrees and then load only the product truth required for one or more accepted targets through a structural `list` manifest or source-faithful `show` entries, with optional methodology foundation

## Assertions

- For each probed target in spx's own tree, `show` and `list` deliver the context `/contextualize` loads for the same target, every difference is one a selection or projection assertion of this node or its children declares, and two runs produce identical output ([probe](probes/context-fidelity/probe.md))

### Properties

- Equal tracked product content, shipped methodology content, options, and targets produce byte-identical output. ([test](tests/determinism.property.l1.test.ts))

### Scenarios

- Given a Product Tree, when `spx spec context list <targets...>` and `spx spec context show [targets...]` run, then `list` emits the versioned structural manifest, while `show` emits selected document content and path references without manifest fields ([test](tests/context-ingestion.scenario.l1.test.ts))
- Given no target, when `spx spec context show` runs, then it supplies the complete product spec and a depth-bounded Product Tree map from which an agent can choose a target ([test](tests/context-ingestion.scenario.l1.test.ts))
- Given one or more targets, when `spx spec context show` runs, then it supplies Full target and ancestor context, Digest sibling and immediate-child awareness, applicable decisions, and the agreed path-only references ([test](tests/context-ingestion.scenario.l1.test.ts))
- Given one or more targets, when `spx spec context list` runs, then the manifest it emits carries its schema version, the bootstrap flag derived from the snapshot, and its labelled text beside the equivalent JSON ([test](tests/context-ingestion.scenario.l1.test.ts))

### Mappings

- The manifest carries the configured methodology identity: each accepted version form resolves, an undeclared version renders the source alone, and an open migration renders the migration source beside it. ([test](tests/context-ingestion.mapping.l1.test.ts))

### Compliance

- ALWAYS: context ingestion resolves the complete projection before output and emits no partial result after any target, source, citation, or methodology failure ([test](tests/context-ingestion.compliance.l1.test.ts), [test](tests/context-ingestion.compliance.l2.test.ts))
- ALWAYS: context selection is structural and never uses keyword search, semantic similarity, or LLM judgment ([audit])
