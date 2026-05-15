# Agent Environment Descriptor

## Purpose

This decision governs the parent-owned config descriptor for agent environment management. It defines the shared schema that instruction reconciliation, runtime configuration, and plugin bootstrap packets consume without letting any child packet own the cross-cutting agent-environment section.

## Context

**Business impact:** Agent environment work spans instruction files, runtime settings, marketplaces, plugins, and skills. A shared descriptor lets those workflows read one configured product state instead of each child packet inventing a separate config section. That keeps Codex and Claude Code setup reproducible while preserving hermetic audit and review execution boundaries.

**Technical constraints:** Config descriptors are registered statically through `src/config/registry.ts` per `spx/16-config.enabler/21-descriptor-registration.adr.md`. E0 owns only descriptor shape and validation. E1 owns instruction-file reconciliation, E2 owns runtime-specific configuration writers, and E3 owns plugin bootstrap status and actions. The descriptor must therefore model shared inputs and target runtimes without writing files, installing plugins, or encoding runtime-specific serializers.

## Decision

The `agentEnvironment` descriptor lives at `src/domains/agent-environment/config.ts`, registers with the production config registry, and resolves three parent-owned subsections: `instructions`, `runtimes`, and `pluginBootstrap`.

## Rationale

The parent descriptor matches the product truth that agent environment management spans AGENTS.md, runtime configuration, marketplaces, plugins, and skills. A single `agentEnvironment` section gives downstream packets a typed shared input while keeping child implementation responsibilities separate.

The descriptor uses explicit runtime ids for Codex and Claude Code. Those ids are source-owned protocol values that child packets can import when selecting runtime-specific serializers, instruction targets, or bootstrap adapters. The descriptor stores runtime participation and entry ownership, while child packets decide concrete file writes, dry-run output, offline behavior, and hermetic state paths.

The descriptor is strict about recognized fields and registered runtimes. Instruction, marketplace, plugin, and skill entries reject malformed shapes before a child reconciler can act on them. Unknown fields are rejected rather than ignored because this descriptor is the shared API for later packets; accepting misspellings would make downstream behavior appear successful while silently dropping configured intent.

Alternatives considered:

- **Separate config sections for instructions, runtimes, and bootstrap.** Rejected because the product owns them as one agent environment. Splitting them would force E1, E2, and E3 to coordinate target runtime vocabulary by convention rather than by type.
- **Child-owned descriptor sections only.** Rejected because A3, R2, R4, and R5 need a stable parent input before child implementation details are settled.
- **Runtime-specific config file paths in E0.** Rejected because path semantics, dry-run output, and serializer behavior belong to E2. E0 models the shared runtime identity and configured entries only.

## Trade-offs accepted

| Trade-off                                          | Mitigation / reasoning                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The parent descriptor knows the supported runtimes | The descriptor must provide stable runtime ids for children; serializers and filesystem targets remain child-owned |
| Unknown fields fail early                          | Early rejection protects operators from silent typos in a shared section consumed by multiple packets              |
| Plugin bootstrap entries are structural            | E3 owns installed, missing, stale, failed, dry-run, and offline behavior; E0 only validates configured intent      |
| Empty instruction file lists are allowed           | Omitted `instructions.files` keeps the default `AGENTS.md`; an explicit empty list disables instruction files      |
| Instruction targets may include disabled runtimes  | Runtime enablement controls downstream participation; descriptor validation only requires registered runtime ids   |

## Invariants

- Descriptor validation has no filesystem, process, network, or runtime side effects.
- For a resolved `agentEnvironment` section, every instruction, marketplace, plugin, and skill entry references a registered runtime id.
- Instruction file paths are unique within `instructions.files`.
- Marketplace, plugin, and skill names are unique within each runtime.
- Plugin entries that name a marketplace reference a configured marketplace for the same runtime.
- Child reconcilers consume the descriptor's resolved values; they do not parse raw `spx.config.*` content.

## Compliance

### Recognized by

A single `agentEnvironmentConfigDescriptor` exported from `src/domains/agent-environment/config.ts` is imported by `src/config/registry.ts`. Tests under `spx/33-agent-environment.enabler/tests/` resolve the descriptor through the production registry and validate malformed entries through the descriptor API.

### MUST

- The descriptor resolves `instructions`, `runtimes`, and `pluginBootstrap` defaults through the static config registry ([test](tests/agent-environment-descriptor.compliance.l1.test.ts), [review])
- Instruction targets, marketplace entries, plugin entries, and skill entries reference registered runtime ids exported by the descriptor module ([test](tests/agent-environment-descriptor.compliance.l1.test.ts), [review])
- The descriptor rejects unknown fields and malformed entry shapes before child reconcilers run ([test](tests/agent-environment-descriptor.compliance.l1.test.ts), [review])
- The descriptor section resolves equivalently across JSON, YAML, and TOML config files ([test](tests/agent-environment-descriptor.mapping.l1.test.ts), [review])

### NEVER

- Perform instruction-file reconciliation, runtime config writes, plugin installation, plugin updates, network access, or filesystem writes from the descriptor validator ([review])
- Put runtime-specific serializers, concrete output paths, or hermetic audit/review state paths in E0; those details belong to E2, A3, and R2 ([review])
