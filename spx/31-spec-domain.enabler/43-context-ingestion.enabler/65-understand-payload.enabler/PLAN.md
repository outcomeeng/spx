# Plan: understand payload

## Pending steps

1. Resolve the tree root from spx's package root — `../methodology` relative to the entry module, the same resolution `src/cli.ts` uses for `package.json` — instead of the product directory; drop provenance parsing and digest comparison from `src/lib/methodology/tree.ts` and read `source.json` for `provides` and `supports` when present.
2. Address the tree by the `MAJOR.MINOR` line of the declared version; fail naming the declared version and the shipped lines when the line directory is absent.
3. Route the compact-recovery hook (`src/lib/methodology/compact-recovery.ts`, `src/interfaces/hooks/session-start.ts`) through the same reader; no second resolution path.
4. Re-fixture the four tests under `tests/` on a temp tree root shaped as `methodology/{line}/{agent}/spec-tree/skills/understand/`, injected through the reader's root; the fixture in `testing/harnesses/spec/context.ts` moves off the product directory.
5. Route the four untagged assertions through `/apply` and `/verify` before adding their evidence.
