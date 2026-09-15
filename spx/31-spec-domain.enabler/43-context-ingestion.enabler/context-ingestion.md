# Context Ingestion

PROVIDES deterministic Product Tree discovery and context delivery for CLI consumers
SO THAT agents and developers requesting work context
CAN first locate relevant subtrees and then load only the product truth required for one or more accepted targets through a structural `list` manifest or source-faithful `show` entries, with optional methodology foundation and caller-declared reuse inside one conversation window

## Assertions

- Equal tracked product content, shipped methodology content, options, and targets produce byte-identical output.
- `spx spec context list <targets...>` emits the versioned structural manifest, while `spx spec context show [targets...]` emits selected document content and path references without manifest fields.
- Targetless `show` supplies the complete product spec and a depth-bounded Product Tree map from which an agent can choose a target.
- Targeted `show` supplies Full target and ancestor context, Digest sibling and immediate-child awareness, applicable decisions, and the agreed path-only references.
- Context ingestion resolves the complete projection before output and emits no partial result after any target, source, citation, or methodology failure.
- Context selection is structural and never uses keyword search, semantic similarity, or LLM judgment.
