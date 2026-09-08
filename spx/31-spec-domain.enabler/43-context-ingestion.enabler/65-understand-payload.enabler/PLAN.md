# Plan: understand payload

## Pending steps

1. Route the three untagged assertions under `## Assertions` — coding-agent
   scoping, the migration-source report, and the `provides`/`supports` check
   against the tree's `source.json` — through `/verify` and `/test`, then link
   their evidence from typed headings. Until then their behavior is implemented
   in `src/commands/spec/context.ts` and `src/interfaces/cli/coding-agent.ts`
   with no linked test of its own; the shipped `methodology/4.0` line records
   no `provides`, so the check's positive and mismatch branches verify only over
   a fixture tree whose `source.json` declares them.
