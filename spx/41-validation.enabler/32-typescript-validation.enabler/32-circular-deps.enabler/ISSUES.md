# TypeScript Circular Dependencies Issues

## Extract circular scope computation from the command layer

- Evidence: PR #211 review on 2026-06-19 identified that `src/commands/validation/circular.ts` contains pure scope computation helpers such as `constrainPatternToDirectory`, `advancePatternPastDirectory`, `advanceRecursiveGlobForDirectorySegment`, `patternSegmentMatchesDirectorySegment`, `toExplicitScopeConfig`, `toExplicitPathTarget`, `filterExplicitPathTargets`, and `resolveEffectiveScopeConfig`.
- Impact: The helpers live in the command layer even though `spx/14-cli-composition.adr.md` assigns pure computation to a domain/config layer and command handlers to I/O orchestration. Keeping these helpers private to the command handler prevents isolated reuse and direct testing of the pure scope transformation.
- Revisit when: circular validation scope handling is next refactored or shared with another validation command.
- Resolution: move the pure scope computation to `src/validation/config/scope.ts` or a sibling validation-domain module, keep filesystem checks in `src/commands/validation/circular.ts`, and preserve the current L1/L2 circular-deps evidence.
