# Agent Environment Descriptor

The `agentEnvironment` config descriptor lives at `src/domains/agent-environment/config.ts`, registers with the production config registry per `spx/16-config.enabler/21-descriptor-registration.adr.md`, and resolves three parent-owned subsections — `instructions`, `runtimes`, and `pluginBootstrap` — with explicit source-owned runtime ids for Codex and Claude Code that the instruction-reconciliation, runtime-configuration, and plugin-bootstrap children import when selecting runtime-specific serializers, instruction targets, or bootstrap adapters. The descriptor models shared inputs and target runtimes only: it writes no files, installs no plugins, and encodes no runtime-specific serializers, and it rejects unknown fields and malformed entry shapes rather than ignoring them, because it is the shared API those children consume.

## Rationale

A single parent descriptor matches the product truth that agent environment management spans `AGENTS.md`, runtime configuration, marketplaces, plugins, and skills — one `agentEnvironment` section gives downstream children a typed shared input while their concrete file writes, plugin status classifications (installed, missing, stale, failed), dry-run output, offline behavior, and hermetic state paths stay child-owned — the descriptor only validates configured intent. Strict rejection of unknown fields protects operators from silent typos in a section multiple children consume; accepting misspellings would make downstream behavior appear successful while dropping configured intent.

Rejected: separate config sections for instructions, runtimes, and bootstrap (the product owns them as one agent environment, and splitting forces children to coordinate runtime vocabulary by convention rather than by type); child-owned descriptor sections only (downstream children need a stable parent input before their implementation details settle); and runtime-specific config file paths in this descriptor (path semantics, dry-run output, and serializer behavior belong to the runtime-configuration child, which models the shared runtime identity and configured entries only).

## Invariants

- Descriptor validation has no filesystem, process, network, or runtime side effects.
- For a resolved `agentEnvironment` section, every instruction, marketplace, plugin, and skill entry references a registered runtime id.
- Instruction file paths are unique within `instructions.files`.
- Instruction file target runtime lists are non-empty and do not repeat runtimes.
- Marketplace, plugin, and skill names are unique within each runtime.
- Plugin entries that name a marketplace reference a configured marketplace for the same runtime.
- Child reconcilers consume the descriptor's resolved values; they do not parse raw `spx.config.*` content.
- The instruction-reconciliation child validates concrete instruction paths before writing files, and the plugin-bootstrap child validates marketplace source formats before resolving external inputs.
- Marketplace `source` values and skill `source` values are different semantic fields even though they share the same config field name.
- An omitted `instructions.files` keeps the default `AGENTS.md`; an explicit empty list disables instruction-file management.
- Instruction targets may name disabled runtimes — descriptor validation requires only registered runtime ids, not enabled ones; runtime enablement governs downstream participation.
- Adding a runtime does not make it an implicit instruction target; each instruction file's target runtimes are explicit.

## Verification

### Testing

- ALWAYS: the descriptor resolves `instructions`, `runtimes`, and `pluginBootstrap` defaults through the static config registry ([compliance])
- ALWAYS: instruction targets, marketplace entries, plugin entries, and skill entries reference registered runtime ids exported by the descriptor module ([compliance])
- ALWAYS: the descriptor rejects unknown fields and malformed entry shapes before child reconcilers run ([compliance])
- ALWAYS: the descriptor section resolves equivalently across JSON, YAML, and TOML config files ([mapping])

### Audit

- NEVER: perform instruction-file reconciliation, runtime config writes, plugin installation, plugin updates, network access, or filesystem writes from the descriptor validator ([audit])
- NEVER: put runtime-specific serializers, concrete output paths, or verification run-state paths in this descriptor; those belong to the runtime-configuration child and to the verification run-journal channel `spx/34-verification.enabler` ([audit])
- NEVER: validate traversal safety for instruction paths or protocol safety for marketplace sources in this descriptor; the children that know the concrete target own those checks ([audit])
