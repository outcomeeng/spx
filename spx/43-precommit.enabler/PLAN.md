# PLAN: 43-precommit.enabler rearchitecture

## Completed

- `findRelatedTestPaths` deleted from `categorize.ts` and from the spec — confirmed zero production callers (commit 867738f)

## Remaining structural problem

### `categorize.ts` hardcodes what should live in SPX config

`categorize.ts` exports `FILE_PATTERNS` with hardcoded source dirs and test suffix. `build-args.ts` exports a second, different `FILE_PATTERNS` with a different regex. Neither reads from the SPX config system.

The rest of the codebase already has the right pattern:

- `validateLiteralReuse(input)` takes `LiteralConfig` — source dirs and patterns come from `spx.config.yaml` via `literalConfigDescriptor`
- `src/config/testing.ts` provides `CONFIG_TEST_GENERATOR` with `arbitraryProjectRoot()` etc. for config system tests

The precommit module should follow the same shape:

1. Add a `precommit` section to `spx.config.yaml` (alongside `validation`) with `sourceDirs` and `testPattern`
2. Add `precommitConfigDescriptor` to `src/config/registry.ts`
3. `categorize.ts` becomes `categorizeFile(path, config: PrecommitConfig)` — same DI shape as the literal and scope modules
4. `build-args.ts`'s `isTestFile(path)` becomes `isTestFile(path, config: PrecommitConfig)`, reading `config.testPattern`
5. Delete all hardcoded `FILE_PATTERNS` constants from both modules once the config is wired in

The current hardcoded values become the descriptor's `defaults`:

```yaml
# spx.config.yaml precommit defaults
precommit:
  sourceDirs:
    - src/
  testPattern: "*.test.ts"
```

### Dead constants in `categorize.ts`

After deleting `findRelatedTestPaths`, the constants `TESTS_DIR`, `UNIT_DIR`, `INTEGRATION_DIR`, `SPECS_DIR`, `INTEGRATION_TEST_SUFFIX` are no longer referenced in the source — only in the test file. Delete them from `categorize.ts` and remove the tests that construct paths from them.

## Generator and test plan

Once `categorizeFile(path, config)` accepts config:

### New `testing/generators/precommit/precommit.ts`

Mirrors `src/config/testing.ts`'s approach:

```typescript
export const PRECOMMIT_TEST_GENERATOR = {
  config: arbitraryPrecommitConfig,
  sourcePath: arbitrarySourcePath, // fc.string().map(s => `${config.sourceDirs[0]}${s}.ts`)
  testPath: arbitraryTestPath, // fc.string().map(s => `${s}${testSuffix}`)
  otherPath: arbitraryOtherPath, // paths that match neither
} as const;
```

Each arbitrary takes a `PrecommitConfig` so the generated paths are consistent with the config under test.

### Test structure after rearchitecture

| Spec assertion                     | Test file                        | Evidence | Approach                                                                                                                 |
| ---------------------------------- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Classification mapping             | `categorize.mapping.l1.test.ts`  | mapping  | `fc.property(arbitraryPrecommitConfig(), arbitrarySourcePath(config), ...)`                                              |
| Classification is deterministic    | `categorize.property.l1.test.ts` | property | `fc.property(config, fc.string(), (cfg, path) => categorizeFile(path, cfg) === categorizeFile(path, cfg))`               |
| Filter idempotency                 | `categorize.property.l1.test.ts` | property | `fc.property(config, fc.array(fc.string()), (cfg, files) => filter(filter(files, cfg), cfg).equals(filter(files, cfg)))` |
| `buildVitestArgs` invocation shape | `build-args.mapping.l1.test.ts`  | mapping  | `fc.property(config, fc.array(arbitraryTestPath(config)), ...)`                                                          |
| `runPrecommitTests` skip/propagate | `run.scenario.l1.test.ts`        | scenario | DI structure stays; hardcoded file paths → generated paths                                                               |
| Lefthook integration               | `precommit.integration.test.ts`  | scenario | No changes needed                                                                                                        |

### Files to rename

`build-args.unit.test.ts` → `build-args.mapping.l1.test.ts` (+ property file once config is wired)
`categorize.unit.test.ts` → `categorize.mapping.l1.test.ts` + `categorize.property.l1.test.ts`
`run.unit.test.ts` → `run.scenario.l1.test.ts` + `run.compliance.l1.test.ts`

## Sequence

1. **Delete dead `FILE_PATTERNS` constants** from `categorize.ts` (`TESTS_DIR`, `UNIT_DIR`, `INTEGRATION_DIR`, `SPECS_DIR`, `INTEGRATION_TEST_SUFFIX`) and remove the tests that use them
2. **Add `PrecommitConfig` + descriptor** to the config system
3. **Wire config into `categorize.ts` and `build-args.ts`** — make both functions accept config
4. **Write `testing/generators/precommit/precommit.ts`**
5. **Rewrite tests** to use the generators and drop all hardcoded paths
