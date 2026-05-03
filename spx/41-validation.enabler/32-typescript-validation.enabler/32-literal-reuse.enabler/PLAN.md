# Deferred Plan: validation.paths config implementation

## What is done (committed)

- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` — PDR rewritten to narrow ignore-source layer to quality-gate walkers only; validation commands use `validation.paths` from config instead
- `spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/literal-reuse.md` — removed EXCLUDE scenario and compliance assertion; added three new `validation.paths` scenarios and updated compliance assertions
- `spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/32-allowlist-config.adr.md` — section key changed from `"literal"` to `"validation"` with `literal` subsection; compliance rules updated

## Uncommitted code changes on working tree

The following files are modified but NOT committed (user chose spec-only commit):

- `src/lib/file-inclusion/layer-sequence.ts` — exports `artifactDirectoryLayer`, `hiddenPrefixLayer`, `ignoreSourceLayer` as named constants; `LAYER_SEQUENCE` assembles from them. **Clean — no deps on broken code.**
- `src/validation/config/descriptor.ts` — new file; exports `VALIDATION_SECTION`, `ValidationPathConfig`, `ValidationConfig`, `validationConfigDescriptor`. **Clean.**
- `src/validation/config/index.ts` — barrel updated to `export * from "./descriptor"`. **Clean.**
- `src/config/registry.ts` — `literalConfigDescriptor` replaced with `validationConfigDescriptor`. **Clean but depends on descriptor.ts.**
- `src/commands/validation/literal.ts` — imports updated to use `validationConfigDescriptor`; command body extracts `literal` and `paths` from `ValidationConfig`; passes `pathConfig` to `validateLiteralReuse`. **BROKEN: `pathConfig` does not exist in `ValidateLiteralReuseInput` yet.**
- `src/validation/literal/index.ts` — imports partially updated (adds `artifactDirectoryLayer`, `hiddenPrefixLayer`, `ValidationPathConfig`). **BROKEN: imports unused; `ValidateLiteralReuseInput` not extended; function body not updated.**

The following file was NOT modified but is now stale:

- `src/validation/literal/allowlist-existing.ts` — `ALLOWLIST_INCLUDE_PATH` is `["literal", "allowlist", "include"]`; must become `["validation", "literal", "allowlist", "include"]`. `LITERAL_SECTION` reference must change to `VALIDATION_SECTION`.

## Remaining implementation steps (in order)

Pick this up by invoking `/spec-tree:contextualizing spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler` and `/spec-tree:applying spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler`.

### Step A — Complete `src/validation/literal/index.ts`

1. Add `pathConfig?: ValidationPathConfig` to `ValidateLiteralReuseInput`.
2. Replace `resolveScope(... DEFAULT_SCOPE_CONFIG)` with `runPipeline([artifactDirectoryLayer, hiddenPrefixLayer], projectRoot, request, DEFAULT_SCOPE_CONFIG, EMPTY_IGNORE_READER)` where `EMPTY_IGNORE_READER` is an ignore reader constructed against a non-existent file, OR use a dedicated `VALIDATION_SCOPE_CONFIG` that points the ignore-source filename to a guaranteed-absent path. The cleanest approach: call `runPipeline` with only `[artifactDirectoryLayer, hiddenPrefixLayer]`.

   The `runPipeline` signature is:
   ```typescript
   export async function runPipeline(
     sequence: readonly LayerEntry[],
     projectRoot: string,
     request: ScopeRequest,
     config: ScopeResolverConfig,
     ignoreReader: IgnoreSourceReader,
   ): Promise<ScopeResult>;
   ```
   The `ignoreReader` can be constructed by calling `createIgnoreSourceReader(projectRoot, { ignoreSourceFilename: ".spx-nonexistent", specTreeRootSegment: SPEC_TREE_CONFIG.ROOT_DIRECTORY })` — the file won't exist so it returns an empty reader.

3. After obtaining `scope.included`, apply `pathConfig` filtering:
   - If `pathConfig.include` is non-empty: keep only entries where `entry.path.startsWith(prefix)` for at least one prefix in `include`
   - If `pathConfig.exclude` is non-empty: remove entries where `entry.path.startsWith(prefix)` for any prefix in `exclude`
   - Prefix matching is POSIX-normalized (use `/` separators; ensure prefix ends with `/` to avoid partial directory matches, e.g. `src/leg` should not match `src/legacy/`)

4. Remove the now-unused `resolveScope` import; keep `runPipeline`, `createIgnoreSourceReader`, `artifactDirectoryLayer`, `hiddenPrefixLayer`.

### Step B — Update `src/validation/literal/allowlist-existing.ts`

1. Replace `import { LITERAL_SECTION, type LiteralConfig, literalConfigDescriptor } from "./config"` with `import { LITERAL_SECTION, type LiteralConfig, literalConfigDescriptor } from "./config"` — keep the local import but add `VALIDATION_LITERAL_SUBSECTION` and `VALIDATION_SECTION` from `@/validation/config/descriptor`.
2. Change `ALLOWLIST_INCLUDE_PATH` from `[LITERAL_SECTION, "allowlist", "include"] as const` to `[VALIDATION_SECTION, VALIDATION_LITERAL_SUBSECTION, "allowlist", "include"] as const`.
3. Update `readCurrentLiteralConfig`: change `sections.value[LITERAL_SECTION]` to `sections.value[VALIDATION_SECTION]?.[VALIDATION_LITERAL_SUBSECTION]` (safe navigation since both levels may be absent).

### Step C — Run `pnpm run validate`

All five validation checks must pass before proceeding to tests.

### Step D — Update tests

**Remove** from `literal.scenario.l1.test.ts`:

- The test block at ~line 257: "files under a node listed in spx/EXCLUDE are not parsed and contribute no occurrences"
- The `EXCLUDED_NODE_DIR` constant if only used by that test
- The `spx/EXCLUDE` write call

**Remove** from `literal.compliance.l1.test.ts`:

- The entire `describe("ALWAYS: detection respects spx/EXCLUDE", ...)` block at ~line 59

**Add** to `literal.scenario.l1.test.ts`:

- Scenario: given `pathConfig.exclude` contains `"src/excluded/"`, when detector runs, then files whose path starts with `"src/excluded/"` are not indexed (use `env.writeRaw` to create a TS file under that prefix)
- Scenario: given `pathConfig.include` contains `"src/included/"`, when detector runs, then only files under that prefix are indexed
- Scenario: given a node listed in `spx/EXCLUDE` (write a real EXCLUDE file and a TS file under the node), when detector runs with no `pathConfig`, then the file IS indexed (spx/EXCLUDE no longer suppresses literal detection)

**Add** to `literal.compliance.l1.test.ts`:

- Compliance: `validation.paths.exclude` suppresses by prefix — all files under every listed prefix are never parsed

### Step E — Run `pnpm test`

All tests must pass. Fix any regressions.

### Step F — Commit

Commit code and test changes using `/spec-tree:committing-changes`. Suggested split:

1. `feat(validation): add ValidationConfig descriptor with paths and literal subsections` — `src/lib/file-inclusion/layer-sequence.ts`, `src/validation/config/descriptor.ts`, `src/validation/config/index.ts`, `src/config/registry.ts`
2. `feat(literal-reuse): apply validation.paths filtering; drop ignore-source layer` — `src/validation/literal/index.ts`, `src/validation/literal/allowlist-existing.ts`, `src/commands/validation/literal.ts`
3. `test(literal-reuse): replace spx/EXCLUDE tests with validation.paths tests` — test files only

## Constraints

- `allowlist-existing.ts` calls `serializeConfigFileSectionsWithSetIn` with a four-segment path `["validation", "literal", "allowlist", "include"]` — this is supported by the existing `setNested` helper in `src/config/index.ts`.
- The `validateLiteralReuse` function exports its interface; `allowlist-existing.ts` calls it directly with `config: currentLiteralConfig.value` — no `pathConfig` is needed there (it walks the whole project to find existing findings).
- Do NOT use glob libraries — path prefix matching (`startsWith`) is sufficient for the user's stated use case (directory exclusion).
- Do NOT use `vi.mock`, `jest.mock`, or memfs in tests — construct real temp project directories via `withTestEnv`.
- The `LITERAL_SECTION` constant stays in `src/validation/literal/config.ts` — it is still used internally by `literalConfigDescriptor.validate` for error messages. Do not remove it.
