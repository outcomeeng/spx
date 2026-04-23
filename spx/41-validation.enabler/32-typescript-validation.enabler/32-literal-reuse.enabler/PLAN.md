# Plan

Implementation steps for the cross-file literal-reuse detector. Reference implementation lives at:

- `/Users/shz/Code/xiperinc/xiperlabs.com/eslint-rules/literal-reuse.ts` — pure detector
- `/Users/shz/Code/xiperinc/xiperlabs.com/scripts/detect-literal-reuse.ts` — CLI wrapper
- `/Users/shz/Code/xiperinc/xiperlabs.com/eslint-rules/literal-signal.ts` — allowlist + thresholds

## Steps

1. **Port the pure detector** to `src/validation/literal-reuse/detector.ts` (or equivalent). Functions: `collectLiterals(source, filename)`, `buildIndex(occurrences)`, `detectReuse({srcIndex, testOccurrencesByFile})`.

2. **Address audit findings from the xiperinc reference:**
   - Replace the `Object.keys`-driven AST visitor with `eslint-visitor-keys`-based traversal — only descend into fields the parser declares as carrying child nodes.
   - Broaden the import/export skip set to also cover CommonJS `require()` arguments, dynamic `import()` expressions, and any other module-identifier positions surfaced during testing.
   - Drop the unused `srcOccsByFile` map; build the index directly from the iterator (xiperinc reference builds the map and immediately discards it).

3. **CLI integration with SPX conventions:**
   - Add `--files <paths...>` mode to match `spx validation` per-file invocation.
   - Add `--json` output mode to match `spx validation --json` convention.
   - Resolve project root via worktree-local `git rev-parse --show-toplevel` per [PDR-15](../../../15-worktree-resolution.pdr.md).

4. **EXCLUDE integration:** Filter walked files through `spx/EXCLUDE` per [18-exclude-scoping.enabler](../../../18-exclude-scoping.enabler/exclude-scoping.md). Files under excluded node directories are not parsed or indexed.

5. **Configuration:** The xiperinc constants `COMMON_LITERAL_ALLOWLIST`, `MIN_STRING_LENGTH`, `MIN_NUMBER_DIGITS` are project-specific. Expose them via the config descriptor pattern from [16-config.enabler](../../../16-config.enabler/config.md). The xiperinc allowlist (Notion API discriminators, brand-specific values) does not transfer; SPX needs its own.

6. **Language descriptor registration** per [ADR-19](../../../19-language-registration.adr.md): register the literal-reuse stage in `src/validation/languages/typescript.ts`. The orchestrator iterates the registry; do not hardcode dispatch in `allCommand`.

7. **Tests** (write before implementation per the SPX TDD flow):
   - `tests/literal-reuse.unit.test.ts` — `collectLiterals`, `buildIndex`, `detectReuse` exercised with in-memory fixtures via the test environment from [22-test-environment.enabler](../../../22-test-environment.enabler/test-environment.md). Cover every Scenario, Mapping, Property, and Compliance assertion in [literal-reuse.md](literal-reuse.md).
   - `tests/literal-reuse.integration.test.ts` — full pipeline against a temp project: EXCLUDE filtering, `--files` mode, `--json` output, integration with `spx validation all`.

8. **Remove from EXCLUDE** when implementation begins. The `spx/EXCLUDE` entry for `41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler` exists because the implementation does not yet exist; remove it once the unit tests pass.

## Open question

The Compliance assertion "AST traversal descends only into fields the parser declares as carrying child nodes" deliberately omits the library name (`eslint-visitor-keys`) — see prior `/aligning` finding. If the visitor implementation choice (visitor-keys library vs hand-rolled vs alternative) becomes durable enough to fix in the spec tree, author it as a decision under this enabler (`21-{slug}.adr.md`). Until then, treat it as an implementation detail covered by the behavioral assertion.
