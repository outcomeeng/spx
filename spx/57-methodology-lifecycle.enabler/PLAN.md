# Plan: methodology lifecycle

## Governing decision

`spx/13-agent-capability-lifecycle.pdr.md` separates exact methodology inspection, routine capability reconciliation, and target-methodology-owned migration.

## Pending architecture

- Define the methodology lifecycle domain boundary over exact config identity, harness capability resolution, methodology diagnostics, verification-run identity, and coding-agent session resume and closure.
- Define isolated target-package resolution and migration launch without sharing invoking coding-agent state.
- Define migration attempt identity and persistence so sealed verification evidence reconstructs the exact target, branch and head changeset, resolved configuration, and coding-agent session.

## Consumed providers

- `spx/46-agent.enabler` provides the exact native coding-agent session identity this node binds migration resume, verification evidence, and closure to.

## Aligned consumers

- `spx/60-surfaces.enabler/21-cli-surface.enabler` declares the methodology version show and migrate command family as a binding over this node.

## Remaining work

- Use `/apply` to author the linked test evidence and implementation after the architecture decision is audited.
- Materialize a dedicated CLI child through `/decompose` only when command-specific help, option grammar, output modes, and diagnostics are ready to declare.
