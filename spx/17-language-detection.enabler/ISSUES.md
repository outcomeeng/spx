# Issues

## Code lives under src/validation/discovery/

The spec now sits at `spx/17-language-detection.enabler/` (product root) and its SO THAT clause broadens to "quality-gate enablers (validation stages and test runners)." The implementation is still at `src/validation/discovery/language-finder.ts` — nested under `validation/` as though that subtree owns it. Tests co-located here import via `@/validation/discovery/language-finder.js`.

**Resolution:** Move the code to a location that matches the spec scope — `src/language-detection/finder.ts` or `src/discovery/language-finder.ts`. Update the `tsconfig.json` path alias (either add `@/language-detection/*` or repurpose `@/discovery/*`). Update imports in `src/commands/validation/{lint,circular,typescript}.ts` (currently relative via the discovery barrel — they consume `detectTypeScript`) and the three `@/validation/discovery/language-finder.js` imports in the co-located tests. `src/commands/validation/knip.ts` uses the discovery barrel only for tool discovery (`discoverTool`, `formatSkipMessage`) and is unaffected by a language-detection move. `src/validation/discovery/{tool-finder,constants}.ts` and the discovery barrel remain validation-specific.
