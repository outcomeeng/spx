# Agent Capability Lifecycle

SPX treats product configuration as the canonical declaration of one exact Spec Tree methodology version, explicitly enabled coding agents, capability sources, and exact Outcome Engineering package versions for every product carrying a tracked `spx/` tree; a product without that tree may use `installed` only as bootstrap intent, never as durable methodology identity. `spx update` changes only the SPX executable, `spx agent config status|apply|update` observes or reconciles capabilities without changing methodology identity, and only `spx methodology version migrate <target>` changes methodology identity through a target-methodology-owned migration. SPX isolates each migration, preserves interrupted work for resume, and accepts completion only when target-methodology verification bound to the migration result and the SPX execution envelope agree.

## Rationale

Separating executable updates, methodology-compatible capability reconciliation, and methodology migration prevents routine maintenance from silently changing product truth. Exact declarations make agent environments reproducible while a target-methodology-owned migration keeps semantic rewriting with the methodology that defines the target state.

## Product properties

1. A coding agent participates in harness environment management only when product configuration explicitly enables it and availability detection finds it; detection never opts an agent in.
2. Capability status is read-only, apply reproduces committed versions, and update advances and persists only package versions compatible with the declared methodology.
3. Methodology migration is isolated and resumable, with target-methodology verification governing semantic correctness and SPX governing launch, journaling, state preservation, and completion-envelope correctness.

## Verification

### Testing

- ALWAYS: every resolved product configuration for a product carrying a tracked `spx/` tree declares an exact `methodology.version`, exact Outcome Engineering package versions, enabled coding agents, and capability sources in an equivalent shape across `spx.config.yaml`, `spx.config.toml`, and `spx.config.json`; a product without that tree may resolve `installed` only as bootstrap intent, and methodology readiness fails if the sentinel remains when the tree exists ([conformance])
- ALWAYS: coding-agent participation maps to enabled and available together; every other enabled/available combination maps to not participating ([mapping])
- ALWAYS: `spx update` updates only a recognized package-manager-owned SPX executable, while linked, local, or ambiguous installations remain unchanged and report installation provenance and remediation ([mapping])
- ALWAYS: `spx agent config status` reports committed intent against installed and projected capability state without filesystem mutation or required network access ([compliance])
- ALWAYS: `spx agent config apply` deterministically reproduces the exact committed capability versions and native projections, and repeated application of the same resolved configuration produces the same state ([property])
- ALWAYS: `spx agent config update` selects only capability versions compatible with the declared methodology, persists the selected exact versions, applies their native projections, and leaves methodology identity unchanged ([compliance])
- ALWAYS: capability apply and update require the newest SPX release compatible with the declared methodology; interactive execution offers an installation-owner-supported SPX update before aborting, while noninteractive execution fails without updating SPX ([mapping])
- NEVER: SPX mutates user-scope coding-agent configuration; diagnostics classify detected Outcome Engineering user-scope entries as degraded hidden input and provide remediation ([compliance])
- ALWAYS: `spx methodology version show` reports the declared methodology version, managed instruction markers, and installed package compatibility without mutation or required network access ([compliance])
- NEVER: routine SPX or capability updates change `methodology.version`, rewrite product truth under `spx/`, or advance managed instruction markers to a different methodology ([compliance])
- ALWAYS: an interrupted methodology migration preserves its branch, working changes, append-only run journal, and resumable coding-agent session while remaining incomplete ([compliance])
- ALWAYS: methodology migration completion conforms to a successful sealed target-methodology verification run whose target methodology, branch and head changeset, resolved configuration identity, and migration coding-agent session identity match the migration result, plus the target version in product configuration, matching managed instruction markers, a compatible installed Spec Tree package, and closure of that migration coding-agent session ([conformance])

### Audit

- ALWAYS: the target methodology owns semantic migration decisions while SPX owns isolation, launch, journaling, resumability, and completion-envelope validation ([audit])
- ALWAYS: SPX consumes coding-agent-native capability packages from declared sources rather than translating one coding agent's capability artifacts into another agent's native package format ([audit])
- NEVER: SPX guarantees reconciled behavior when a coding-agent platform violates product-over-user configuration precedence ([audit])
