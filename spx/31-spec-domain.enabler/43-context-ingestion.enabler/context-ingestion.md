# Context Ingestion

PROVIDES deterministic spec-tree context ingestion for CLI consumers
SO THAT agents and developers requesting work context
CAN receive methodology identity, product root, ancestor specs, decisions, lower-index siblings, evidence links, and escape hatches without LLM inference

## Assertions

### Mappings

- Context target forms map to resolution outcomes as follows: canonical node paths, paths with an optional leading `spx/`, paths with trailing separators, and paths whose node-directory segments uniquely prefix one sibling resolve to the canonical full node path; unknown segments identify the unresolved input; ambiguous segments identify every matching sibling; node-owned artifact paths identify their owning node without selecting it; and product-root decision paths direct the caller to choose a node whose context includes the decision ([test](tests/context-target-resolution.mapping.l1.test.ts))

### Compliance

- ALWAYS: context ingestion reads tracked `spx/` files from the worktree-local product directory ([test](tests/context-ingestion.compliance.l1.test.ts))
- NEVER: target resolution selects the first ambiguous sibling, lets a matching descendant disambiguate an ambiguous ancestor, or treats a canonical segment as ambiguous when another valid sibling segment begins with it ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context manifests include configured methodology identity, product spec, ancestor specs, applicable decisions, lower-index sibling specs, co-located evidence links, and node-local PLAN or ISSUES files ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context ingestion exposes machine-readable manifest output for automation and human-readable output for terminal inspection when the requested output mode names each format ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: same-index siblings are listed as independent and higher-index siblings are listed without being read as constraints ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: configured methodology source and version are read from the top-level `methodology` config descriptor ([test](tests/context-ingestion.compliance.l1.test.ts))
- NEVER: select context by keyword search, semantic similarity, or LLM judgment ([audit])
