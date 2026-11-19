# Harness Environment Descriptor

DEFINES identity variable AS the variable a registered agent sets for itself, whose value is that agent's session id: `CLAUDE_CODE_SESSION_ID` for Claude Code, `CODEX_THREAD_ID` for Codex, `ANTIGRAVITY_CONVERSATION_ID` for agy, and `PI_SESSION_ID` for Pi

DEFINES identity rule AS an invoking process identifies an agent and its session only when exactly one identity variable holds a value that is neither empty nor whitespace-only, and identifies no agent and no session when none or two or more do

CONSTRAINS the shared agent inputs and target agents that instruction reconciliation, agent configuration, hook CLI transport, and plugin bootstrap consume
TO one `harnessEnvironment` config descriptor at `src/domains/agent-environment/config.ts`, registered with the production config registry per [spx/16-config.enabler/21-descriptor-registration.adr.md](spx/16-config.enabler/21-descriptor-registration.adr.md), that resolves the parent-owned `instructions`, `agents`, and `pluginBootstrap` subsections with explicit source-owned agent ids for Claude Code, Codex, agy, and Pi, each with its identity variable and hook policy, and rejects unknown fields and malformed entry shapes
SO THAT every consumer reads one validated input and identifies the invoking agent and its session the same way

## Verification

