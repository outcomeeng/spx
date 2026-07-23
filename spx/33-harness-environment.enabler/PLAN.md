# Plan: harness environment

## Harness vocabulary guard

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Purpose

Define and implement deterministic management for agent instructions, agent config, plugin marketplaces, plugins, and skills.

## Governing specs

- `spx/spx.product.md`
- `spx/33-harness-environment.enabler/21-agent-instructions.enabler/agent-instructions.md`
- `spx/33-harness-environment.enabler/32-agent-config.enabler/agent-config.md`
- `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/plugin-bootstrap.md`

## Implementation notes

- Make agent config reconciliation deterministic and safe to run repeatedly.
- Keep agentic verification environment bootstrapping hermetically separate from the invoking agent.

## Settled work

- The parent harness-environment descriptor shape is settled on `origin/main`.
- Baseline Claude Code and Codex agent config reconciliation is settled on `origin/main`.
- Agent state boundary notes are recorded for agentic verification consumers.

## Active work

- Deterministic instruction-file reconciliation remains under `spx/33-harness-environment.enabler/21-agent-instructions.enabler/`.
- Pi-native projection and capability-lifecycle expansion remain under `spx/33-harness-environment.enabler/32-agent-config.enabler/`.
- Plugin marketplace, plugin, and skill bootstrap status remains under `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/`.

## Agent capability lifecycle packet

The product needs one root product decision record (PDR), proposed at `spx/13-agent-capability-lifecycle.pdr.md`, that consumes the vocabulary in `spx/12-agent-harness.pdr.md` and governs methodology identity, compatible tooling updates, repository-local agent capability reconciliation, user-scope diagnostics, and methodology migration across the higher-index consumers.

### Settled product behavior

- `spx.config.{yaml,toml,json}` is the canonical human-authored declaration of one exact Spec Tree methodology version, enabled agents, capability sources, and exact Outcome Engineering package versions. Native agent files are deterministic projections.
- An agent participates only when product configuration explicitly enables it and availability detection finds it. Detection never opts an agent in.
- `spx update` updates only the SPX executable through a recognized installation owner. Local, linked, or ambiguous installations receive provenance and remediation without self-mutation.
- `spx agent config status` is read-only. `spx agent config apply` reproduces committed versions. `spx agent config update` advances only package versions compatible with the declared methodology, persists those pins, and applies them.
- Capability apply and update require network access and the newest SPX release compatible with the declared methodology. Interactive execution offers an owner-supported SPX update and aborts when declined; noninteractive execution fails without updating SPX.
- SPX never mutates user-scope agent configuration. Outcome Engineering entries detected there are degraded hidden input. Product-over-user precedence is an external agent-platform assumption.
- `spx methodology version show` reports the declared version, managed instruction markers, and installed compatibility without mutation or required network access.
- `spx methodology version migrate <target>` resolves the target methodology package in isolated harness state and launches the target methodology's managed migration agent. SPX never infers or mechanically rewrites product truth.
- Interrupted methodology migrations preserve their branch, working changes, run journal, and resumable agent session and remain incomplete.
- Migration completion requires target-methodology verification plus SPX envelope checks: a successful sealed run, target version in product configuration, matching managed instruction markers, a compatible installed Spec Tree package, and migration-session closure.

### Declaration alignment

The PDR changeset aligns the first affected declarations under `spx/16-config.enabler/43-methodology-config.enabler`, this harness-environment node, instruction reconciliation, coding-agent config, capability bootstrap, and methodology diagnostics. Node-local plans retain the pending tests and implementation beneath those declarations.

### Completed structure and declaration flow

- `spx/57-methodology-lifecycle.enabler` owns exact methodology inspection and managed migration after decomposition established its dependency position.
- `spx/46-agent.enabler` aligns native coding-agent session resume, evidence binding, and closure with migration attempts.
- `spx/60-surfaces.enabler/21-cli-surface.enabler` aligns the methodology version show and migrate command family with the lifecycle domain.

### Remaining order

1. Route every deterministic lower-spec assertion through `/test` and establish its declared evidence without weakening it to agentic audit.
2. Obtain an approving PDR audit with live `/understand`, `/contextualize`, and repository-read capabilities.
3. Select implementation slices through `/slice`, then run `/apply` for each slice with the required TypeScript test and implementation audits.

## Evidence required

- Tests or review evidence prove generated instruction files are deterministic.
- Tests or review evidence prove plugin bootstrap can distinguish installed, missing, and misconfigured entries.
- `spx validation all` passes.

## Parallelization

Instruction-file reconciliation and plugin bootstrap can proceed independently after agent config reconciliation.

## Open coordination

- Align this node with `spx/12-agent-harness.pdr.md`: distinguish harness configuration from agents, agent adapters, and agent sessions across specs, config contracts, source modules, generators, and tests. The existing agent vocabulary rename belongs here because the descriptor and child reconcilers own that shared vocabulary.
- Author the invoking-agent isolation decision before an agentic verification run's implementation chooses working-directory, environment-variable, or temporary-file sharing boundaries.
- When E1, E2, or E3 add descriptor-consuming tests, expand `CONFIG_TEST_GENERATOR.harnessEnvironmentConfig()` beyond the E0 representative mapping shape or add narrower generator names for shape-specific evidence.

## Gate dependencies

The central packet table in `spx/16-config.enabler/PLAN.md` is authoritative; this section is a local reminder only.

- `spx/33-harness-environment.enabler/21-agent-instructions.enabler/` consumes settled agent config reconciliation.
- `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/` consumes settled agent config reconciliation.

## Agent pickup prompt

```text
Use the child-node pickup prompts for E1 and E3. The parent descriptor and baseline E2 agent config packet are settled on `origin/main`; reconcile E2's Pi-native and capability-lifecycle expansion through this plan before applying it.
```
