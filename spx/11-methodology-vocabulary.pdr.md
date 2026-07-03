# Methodology Vocabulary

spx uses one product-wide methodology vocabulary for Spec Tree and Outcome Engineering work. Durable map, node type, dependency order, decision reach, assertion, evidence, state, status, persistence, records, journals, snapshots, delivery, backend, materialization, consumer, and surface have product-wide meanings before lower specs, backends, delivery targets, or interaction boundaries expose them.

**Persistence.** Retained product artifacts and their backend addressing; a persisted artifact survives until removed or garbage-collected. Persistence has three semantic categories:

- **Records** — primary durable records carrying query, claim, status, and retention semantics, such as changes and sessions.
- **Journals** — primary append-only event histories.
- **Snapshots** — durable views derived from another source, such as a derived current-values file like `spx.status.json`.

**Delivery.** Ephemeral projection of a result to an external, user-facing surface — a terminal, a pull-request comment, a merge-request note, or an observability sink. A delivered result survives only in that external surface; delivery persists nothing for its own sake.

**Backend.** A concrete adapter implementing a persistence or delivery contract — a local filesystem-and-git store, a hosted artifact store with its platform API, or a future hosted service. Backend is the implementation-axis term, orthogonal to the persistence categories and to delivery.

## Rationale

Shared vocabulary lets backends, delivery targets, and surfaces map their private mechanics into one product model instead of redefining the model per storage format, projection target, command family, or agent workflow. Separating persistence, delivery, and backend keeps a retained artifact's category, its projection to an external surface, and the adapter implementing either from collapsing into one term. Reserving new methodology terms at the product-wide decision layer keeps lower nodes from treating local implementation labels as durable product semantics.

## Product properties

1. A methodology term has one owning product-wide definition before lower specs, backends, delivery targets, surfaces, or workflow notes use it as product vocabulary.
2. Persistence, delivery, and backend are orthogonal: a spec addresses a persistence category (records, journals, or snapshots) or a delivery separately from the backend implementing that contract, and a backend-owned status label maps into shared state, status, query, and selection semantics while staying backend-qualified when it belongs to one backend.
3. `surface` is a reserved product concept until filename grammar, kind registry, validation, and naming-schema versioning admit `.surface` as a valid node suffix.

## Verification

### Testing

- NEVER: a `.surface` node is created or treated as valid before filename grammar, kind registry, validation, and naming-schema versioning admit `.surface` as a valid node suffix ([compliance])

### Audit

- ALWAYS: specs, decisions, and coordination notes that introduce methodology terms use this product-wide vocabulary or change a product-wide decision before lower layers consume the new term ([audit])
- ALWAYS: a spec or decision addressing a persisted or delivered artifact distinguishes its persistence category (records, journals, or snapshots) or its delivery from the backend implementing that contract, and from the volatile node state its evidence derives ([audit])
- ALWAYS: backend and surface specs distinguish a backend-owned status label from backend-neutral product state, query predicates, and selection semantics, keeping the label backend-qualified when it belongs to one backend ([audit])
- NEVER: a backend, CLI command family, session command, hosted API, MCP interface, UI, delivery target, or node-local coordination note defines a conflicting methodology vocabulary for any term this decision reserves ([audit])
