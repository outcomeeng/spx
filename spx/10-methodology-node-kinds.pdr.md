# Methodology Node Kinds

Outcome Engineering durable maps express structural roles through valid node types. This product admits `.enabler` and `.outcome` as node types; substrate, capability, domain, interface, and surface are structural roles carried by product specs and decisions. Reserved role suffixes require canonical suffix readiness.

## Rationale

Node-kind rules keep structural containers, reusable capabilities, semantic domains, consumption contracts, concrete interaction boundaries, and product bets from being placed by directory habit. Keeping outcomes attached to the owner of the bet and enablers internally enabler-only preserves both product discovery structure and reusable capability purity.

## Product properties

1. The admitted `.enabler` and `.outcome` node types carry declared containment rules: enabler-role nodes contain only enabler-role children, and outcome nodes may contain enabler-role children or narrower outcome nodes that serve the bet.
2. Substrate, capability, domain, interface, and surface roles are named by specs and decisions; reserved role suffixes have no node-type containment rule without canonical suffix readiness.
3. Domain, interface, and surface roles own composition semantics through decomposition decisions: owning specs name single-owner enabler-role children and outcome nodes, with node-type validity governed by admitted suffixes.

## Verification

### Testing

- ALWAYS: node-kind validation admits `.enabler` and `.outcome` as node types ([compliance])
- ALWAYS: node-kind validation rejects `.substrate`, `.capability`, `.domain`, `.interface`, or `.surface` suffixes without canonical suffix readiness for that suffix ([compliance])

### Audit

- ALWAYS: decomposition assigns an outcome only where a behavior-change bet is owned, and assigns an enabler where assertions are stable reusable capability ([audit])
- ALWAYS: decomposition names the domain, interface, surface, or area role a node carries as the basis for role-specific ownership decisions ([audit])
- ALWAYS: decomposition keeps single-owner helpers inside the owning domain, interface, surface, or outcome rather than extracting a shared enabler without multiple consumers ([audit])
- NEVER: an outcome is placed under an enabler-role node to preserve a desired directory shape; either the parent represents a role that admits outcomes or the child is not an outcome ([audit])
