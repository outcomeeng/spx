# Plan: methodology context check

## Pending steps

1. Move the probe in `src/commands/diagnose/probes.ts` off every coding-agent cache path onto the shipped-tree reader rooted at spx's package root; observe, per enabled coding agent, whether `methodology/{line}/{agent}/spec-tree/skills/understand/manifest.json` exists and what `source.json` records.
2. Reduce the verdict vocabulary in `src/domains/diagnose/checks/methodology-context.ts` to configured, shipped, unavailable, undeclared-match, mismatched, and unknown; remove `version-mismatch` and `bootstrap-identity`.
3. Rebuild the harness in `testing/harnesses/diagnose/methodology-context.ts` on a temp tree root instead of a cache fixture, and re-fixture the two tests under `tests/`.
4. Route the two untagged assertions through `/apply` and `/verify` before adding their evidence.
