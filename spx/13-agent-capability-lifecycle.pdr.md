---
tier: prototype
---

# Agent Capability Lifecycle

SPX treats product configuration as the canonical declaration of the methodology version a product targets, the methodology version it migrates from while a migration is open, explicitly enabled coding agents, capability sources, and exact Outcome Engineering package versions. A methodology version, a capability package version, and the SPX executable version are independent axes; no declaration of one names or resolves another. `spx update` changes only the SPX executable, `spx agent config status|apply|update` observes or reconciles capabilities without changing methodology identity, and only `spx methodology version migrate <target>` changes methodology identity through a target-methodology-owned migration. SPX isolates each migration, preserves interrupted work for resume, and accepts completion only when target-methodology verification bound to the migration result and the SPX execution envelope agree.

## Rationale

Separating executable updates, capability reconciliation, and methodology migration prevents routine maintenance from silently changing product truth. Exact declarations make agent environments reproducible while a target-methodology-owned migration keeps semantic rewriting with the methodology that defines the target state.

A declared migration source makes a mixed-version tree a governed state rather than an incomplete one. A product that has adopted a new methodology version still holds artifacts written against the previous one, and rewriting the whole tree in one change is neither reviewable nor safe. Declaring the source version lets SPX keep serving both, while a coding agent upgrades each artifact it touches to the target version, so the tree converges through ordinary work instead of a single sweep. The migration closes when no artifact remains at the source version.

Which capability package version a methodology version needs is the publisher's fact, declared by the published artifact through a supported-version range. SPX consumes that declaration where one exists and otherwise records the choice made at materialization, so no consumer infers compatibility from version-string similarity across two unrelated numbering schemes.

## Product properties

1. A coding agent participates in harness environment management only when product configuration explicitly enables it and availability detection finds it; detection never opts an agent in.
2. Capability status is read-only, apply reproduces committed versions, and update advances and persists only package versions whose declared supported-methodology range contains the product's declared methodology version.
3. A product declares one target methodology version and, while a migration is open, the version it migrates from; artifacts at either version are valid, and a coding agent upgrades every artifact it touches to the target version.
4. Methodology migration is isolated and resumable, with target-methodology verification governing semantic correctness and SPX governing launch, journaling, state preservation, and completion-envelope correctness.

## Verification

### Testing

- ALWAYS: every resolved product configuration for a product carrying a tracked `spx/` tree declares an exact `methodology.version`, an optional `methodology.migratingFrom`, exact Outcome Engineering package versions, enabled coding agents, and capability sources in an equivalent shape across `spx.config.yaml`, `spx.config.toml`, and `spx.config.json` ([conformance])
- ALWAYS: coding-agent participation maps to enabled and available together; every other enabled/available combination maps to not participating ([mapping])
- ALWAYS: `spx update` updates only a recognized package-manager-owned SPX executable, while linked, local, or ambiguous installations remain unchanged and report installation provenance and remediation ([mapping])
- ALWAYS: `spx agent config status` reports committed intent against installed and projected capability state without filesystem mutation or required network access ([compliance])
- ALWAYS: `spx agent config apply` deterministically reproduces the exact committed capability versions and native projections, and repeated application of the same resolved configuration produces the same state ([property])
- ALWAYS: `spx agent config update` selects only capability versions whose declared supported-methodology range contains the product's declared methodology version, persists the selected exact versions, applies their native projections, and leaves methodology identity unchanged ([compliance])
- ALWAYS: capability apply and update require the newest SPX release whose declared supported-methodology range contains the product's declared methodology version; interactive execution offers an installation-owner-supported SPX update before aborting, while noninteractive execution fails without updating SPX ([mapping])
- ALWAYS: a published Outcome Engineering artifact declares the methodology-version range it supports alongside its own version, and a consumer selecting that artifact for a methodology version reads the range rather than comparing the two version strings ([conformance])
- NEVER: any consumer treats a methodology version, a capability package version, or the SPX executable version as equal to, ordered against, or resolvable from another of the three ([compliance])
- NEVER: SPX mutates user-scope coding-agent configuration; diagnostics classify detected Outcome Engineering user-scope entries as degraded hidden input and provide remediation ([compliance])
- ALWAYS: `spx methodology version show` reports the declared methodology version, the declared migration source when one is open, and managed instruction markers without mutation or required network access ([compliance])
- NEVER: routine SPX or capability updates change `methodology.version` or `methodology.migratingFrom`, rewrite product truth under `spx/`, or advance managed instruction markers to a different methodology ([compliance])
- ALWAYS: an interrupted methodology migration preserves its branch, working changes, append-only run journal, and resumable coding-agent session while remaining incomplete ([compliance])
- ALWAYS: while `methodology.migratingFrom` is declared, an artifact written against either the target version or the migration source resolves without failing on version shape alone ([compliance])
- ALWAYS: a coding agent that changes an artifact declared at the migration source leaves it conforming to the target methodology version ([audit])
- ALWAYS: methodology migration completion conforms to a successful sealed target-methodology verification run whose target methodology, branch and head changeset, resolved configuration identity, and migration coding-agent session identity match the migration result, plus the target version in product configuration, matching managed instruction markers, an absent `methodology.migratingFrom`, and closure of that migration coding-agent session ([conformance])

### Audit

- ALWAYS: the target methodology owns semantic migration decisions while SPX owns isolation, launch, journaling, resumability, and completion-envelope validation ([audit])
- ALWAYS: SPX consumes coding-agent-native capability packages from declared sources rather than translating one coding agent's capability artifacts into another agent's native package format ([audit])
- NEVER: SPX guarantees reconciled behavior when a coding-agent platform violates product-over-user configuration precedence ([audit])
