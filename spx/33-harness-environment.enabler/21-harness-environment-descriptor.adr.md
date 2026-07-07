# Harness Environment Descriptor

The `harnessEnvironment` config descriptor lives at `src/domains/agent-environment/config.ts`, registers with the production config registry per `spx/16-config.enabler/21-descriptor-registration.adr.md`, and resolves three parent-owned subsections — `instructions`, `agents`, and `pluginBootstrap` — with explicit source-owned agent ids for Codex and Claude Code that instruction reconciliation, agent configuration, hook CLI transport, and plugin bootstrap consume when selecting agent-specific serializers, instruction targets, hook policy, or bootstrap adapters. Methodology source and version belong to the top-level `methodology` descriptor under `spx/16-config.enabler/43-methodology-config.enabler`. The descriptor models shared agent inputs and target agents only: it writes no files, installs no plugins, loads no methodology files, and encodes no agent-specific serializers, and it rejects unknown fields and malformed entry shapes rather than ignoring them, because it is the shared API those boundaries consume.

## Rationale

A single parent descriptor matches the product truth that harness environment management spans `AGENTS.md`, agent configuration, marketplaces, plugins, and skills. One `harnessEnvironment` section gives downstream children a typed shared input while their concrete file writes, plugin status classifications (installed, missing, stale, failed), dry-run output, offline behavior, and hermetic state paths stay child-owned; the descriptor only validates configured intent. Strict rejection of unknown fields protects operators from silent typos in a section multiple children consume; accepting misspellings would make downstream behavior appear successful while dropping configured intent.

Rejected: child-owned descriptor sections only (downstream children need a stable parent input before their implementation details settle); and agent-specific config file paths in this descriptor (path semantics, dry-run output, and serializer behavior belong to the agent configuration child, which models the shared agent identity and configured entries only).

## Invariants

- Descriptor validation has no filesystem, process, network, or agent side effects.
- For a resolved `harnessEnvironment` section, every instruction, marketplace, plugin, and skill entry references a registered agent id.
- Each agent config carries `hooks.sessionStart.compactStdout`; Codex defaults it to false and Claude Code defaults it to true.
- Instruction file paths are unique within `instructions.files`.
- Instruction file target-agent lists are non-empty and do not repeat agents.
- Marketplace, plugin, and skill names are unique within each agent.
- Plugin entries that name a marketplace reference a configured marketplace for the same agent.
- Child reconcilers consume the descriptor's resolved values; they do not parse raw `spx.config.*` content.
- The hook CLI transport resolves `hooks.sessionStart.compactStdout` from the descriptor as part of one hook execution context and passes hook infrastructure a primitive policy value; hook event runners do not import the harness-environment descriptor.
- Compact stdout agent policy selection and `session-start` session identity are separate concerns: `CODEX_THREAD_ID` selects Codex for compact stdout before `CLAUDE_SESSION_ID`, `CLAUDE_SESSION_ID` selects Claude Code when the Codex marker is absent, and `CLAUDE_ENV_FILE` selects Claude Code only when both session markers are absent.
- The instruction-reconciliation child validates concrete instruction paths before writing files, and the plugin-bootstrap child validates marketplace source formats before resolving external inputs.
- Marketplace `source` values and skill `source` values are different semantic fields even though they share the same config field name.
- An omitted `instructions.files` keeps the default `AGENTS.md`; an explicit empty list disables instruction-file management.
- Instruction targets may name disabled agents — descriptor validation requires only registered agent ids, not enabled ones; agent enablement governs downstream participation.
- Adding an agent does not make it an implicit instruction target; each instruction file's target agents are explicit.

## Verification

### Testing

- ALWAYS: the descriptor resolves `instructions`, `agents`, and `pluginBootstrap` defaults through the static config registry ([compliance])
- ALWAYS: agent hook policy defaults resolve from the descriptor, and explicit `hooks.sessionStart.compactStdout` booleans override the agent-specific default ([compliance])
- ALWAYS: instruction targets, marketplace entries, plugin entries, and skill entries reference registered agent ids exported by the descriptor module ([compliance])
- ALWAYS: the descriptor rejects unknown fields and malformed entry shapes before child reconcilers run ([compliance])
- ALWAYS: the descriptor section resolves equivalently across JSON, YAML, and TOML config files ([mapping])

### Audit

- NEVER: perform instruction-file reconciliation, agent config writes, plugin installation, plugin updates, network access, or filesystem writes from the descriptor validator ([audit])
- NEVER: load methodology files, inject methodology context, or resolve methodology source/version from the descriptor validator; the top-level methodology descriptor and context-loading consumers own those effects ([audit])
- NEVER: put agent-specific serializers, concrete output paths, or verification run-state paths in this descriptor; those belong to the agent configuration child and to the verification run-journal channel `spx/34-verification.enabler` ([audit])
- NEVER: validate traversal safety for instruction paths or protocol safety for marketplace sources in this descriptor; the children that know the concrete target own those checks ([audit])
- NEVER: import the harness-environment descriptor from hook event runners; the hook CLI transport resolves hook policy and passes primitive policy values to hook infrastructure ([audit])
- NEVER: infer session-start identity from compact stdout agent policy selection or infer compact stdout agent policy from session-start identity; compact stdout policy follows `CODEX_THREAD_ID`, `CLAUDE_SESSION_ID`, then `CLAUDE_ENV_FILE`, while session-start identity follows its event-specific inputs ([audit])
