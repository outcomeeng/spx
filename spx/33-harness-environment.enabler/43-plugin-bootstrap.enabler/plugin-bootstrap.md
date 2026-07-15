# Plugin Bootstrap

PROVIDES product-owned marketplace, plugin, and skill intent by enabled agent, plus a focused declaration-health diagnosis
SO THAT agent preparation and the whole-product diagnose report
CAN require the Outcome Engineering marketplace and `spec-tree` plugin for every enabled agent, preserve intentional agent-specific plugin subsets, and report cross-agent declaration differences without treating the marketplace catalog as product intent

## Assertions

### Mappings

- For each enabled agent, an Outcome Engineering marketplace declaration paired with a `spec-tree` declaration for that marketplace maps to baseline-present; a missing marketplace or `spec-tree` declaration maps to baseline-missing; disabled agents do not participate; all participating agents baseline-present maps to healthy and any baseline-missing agent maps to broken ([test](tests/plugin-bootstrap.mapping.l1.test.ts))
- Product-declared plugins for the Outcome Engineering marketplace map to per-agent plugin sets plus `claudeOnly` and `codexOnly` symmetric-difference readings; those difference readings never change an otherwise healthy declaration verdict ([test](tests/plugin-bootstrap.mapping.l1.test.ts))
- Marketplace catalog entries absent from an agent's configured plugin set never appear in that agent's expected plugin set ([test](tests/plugin-bootstrap.mapping.l1.test.ts))

### Compliance

- NEVER: declaration-health diagnosis performs installation, network access, or agent-config writes ([audit])
