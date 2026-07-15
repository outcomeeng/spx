# Marketplace Install Check

PROVIDES marketplace-install diagnosis across enabled Claude Code and Codex agents, comparing each agent's product-configured Outcome Engineering marketplace and plugin subset with that agent's live plugin CLI state
SO THAT the `spx diagnose` engine in `spx/54-diagnose.enabler/diagnose.md`
CAN fold live product-scoped marketplace health into the overall environment verdict without treating the marketplace's complete catalog as required

## Assertions

### Mappings

- For each enabled agent with configured marketplace intent, exact marketplace registration plus every plugin in that agent's configured subset installed and enabled maps to installed; a configured plugin missing or disabled maps to drifted; a present agent plugin CLI without the exact configured marketplace registration maps to unregistered; command or parse failure maps to unknown; an absent agent CLI contributes no surface verdict; and no present applicable agent CLI maps to plugin-cli-unavailable, with each aggregate verdict paired to its declared bucket and remediation ([test](tests/marketplace-install.mapping.l1.test.ts))
- Claude Code and Codex evaluate their own configured plugin subsets independently, then aggregate unregistered ahead of drifted ahead of installed; a plugin configured only for one agent is never expected on the other agent ([test](tests/marketplace-install.mapping.l1.test.ts))
- Marketplace catalog entries absent from both product-configured agent subsets never change marketplace-install readings, verdict, bucket, or remediation ([test](tests/marketplace-install.mapping.l1.test.ts))