- validation-side-effect-free: NEVER: descriptor validation has a filesystem, process, network, or agent side effect.
- registered-agent-references: ALWAYS: for a resolved `harnessEnvironment` section, every instruction, marketplace, plugin, and skill entry references a registered agent id.
- compact-stdout-defaults: ALWAYS: each agent config carries `hooks.sessionStart.compactStdout`; Codex, agy, and Pi default it to false and Claude Code defaults it to true.
- unique-instruction-paths: ALWAYS: instruction file paths are unique within `instructions.files`.
- instruction-target-lists: ALWAYS: instruction file target-agent lists are non-empty and repeat no agent.
- unique-agent-entry-names: ALWAYS: marketplace, plugin, and skill names are unique within each agent.
- plugin-marketplace-reference: ALWAYS: a plugin entry that names a marketplace references a configured marketplace for the same agent.
- resolved-values-only: NEVER: a child reconciler parses raw `spx.config.*` content instead of consuming the descriptor's resolved values.
- hook-policy-primitive: ALWAYS: the hook CLI transport resolves `hooks.sessionStart.compactStdout` from the descriptor as part of one hook execution context and passes hook infrastructure a primitive policy value.
- one-identity-variable: ALWAYS: an invoking process identifies an agent and its session only when exactly one of `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, and `PI_SESSION_ID` holds a value that is neither empty nor whitespace-only, and the identified session id is that variable's value.
- no-identity-otherwise: ALWAYS: when none of the four identity variables is non-empty, or two or more are, no agent and no session are identified; no identity variable takes precedence over another, and no agent falls back to another agent's variable.
- ambiguous-identity-failure: ALWAYS: a command whose spec declares an agent-session identity failure fails when two or more identity variables are non-empty, naming every one of the four it found set; every other consumer treats them as no identity.
- methodology-claude-default: ALWAYS: methodology source selection, which selects one shipped coding-agent bundle, selects Claude when two or more identity variables are non-empty, whichever they are; this default identifies no agent and no session and is the one exception to no-identity-otherwise.
- no-hook-markers: NEVER: `CLAUDE_SESSION_ID` or `CLAUDE_ENV_FILE` identifies an agent or a session, and no consumer of the identity rule reads `CLAUDE_SESSION_ID`.
- compact-policy-agent: ALWAYS: compact stdout agent policy follows the agent the identity rule identifies and resolves false when the rule identifies no agent; `session-start` session identity stays a separate, event-specific concern.
- registration-scope: ALWAYS: registering agy and Pi adds their agent ids, identity variables, and hook policy; native configuration projection for them stays with `spx/33-harness-environment.enabler/32-agent-config.enabler`.
- child-owned-checks: ALWAYS: the instruction-reconciliation child validates concrete instruction paths before writing files, and the plugin-bootstrap child validates marketplace source formats before resolving external inputs.
- distinct-source-fields: ALWAYS: marketplace `source` values and skill `source` values are different semantic fields although they share one config field name.
- default-instruction-file: ALWAYS: an omitted `instructions.files` keeps the default `AGENTS.md`, and an explicit empty list disables instruction-file management.
- disabled-agent-targets: ALWAYS: instruction targets may name disabled agents; descriptor validation requires registered agent ids, not enabled ones, and agent enablement governs downstream participation.
- explicit-instruction-targets: NEVER: adding an agent makes it an implicit instruction target; each instruction file's target agents are explicit.
- methodology-descriptor-owns-source: ALWAYS: methodology source and version belong to the top-level `methodology` descriptor under `spx/16-config.enabler/43-methodology-config.enabler`.
- registered-agent-identities: ALWAYS: the descriptor module registers Claude Code, Codex, agy, and Pi, each with its agent id, its identity variable, and its hook policy default.
- identity-rule-subsets: ALWAYS: agent and session identification, evidenced over every subset of the four identity variables generated from the source-owned identity-variable keys, identifies the one agent whose variable alone is non-empty and its session, and identifies none for every other subset, whatever `CLAUDE_SESSION_ID` and `CLAUDE_ENV_FILE` hold.

### Test.Compliance: descriptor resolution

- registry-defaults: ALWAYS: the descriptor resolves `instructions`, `agents`, and `pluginBootstrap` defaults through the static config registry.
- hook-policy-override: ALWAYS: agent hook policy defaults resolve from the descriptor, and explicit `hooks.sessionStart.compactStdout` booleans override the agent-specific default.
- registered-agent-ids-exported: ALWAYS: instruction targets, marketplace entries, plugin entries, and skill entries reference registered agent ids the descriptor module exports.
- strict-shape-rejection: ALWAYS: the descriptor rejects unknown fields and malformed entry shapes before child reconcilers run.

### Test.Mapping: config-format-equivalence

The descriptor section resolves to the same values whichever config file format declares it.

| Case | Config file       | Resolved section                           |
| ---- | ----------------- | ------------------------------------------ |
| json | `spx.config.json` | equal to the section the other cases yield |
| yaml | `spx.config.yaml` | equal to the section the other cases yield |
| toml | `spx.config.toml` | equal to the section the other cases yield |

### Audit: descriptor boundaries

- no-reconciliation-effects: NEVER: perform instruction-file reconciliation, agent config writes, plugin installation, plugin updates, network access, or filesystem writes from the descriptor validator.
- no-methodology-loading: NEVER: load methodology files, inject methodology context, or resolve methodology source or version from the descriptor validator; the top-level methodology descriptor and context-loading consumers own those effects.
- no-child-specifics: NEVER: put agent-specific serializers, concrete output paths, or verification run-state paths in this descriptor; those belong to the agent configuration child and to the verification run-journal channel `spx/34-verification.enabler`.
- no-child-safety-checks: NEVER: validate traversal safety for instruction paths or protocol safety for marketplace sources in this descriptor; the children that know the concrete target own those checks.
- no-descriptor-import-in-runners: NEVER: import the harness-environment descriptor from hook event runners; the hook CLI transport resolves hook policy and passes primitive policy values to hook infrastructure.
- identity-policy-separation: NEVER: infer session-start identity from compact stdout agent policy selection or infer compact stdout agent policy from session-start identity; compact stdout policy follows the agent the identity rule identifies, while session-start identity follows its event-specific inputs.
- no-identity-precedence: NEVER: let one identity variable take precedence over another, fall back from one agent's identity variable to another's, or read `CLAUDE_SESSION_ID` or `CLAUDE_ENV_FILE` as an identity source or marker; the methodology-source Claude default, which identifies no agent, is the one exception.
