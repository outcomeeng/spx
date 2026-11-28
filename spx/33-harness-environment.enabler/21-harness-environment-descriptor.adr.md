# Harness Environment Descriptor

CONSTRAINS the coding agents SPX supports, how it identifies the invoking agent, and the shared harness-environment configuration input
TO the agent registry module under `src/lib/agent-environment/`, which imports one agent module per coding agent from `src/lib/agent-environment/agents/`, one identification rule over the `--agent` operand and the process names those modules declare, and one `harnessEnvironment` config descriptor at `src/domains/agent-environment/config.ts`, registered with the production config registry per [spx/16-config.enabler/21-descriptor-registration.adr.md](spx/16-config.enabler/21-descriptor-registration.adr.md), that resolves the subsections `instructions`, `agents` and `pluginBootstrap` over the registered agent ids
SO THAT adding or removing a coding agent changes only its agent module and its registry entry, and the methodology bundle set of [spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/21-tree-fetch.adr.md](spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/21-tree-fetch.adr.md) when the agent ships a new bundle; no consumer guesses which agent does the work; and instruction reconciliation, agent configuration, hook CLI transport and plugin bootstrap consume one validated, typed input, in which a typo fails instead of dropping configured intent

## Test.Compliance: agent registry

- registry-declarations: ALWAYS: each agent module declares its agent id, its process name, its hook payload's session field, its compact-stdout default, and at most one methodology bundle from the bundle set of [spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/21-tree-fetch.adr.md](spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/21-tree-fetch.adr.md), and the agent registry module lists every agent module.
- default-bundle-mark: ALWAYS: exactly one agent module marks its methodology bundle as the default methodology bundle.
- agent-names-in-registry-only: NEVER: a file under `src/` outside the agent registry module, the agent modules it lists, and the files the rule's transitional allowlist names holds a string literal exactly equal to a registered agent id; files under `src/lib/methodology/`, which hold the methodology bundle vocabulary, and the module specifier of an import declaration are exempt.

## Test.Mapping: agent-identification

Agent identification through the agent registry's resolver yields at most one agent and reads no environment variable; an agent's session comes from its hook payload field or from the worktree claim, never from this resolver.

| Case                 | `--agent` operand         | Ancestor process chain                                        | Agent                                 |
| -------------------- | ------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| operand              | names a registered agent  | any                                                           | the agent the operand names           |
| unregistered-operand | names no registered agent | any                                                           | none                                  |
| ancestor             | absent                    | holds a process whose executable is a registered process name | the agent of the nearest such process |
| none                 | absent                    | holds no such process                                         | none                                  |

## Test.Compliance: descriptor resolution

- registry-defaults: ALWAYS: the descriptor resolves `instructions`, `agents`, and `pluginBootstrap` defaults through the static config registry.
- compact-stdout-default: ALWAYS: each agent config carries `hooks.sessionStart.compactStdout` with an agent-specific default, and an explicit boolean in that agent's configuration overrides it.
- registered-agent-references: ALWAYS: every instruction target, marketplace entry, plugin entry, and skill entry references a registered agent id the descriptor module exports.
- strict-shapes: ALWAYS: the descriptor rejects unknown fields and malformed entry shapes before any child reconciler runs.
- unique-instruction-paths: ALWAYS: instruction file paths are unique within `instructions.files`.
- instruction-target-lists: ALWAYS: instruction file target-agent lists are non-empty and repeat no agent.
- unique-agent-entry-names: ALWAYS: marketplace, plugin, and skill names are unique within each agent.
- plugin-marketplace-reference: ALWAYS: a plugin entry that names a marketplace references a configured marketplace for the same agent.
- default-instruction-file: ALWAYS: an omitted `instructions.files` keeps the default `AGENTS.md`, and an explicit empty list disables instruction-file management.
- disabled-agent-targets: ALWAYS: an instruction target may name a disabled agent; validation requires a registered agent id, not an enabled one.

## Test.Mapping: config-format-equivalence

Equivalent `harnessEnvironment` sections declared in each config file format resolve to identical typed harness environment config.

| Case | Config file       | Resolved config                                 |
| ---- | ----------------- | ----------------------------------------------- |
| json | `spx.config.json` | identical to the config the other formats yield |
| yaml | `spx.config.yaml` | identical to the config the other formats yield |
| toml | `spx.config.toml` | identical to the config the other formats yield |

## Audit: descriptor boundaries

- validation-side-effect-free: NEVER: descriptor validation has a filesystem, process, network, or agent side effect, or performs instruction-file reconciliation, an agent config write, or a plugin installation or update.
- no-methodology-effects: NEVER: the descriptor validator loads methodology files, injects methodology context, or resolves methodology source or version; the top-level `methodology` descriptor under `spx/16-config.enabler/43-methodology-config.enabler` owns them.
- no-serializers: NEVER: the descriptor holds agent-specific serializers, concrete output paths, or verification run-state paths; they belong to the agent configuration child and to `spx/34-verification.enabler`.
- child-owned-checks: NEVER: the descriptor validates traversal safety for instruction paths or protocol safety for marketplace sources; the instruction-reconciliation child and the plugin-bootstrap child own those checks.
- resolved-values-only: NEVER: a child reconciler parses raw `spx.config.*` content instead of consuming the descriptor's resolved values.
- hook-policy-primitive: NEVER: a hook event runner imports the harness-environment descriptor; the hook CLI transport resolves `hooks.sessionStart.compactStdout` as part of one hook execution context and passes hook infrastructure a primitive policy value.
- distinct-source-fields: ALWAYS: marketplace `source` values and skill `source` values are different semantic fields although they share one config field name.
- explicit-instruction-targets: NEVER: adding an agent makes it an implicit instruction target.
- child-validation: ALWAYS: the instruction-reconciliation child validates concrete instruction paths before writing files, and the plugin-bootstrap child validates marketplace source formats before resolving external inputs.
