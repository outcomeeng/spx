# Context Ingestion

PROVIDES deterministic spec-tree context ingestion for CLI consumers
SO THAT agents and developers requesting work context
CAN receive methodology identity, product root, ancestor specs, decisions, lower-index siblings, evidence links, and escape hatches without LLM inference

## Assertions

### Compliance

- ALWAYS: context ingestion reads tracked `spx/` files from the worktree-local product directory ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context targets accept canonical node paths, an optional leading `spx/`, trailing separators, and node-directory segments abbreviated to a unique sibling prefix; exact segment matches take precedence, while unknown, ambiguous, and artifact-file segments are rejected without selecting a node ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context manifests include configured methodology identity, product spec, ancestor specs, applicable decisions, lower-index sibling specs, co-located evidence links, and node-local PLAN or ISSUES files ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context ingestion exposes machine-readable manifest output for automation and human-readable output for terminal inspection when the requested output mode names each format ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: same-index siblings are listed as independent and higher-index siblings are listed without being read as constraints ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: configured methodology source and version are read from the top-level `methodology` config descriptor ([test](tests/context-ingestion.compliance.l1.test.ts))
- NEVER: select context by keyword search, semantic similarity, or LLM judgment ([audit])
