# Context Ingestion

PROVIDES deterministic spec-tree context ingestion for CLI consumers
SO THAT agents and developers requesting work context
CAN receive product root, ancestor specs, decisions, lower-index siblings, evidence links, and escape hatches without LLM inference

## Assertions

### Compliance

- ALWAYS: context ingestion reads tracked `spx/` files from the worktree-local product directory ([review])
- ALWAYS: context manifests include product spec, ancestor specs, applicable decisions, lower-index sibling specs, co-located evidence links, and node-local PLAN or ISSUES files ([review])
- ALWAYS: context ingestion exposes machine-readable manifest output for automation and human-readable output for terminal inspection when the requested output mode names each format ([review])
- ALWAYS: same-index siblings are listed as independent and higher-index siblings are listed without being read as constraints ([review])
- NEVER: select context by keyword search, semantic similarity, or LLM judgment ([review])
