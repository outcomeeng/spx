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

## Remaining work (TDD-ordered)

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

The 21-allowlist-existing tests (now under `32-value-allowlist.enabler/21-allowlist-existing.enabler/tests/`) need their `LITERAL_SECTION` references and `literal.allowlist.include` text updated to `VALIDATION_SECTION` and the 4-segment path.

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
