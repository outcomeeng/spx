# Methodology Vocabulary

spx uses one product-wide methodology vocabulary for Spec Tree and Outcome Engineering work. Durable map, node type, dependency order, decision reach, assertion, evidence, state, status, materialization, backend, consumer, and surface have product-wide meanings before lower specs, backends, or interaction boundaries expose them.

## Rationale

Shared vocabulary lets backends and surfaces map their private mechanics into one product model instead of redefining the model per storage format, command family, or agent workflow. Reserving new methodology terms at the product-wide decision layer keeps lower nodes from treating local implementation labels as durable product semantics.

## Product properties

1. A methodology term has one owning product-wide definition before lower specs, backends, surfaces, or workflow notes use it as product vocabulary.
2. Backend-owned status labels map into shared state, status, query, and selection semantics while remaining backend-qualified when the label belongs to one backend.
3. `surface` is a reserved product concept until filename grammar, kind registry, validation, and naming-schema versioning admit `.surface` as a valid node suffix.

## Verification

### Audit

- ALWAYS: specs, decisions, and coordination notes that introduce methodology terms use this product-wide vocabulary or change a product-wide decision before lower layers consume the new term ([audit])
- ALWAYS: backend and surface specs distinguish backend-owned status labels from backend-neutral product states, query predicates, and selection semantics ([audit])
- NEVER: a backend, CLI command family, session command, hosted API, MCP interface, UI, or node-local coordination note defines a conflicting methodology vocabulary for durable map, node type, dependency order, decision reach, assertion, evidence, state, status, materialization, backend, consumer, or surface ([audit])
- NEVER: a `.surface` node is created or treated as valid before filename grammar, kind registry, validation, and naming-schema versioning admit `.surface` as a valid node suffix ([audit])
