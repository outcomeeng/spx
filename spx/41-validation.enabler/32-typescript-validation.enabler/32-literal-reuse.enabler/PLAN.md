# Deferred Plan: literal-reuse decomposition + validation.paths implementation

## What is done (in working tree, not yet committed)

- Spec decomposition: parent `literal-reuse.md` is now an aggregate concern; five child enablers carry the assertions:
  - [`21-detection.enabler/`](21-detection.enabler/detection.md) — cross-file indexing engine; owns moved `21-visitor-traversal.adr.md`
  - [`21-fixture-classification.enabler/`](21-fixture-classification.enabler/fixture-classification.md) — fixture-writer + test-file classification
  - [`32-value-allowlist.enabler/`](32-value-allowlist.enabler/value-allowlist.md) — `validation.literal.values.*` config; owns moved `21-allowlist-config.adr.md` (renamed from `32-allowlist-config.adr.md`); contains existing `21-allowlist-existing.enabler/` (moved here)
  - [`32-path-filter.enabler/`](32-path-filter.enabler/path-filter.md) — `validation.paths.*` integration; explicitly does NOT consult `spx/EXCLUDE`
  - [`54-output-modes.enabler/`](54-output-modes.enabler/output-modes.md) — CLI flags + output formats (FLAG: 25 assertions; sub-decomposition queued in [ISSUES.md](ISSUES.md))
- Existing `32-literal-reuse.enabler/tests/` (literal.{scenario,mapping,property,compliance}.l1.test.ts + support.ts) needs to be redistributed into the five children's `tests/` directories during the testing step
- `spx/EXCLUDE` lists the four newly declared-state children (and `32-value-allowlist.enabler` which contains the unchanged `21-allowlist-existing.enabler`); markdown validation passes
- Spec keys renamed everywhere: `literal.allowlist.{presets,include,exclude}` → `validation.literal.values.{presets,include,exclude}`

## Uncommitted code changes on working tree

- `src/lib/file-inclusion/layer-sequence.ts` — exports `artifactDirectoryLayer`, `hiddenPrefixLayer`, `ignoreSourceLayer` as named constants. **Clean.**
- `src/validation/config/descriptor.ts` — new file; exports `VALIDATION_SECTION`, `ValidationPathConfig`, `ValidationConfig`, `validationConfigDescriptor`. **Needs adjustment for `values` nesting (see Step 3 below).**
- `src/validation/config/index.ts` — barrel re-exports descriptor. **Clean.**
- `src/config/registry.ts` — uses `validationConfigDescriptor`. **Clean.**
- `src/commands/validation/literal.ts` — extracts subsections from `ValidationConfig`. **BROKEN: `pathConfig` not on `ValidateLiteralReuseInput` yet; extraction needs to read `literal.values` not `literal`.**
- `src/validation/literal/index.ts` — partial rewrite; imports unused; runtime error. **BROKEN.**
- `src/validation/literal/allowlist-existing.ts` — unmodified but stale; needs 4-segment `[VALIDATION_SECTION, VALIDATION_LITERAL_SUBSECTION, VALIDATION_LITERAL_VALUES_SUBSECTION, "include"]`.

## Status

