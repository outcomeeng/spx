# Context Ingestion

PROVIDES deterministic spec-tree context ingestion for CLI consumers
SO THAT agents and developers requesting work context
CAN receive the complete read set for one or more nodes — methodology identity, product root, bootstrap state, schema version, specs, decisions with citing-file provenance, coordination notes, and local overlays — and, on request, every read document's exact content and the foundation methodology in one machine-readable response without LLM inference

## Assertions

### Properties

- The projection is deterministic: identical tracked tree content produces byte-identical machine output across repeated runs, with and without document content ([test](tests/determinism.property.l1.test.ts))

### Compliance

- ALWAYS: context ingestion reads tracked `spx/` files from the worktree-local product directory ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: the machine manifest carries the manifest schema version and the snapshot-derived bootstrap flag ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context ingestion exposes machine-readable manifest output for automation and human-readable output for terminal inspection when the requested output mode names each format ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: configured methodology source and version are read from the top-level `methodology` config descriptor ([test](tests/context-ingestion.compliance.l1.test.ts))
- NEVER: select context by keyword search, semantic similarity, or LLM judgment ([audit])
