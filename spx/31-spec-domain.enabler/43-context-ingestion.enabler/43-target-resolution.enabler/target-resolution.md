# Target Resolution

PROVIDES canonical resolution of caller-supplied context target operands over the parsed spec-tree snapshot
SO THAT the read-set, citation, content, methodology, and composition projections under `spx/31-spec-domain.enabler/43-context-ingestion.enabler`
CAN operate on canonical full node paths with typed failures for unknown, ambiguous, and artifact-path inputs instead of re-deriving target identity

## Assertions

### Mappings

- Context target forms map to resolution outcomes as follows: canonical node paths, paths with an optional leading `spx/`, paths with trailing separators, and paths whose node-directory segments uniquely prefix one sibling resolve to the canonical full node path; unknown segments identify the unresolved input; ambiguous segments identify every matching sibling; node-owned artifact paths identify their owning node without selecting it; and product-root artifact paths — the product spec, root decisions, and product-root coordination notes — direct the caller to choose a node whose context includes the artifact ([test](tests/context-target-resolution.mapping.l1.test.ts))

### Compliance

- NEVER: target resolution selects the first ambiguous sibling, lets a matching descendant disambiguate an ambiguous ancestor, or treats a canonical segment as ambiguous when another valid sibling segment begins with it ([test](../tests/context-ingestion.compliance.l1.test.ts))
