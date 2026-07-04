# Methodology Structure

Outcome Engineering organizes a product's durable map into structural areas ordered by dependency reach: substrate, capabilities, domains, interfaces, and surfaces. Outcomes attach to the area or semantic owner where the product bet is made. This product records area roles in specs and decisions, and the area role is independent of the directory suffix. Area placement follows ownership of semantics: substrate owns primitive mechanics; capabilities own stable reusable product behavior; domains own bounded product semantics; interfaces own consumption contracts; surfaces own concrete interaction boundaries.

## Rationale

This structure gives products a stable architectural elevator from primitive mechanics to concrete consumption without collapsing reusable behavior, semantic ownership, consumption contracts, and presentation into one node. Separating area role from filename suffix lets a product apply the methodology through specs and decisions, with filename grammar admitting only its valid node types.

## Product properties

1. Every non-outcome top-level product concern has one area role: substrate, capability, domain, interface, or surface; persistence, backend, and delivery concerns are classified by their semantic ownership instead of forming extra area roles; an outcome attaches to the area or semantic owner where the product bet is made, and a product-root outcome may carry a bet owned by the product root.
2. Dependency order flows from substrate through capabilities, domains, interfaces, and surfaces; a consumer area consumes provider areas through contracts and does not move provider semantics upward because a surface exposes them.
3. Area role and node suffix are separate: specs and decisions name area roles under the root methodology PDRs, `.enabler` and `.outcome` are valid product node suffixes, `.substrate`, `.domain`, `.interface`, and `.surface` are reserved role suffixes governed by canonical suffix readiness, and capability remains a suffix-less methodology role.

## Verification

### Testing

- ALWAYS: structural validation treats numeric indices as dependency order and rejects any rule that treats an index range as area membership ([compliance])

### Audit

- ALWAYS: decomposition of top-level non-outcome product structure classifies each concern by substrate, capability, domain, interface, or surface semantics as the basis for choosing its owner or suffix, including persistence, backend, and delivery concerns; a product-root outcome is classified as an outcome owned by the product root ([audit])
- ALWAYS: structural decomposition reads suffix validity from `spx/10-methodology-node-kinds.pdr.md` and keeps area-role ownership separate from suffix validity ([audit])
- ALWAYS: a surface owns invocation, presentation, grammar, rendering, and interaction diagnostics, and reusable product semantics stay with the provider capability, domain, or interface owner ([audit])
- ALWAYS: an interface owns a consumption contract that adapts domain behavior for one or more surfaces without owning concrete surface rendering ([audit])
- NEVER: node suffix, directory clustering, current source-file location, or roadmap order is used as evidence that a concern belongs to an area; area ownership follows product semantics and dependency evidence ([audit])