| Step                                            | Status                           | Reference                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Audit ADRs                                  | DONE                             | Both ADRs APPROVED via `/typescript:auditing-typescript-architecture`                                                                                      |
| 2 — Adjust descriptor + redistribute tests      | DONE for descriptor + 4/5        | Detection (`fcbdd94`), fixture-classification (`4a00176`), path-filter (`75fb209`), value-allowlist (`0ceba4f`); output-modes pending — depends on Step 6  |
| 3 — Implement source                            | DONE                             | `e629a1d`                                                                                                                                                  |
| 4 — Quality gates                               | Source baseline DONE             | 14/14 allowlist-existing, 13/13 validation integration, 29/29 detection                                                                                    |
| 5 — Commit per concern                          | 4/5 children committed + harness | `270e793` (refactor), `e629a1d` (impl), `fcbdd94`, `4a00176`, `75fb209`, `0ceba4f` (4 children's tests); harness landing committed in this cycle           |
| 6 — NEW: Literal fixture harness                | DONE                             | [`36-literal-fixture-harness.enabler`](36-literal-fixture-harness.enabler/literal-fixture-harness.md) + `testing/harnesses/literal/harness.ts`; 10/10 pass |
| 7 — NEW: Migrate parent + 4 children to harness | DONE                             | Replace `writeLiteralOutputFixture`/inline templates in `tests/support.ts` and the 4 child tests with `withLiteralFixtureEnv` from the harness             |
| 8 — NEW: Author 54-output-modes tests           | DONE                             | 4 test files (scenario, mapping, property, compliance); APPROVED via `/typescript:auditing-typescript-tests`                                               |
| 9 — NEW: Delete parent doomed tests             | DONE                             | `git rm` literal.{scenario,mapping,property,compliance}.l1.test.ts + support.ts; ISSUES.md stale entry removed; 1337 tests pass                            |

The four `literal.{scenario,mapping,property,compliance}.l1.test.ts` files at the parent level are still in the working tree. They contain TypeScript fixture templates (`writeLiteralOutputFixture` etc.) that exploit the literal validator's own file-pattern blind spot — the harness exists to move those templates out of spec-tree `tests/` and into production code under `testing/harnesses/literal/`. Step 7 retrofits the existing children to use the harness; Step 9 removes the parent files.

The `21-detection.enabler`, `21-fixture-classification.enabler`, `32-path-filter.enabler`, `32-value-allowlist.enabler` entries were removed from `spx/EXCLUDE` as their tests landed. The `36-literal-fixture-harness.enabler` entry was removed when its implementation landed. The `54-output-modes.enabler` entry remains; remove it after Step 8.

## Remaining work for the next agent

**Step 7 — Migrate parent + 4 children to use the harness.**

The parent's `tests/support.ts` currently contains `writeLiteralOutputFixture`, `writeSourceWithLiteral`, `writeTestWithLiteral` — these emit TypeScript fixture templates inline in the spec tree. Replace each call site with `withLiteralFixtureEnv` from `@testing/harnesses/literal/harness`:

| File                        | Current pattern                                                     | Replace with                                                                                                     |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tests/support.ts` (parent) | `writeLiteralOutputFixture(env)` returns inputs after writing files | Tests call `withLiteralFixtureEnv(config, async (env) => { await env.writeReuseFixture(inputs); ... })` directly |
| 4 children's tests          | Various `writeRaw` patterns building TS source/test files           | Same — `env.writeSourceFile(path, value)`, `env.writeTestFile(path, value)`, or `env.writeReuseFixture(inputs)`  |

After migration, `tests/support.ts` at the parent retains only config helpers (`INTEGRATION_CONFIG`, `configWithAllowlist`, `EMPTY_ALLOWLIST`, `DETECTOR_OPTIONS_DEFAULTS`) — the writer functions are deleted because the harness owns them.

**Step 8 — Author 54-output-modes tests.**

`/spec-tree:contextualizing spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/54-output-modes.enabler`. Then write 4 test files (scenario.l1, mapping.l1, property.l1, compliance.l1) using `withLiteralFixtureEnv` for fixture setup and source imports for `LITERAL_PROBLEM_KIND`, format functions, etc.

Spec assertions: 10 scenarios, 5 mappings, 2 properties, 7 compliance. After tests are APPROVED via `/typescript:auditing-typescript-tests`, remove `54-output-modes.enabler` from `spx/EXCLUDE`.

**Step 9 — Delete parent doomed tests.**

After Steps 7 and 8 are committed and green: `git rm` the four `tests/literal.{scenario,mapping,property,compliance}.l1.test.ts` files at the parent. If `tests/support.ts` no longer has any writers, also reduce it to just config helpers as described above.

Final commit: `test(literal-reuse): delete redistributed parent-level tests`. Then `pnpm run validate` should be green for the whole literal-reuse subtree (modulo the unrelated project-wide ADR-21 debt tracked in [spx/ISSUES.md](../../../ISSUES.md#cross-file-literal-reuse-findings-116-unsuppressed-across-11-subtrees)).

### Original step-by-step (for reference)

Pick this up by invoking `/spec-tree:contextualizing` on the relevant child node, then `/spec-tree:applying`.

### Step 1 — Audit ADRs

The two ADRs were moved + renamed. Audit them to confirm the structural changes did not invalidate any decision content:

- `21-detection.enabler/21-visitor-traversal.adr.md` — relative links to `../../21-typescript-conventions.adr.md` and `../../32-ast-enforcement.enabler/...` updated for the deeper location
- `32-value-allowlist.enabler/21-allowlist-config.adr.md` — Decision, Trade-offs, Recognized-by, MUST sections updated for `values` nesting; reserves `validation.literal.paths.*` namespace for the future per-tool path filter

Invoke `/typescript:auditing-typescript-architecture` for each. APPROVED gate before continuing.

### Step 2 — Adjust descriptor shape and write tests

`src/validation/config/descriptor.ts` currently exports `ValidationConfig` with `{ paths, literal: { presets, include, exclude } }`. Restructure to `{ paths, literal: { values: LiteralConfig } }`. Export new constants:

- `VALIDATION_LITERAL_SUBSECTION = "literal"`
- `VALIDATION_LITERAL_VALUES_SUBSECTION = "values"`

Then redistribute the existing `32-literal-reuse.enabler/tests/literal.*.l1.test.ts` content into the children's `tests/` directories per the assertions each child now carries. Each test imports from `@/validation/literal/...` and uses `withTestEnv` per [22-test-environment.enabler](../../../22-test-environment.enabler/test-environment.md). Concretely:

- `21-detection.enabler/tests/detection.{scenario,mapping,property,compliance}.l1.test.ts` — core detection cases (4 scenarios, 2 mappings, 3 properties, 3 compliance)
- `21-fixture-classification.enabler/tests/fixture-classification.{scenario,compliance}.l1.test.ts` — 7 scenarios, 3 compliance (one is `[review]`-only)
- `32-value-allowlist.enabler/tests/value-allowlist.{scenario,mapping,compliance}.l1.test.ts` — 5 scenarios, 2 mappings, 1 compliance (the section-key compliance is `[review]`-only via the ADR)
- `32-path-filter.enabler/tests/path-filter.{scenario,compliance}.l1.test.ts` — 3 scenarios (NEW; tests the just-introduced `validation.paths` behavior), 1 compliance (one is `[review]`)
- `54-output-modes.enabler/tests/output-modes.{scenario,mapping,property,compliance}.l1.test.ts` — 10 scenarios, 5 mappings, 2 properties, 7 compliance

Existing scenarios already in `tests/literal.scenario.l1.test.ts` that reference `literal.allowlist.*` (lines 181, 196, 210, 242, 247) must be rewritten to use `validation.literal.values.*` and the new descriptor constants when migrated.

Existing scenario in `tests/literal.scenario.l1.test.ts` at ~line 257 ("files under a node listed in spx/EXCLUDE are not parsed") must be REPLACED with the new scenario "spx/EXCLUDE no longer suppresses literal detection" placed in `32-path-filter.enabler/tests/`.

Existing compliance block in `tests/literal.compliance.l1.test.ts` at ~line 59 (`describe("ALWAYS: detection respects spx/EXCLUDE", ...)`) must be REPLACED with the new compliance "validation.paths.exclude suppresses by prefix" in `32-path-filter.enabler/tests/path-filter.compliance.l1.test.ts`.

After redistribution, delete the now-empty `tests/literal.*.l1.test.ts` files and the `tests/` directory itself if empty. The `tests/support.ts` content also redistributes — shared helpers move to `21-detection.enabler/tests/support.ts` (or the lowest-index consumer); other helpers move alongside their tests.

**ADR-21 compliance is mandatory in the redistribution.** The five new test files MUST NOT contain test-owned semantic constants. Every variable test input (literal values, file paths, allowlist entries, preset names, foreign-section keys) comes from [`testing/generators/literal/literal.ts`](../../../../testing/generators/literal/literal.ts) via `sampleLiteralTestValue(LITERAL_TEST_GENERATOR.<arbitrary>())` for scenario tests or via `fc.assert(fc.property(<arbitrary>, ...))` for property tests. Every source-owned value (`PRESET_NAMES.WEB`, `WEB_PRESET_TOKENS`, `LITERAL_DEFAULTS`, `DEFAULT_MIN_STRING_LENGTH`, `DEFAULT_MIN_NUMBER_DIGITS`, format-output strings) is imported from `@/validation/literal/config` or its owning module. Output-format strings produced by `formatVerboseLiteralProblems`, `formatDefaultLiteralProblems`, `formatFilesWithProblems`, `formatLiteralValues` and the `NO_PROBLEMS_MESSAGE` constant must be exported from [`src/commands/validation/literal.ts`](../../../../src/commands/validation/literal.ts) so the redistributed compliance/scenario tests can import them — grow named exports as needed during Step 2. Fixture content written into temp project files via `env.writeRaw(...)` is inert and remains acceptable, but the literal values inside those write calls are sampled from generators, not declared as constants. The redistribution may NOT introduce a new "support.ts" that hosts shared semantic constants — `support.ts` files contain F-category factories and harness writers only.

The 21-allowlist-existing tests (now under `32-value-allowlist.enabler/21-allowlist-existing.enabler/tests/`) need their `LITERAL_SECTION` references and `literal.allowlist.include` text updated to `VALIDATION_SECTION` and the 4-segment path. Both consumer tests and the local `support.ts` already conform to ADR-21 via the literal generator (no test-owned semantic constants, all variable inputs from `LITERAL_TEST_GENERATOR`, source-owned values imported); the section-key rename is the only change Step 2 makes here.

Invoke `/typescript:testing-typescript` to drive this. `/typescript:auditing-typescript-tests` APPROVED gate before continuing.

### Step 3 — Implement

After Step 2 establishes the test contract:

1. **`src/validation/literal/index.ts`**
   - Add `pathConfig?: ValidationPathConfig` to `ValidateLiteralReuseInput`
   - Replace `resolveScope(...)` with `runPipeline([artifactDirectoryLayer, hiddenPrefixLayer], projectRoot, request, DEFAULT_SCOPE_CONFIG, EMPTY_IGNORE_READER)` — `EMPTY_IGNORE_READER` constructed against a guaranteed-absent file
   - After `scope.included`, apply `pathConfig` filtering: prefix-match `include` (keep) and `exclude` (drop), POSIX-normalized, prefix ends with `/` to avoid partial-directory matches
   - Remove unused `resolveScope` import
2. **`src/validation/literal/allowlist-existing.ts`**
   - Remove `LITERAL_SECTION` import; add `VALIDATION_SECTION`, `VALIDATION_LITERAL_SUBSECTION`, `VALIDATION_LITERAL_VALUES_SUBSECTION` from `@/validation/config/descriptor`
   - `ALLOWLIST_INCLUDE_PATH` becomes `[VALIDATION_SECTION, VALIDATION_LITERAL_SUBSECTION, VALIDATION_LITERAL_VALUES_SUBSECTION, "include"] as const`
   - `readCurrentLiteralConfig`: `sections.value[VALIDATION_SECTION]?.[VALIDATION_LITERAL_SUBSECTION]?.[VALIDATION_LITERAL_VALUES_SUBSECTION]`
3. **`src/commands/validation/literal.ts`**
   - Extract `paths` and `literal.values` from `ValidationConfig`; pass `config: literal.values` and `pathConfig: paths` to `validateLiteralReuse`
4. **`src/validation/literal/config.ts`**
   - `LITERAL_SECTION` constant: keep only if still referenced by validator error messages; otherwise remove

Invoke `/typescript:coding-typescript`. `/typescript:auditing-typescript` APPROVED gate.

### Step 4 — Run quality gates

- `pnpm run validate` — all five checks pass
- `pnpm test` — all redistributed and new tests pass

### Step 5 — Commit

Use `/spec-tree:committing-changes`. Suggested split (one PR per logical concern):

1. `refactor(literal-reuse): decompose into 5 child enablers + nest value allowlist under values` — all spec/ADR edits, all `git mv`, EXCLUDE additions, ISSUES.md, PLAN.md
2. `feat(validation): add ValidationConfig descriptor with paths and literal.values subsections` — `src/validation/config/descriptor.ts`, `src/validation/config/index.ts`, `src/config/registry.ts`, `src/lib/file-inclusion/layer-sequence.ts`
3. `feat(literal-reuse): apply validation.paths filtering; drop ignore-source layer` — `src/validation/literal/index.ts`, `src/validation/literal/allowlist-existing.ts`, `src/commands/validation/literal.ts`
4. `test(literal-reuse): redistribute tests into child enablers; add validation.paths tests` — all test files

Once Step 5 commits 1-3 land, remove the matching child paths from `spx/EXCLUDE`.

## Constraints

- The 4-segment config-section write `["validation", "literal", "values", "include"]` must be supported by `setNested` in `src/config/index.ts` (or an equivalent helper supporting arbitrary depth)
- `validateLiteralReuse` is called by `allowlist-existing.ts` with `config: currentLiteralConfig.value` only — no `pathConfig` (the bulk-silence helper walks the whole project to find existing findings)
- Do NOT use glob libraries for path filtering — `String.prototype.startsWith` is sufficient for the user's directory-prefix use case
- Do NOT use `vi.mock`, `jest.mock`, or memfs in tests — construct real temp project directories via `withTestEnv`
- Do NOT add `it.skip`/`it.todo` placeholder tests for unimplemented child specs — the EXCLUDE entry is the only declared-state mechanism per the methodology
