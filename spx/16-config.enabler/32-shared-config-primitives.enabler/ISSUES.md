# Issues: Shared Config Primitives

## Consolidate remaining path-filter appliers onto `applyPathFilter`

`applyPathFilter` (`src/config/primitives/path-filter.ts`) is the shared apply-side of the `PathFilterConfig` primitive: it keeps paths admitted by the include set and not matched by the exclude set, matching a prefix by path-segment boundary. Two command-local appliers predate it and carry their own prefix-matching:

- `src/validation/literal/index.ts` `applyPathFilter` — consumes the shared `applyPathFilter` primitive for automatic entries, but keeps literal-specific wrapper logic for explicit-override entries and `noMatchingIncludes` short-circuit handling.
- `testing/generators/testing/dispatch.ts` `isNodePathPrefix` — the same segment-boundary predicate without normalization, used by the `arbitraryDistinctNodePaths` generator to keep sampled node paths prefix-disjoint. It is a test-data guard rather than a filter applier, but a shared segment-boundary matcher extracted for the two production appliers would absorb it too.

**Impact:** None on behavior today — each applier is correct for its own consumer. The duplication risks silent divergence in prefix-matching semantics across domains as the shared primitive evolves.

`src/validation/config/path-filter.ts` consumes the shared prefix matcher while keeping validation-specific include intersection layered in its own module. The shared primitive owns separator normalization, leading `./` stripping, trailing separator trimming, root-prefix matching, and exact-or-boundary matching.

**Resolution:** extract a shared apply helper that accepts always-admitted explicit entries and automatic entries, applies the primitive path filter to the automatic set, and preserves the `noMatchingIncludes` fast path, so literal validation no longer owns a command-local wrapper.

**Evidence:** the shared `applyPathFilter` added for `spx test passing` passing-scope (`spx/41-test.enabler/test.md`); the remaining literal applier cited above.

## Provide a type-safe section accessor on the resolved config

`resolveConfig` returns `Config` (a `Record<string, unknown>`), so every consumer reads its descriptor's section with an unchecked cast — `loaded.value[descriptor.section] as TestingConfig` in `src/interfaces/cli/test.ts`, `loaded.value[descriptor.section] as ValidationConfig` in `src/commands/validation/circular.ts`. The cast compiles regardless of whether the descriptor was passed to `resolveConfig`, so a missing-descriptor or renamed-section drift surfaces only at runtime.

**Resolution (deferred — touches the config domain, all descriptor consumers):** introduce a generic accessor on the config result, e.g. `getSection<T>(config: Config, descriptor: ConfigDescriptor<T>): T`, that derives the section key and the value type from the descriptor, and update the test and validate consumers to use it instead of the inline cast.

**Evidence:** local changes review on PR-2b; `src/interfaces/cli/test.ts` `resolveTestingPassingScope`; `src/commands/validation/circular.ts` section cast; the `Config` contract from `resolveConfig`.
