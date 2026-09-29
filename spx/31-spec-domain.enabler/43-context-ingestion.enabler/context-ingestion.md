---
malleability: spec
---

# Context Ingestion

PROVIDES deterministic Product Tree discovery and context delivery for CLI consumers
SO THAT agents and developers requesting work context
CAN first locate relevant subtrees and then load only the product truth required for one or more accepted targets through a structural `list` manifest or source-faithful `show` entries, with optional methodology foundation

## Assertions

### Properties

- Equal tracked product content, shipped methodology content, options, and targets produce byte-identical output. ([test](tests/determinism.property.l1.test.ts))

### Scenarios

- `spx spec context list <targets...>` emits the versioned structural manifest, while `spx spec context show [targets...]` emits selected document content and path references without manifest fields. ([test](tests/context-ingestion.scenario.l1.test.ts))
- Targetless `show` supplies the complete product spec and a depth-bounded Product Tree map from which an agent can choose a target. ([test](tests/context-ingestion.scenario.l1.test.ts))
- Targeted `show` supplies Full target and ancestor context, Digest sibling and immediate-child awareness, applicable decisions, and the agreed path-only references. ([test](tests/context-ingestion.scenario.l1.test.ts))
- The manifest `list` emits carries its schema version, the bootstrap flag derived from the snapshot, and its labelled text beside the equivalent JSON. ([test](tests/context-ingestion.scenario.l1.test.ts))

### Mappings

- The manifest carries the configured methodology identity: each accepted version form resolves, an undeclared version renders the source alone, and an open migration renders the migration source beside it. ([test](tests/context-ingestion.mapping.l1.test.ts))

### Compliance

- Context ingestion resolves the complete projection before output and emits no partial result after any target, source, citation, or methodology failure. ([test](tests/context-ingestion.compliance.l1.test.ts), [test](tests/context-ingestion.compliance.l2.test.ts))
- Context selection is structural and never uses keyword search, semantic similarity, or LLM judgment. ([audit])
