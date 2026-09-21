# Issues

## Release consumes evidence reachability from a node indexed above it

`src/commands/release/product-context.ts` imports the testing registry from `@/test/registry` and takes two things from each language descriptor: `matchesTestFile`, the per-language test-file naming pattern, and `relatedTestPaths`, the TypeScript import-graph reachability analysis that decides which changed paths a committed test file reaches. Both are governed by [`spx/41-test.enabler/95-changed-set-planning.enabler`](../41-test.enabler/95-changed-set-planning.enabler/changed-set-planning.md), index 41, above this node's 26.

**Evidence:** the changeset review of the release product-context branch at `a3f90bc60dfd626d29151a0a0a8461055c1fea95` (review run `2026-09-20_21-06-22-273-9ddbc84f0bb1`, finding F-001); `git grep "@/test/registry" -- src/commands/release src/domains/release` lists the one import.

**Impact:** the numeric-index dependency order is violated — release consumes a provider indexed above it while every domain depends on release by vertical slice — so the release decisions can name the evidence-reachability provider only by contract, not by the node that owns it.

**Settlement condition:** a substrate node indexed below 26 under `spx/21-infrastructure.enabler` owns the language-neutral `relatedTestPaths` contract and the TypeScript reachability implementation; `95-changed-set-planning` and release both consume it; and no file under `src/commands/release` or `src/domains/release` imports `@/test/registry`.

## Release resolves evidence reachability once per changed path

`resolveEndpointOwnership` in `src/commands/release/product-context.ts` maps every changed path to its own `resolveEndpointPathOwnership` call, and `resolveLanguageClaims` invokes `language.relatedTestPaths` with `sourcePaths` holding that single path, so each language resolver runs once per changed path per endpoint. `RelatedTestRequest.sourcePaths` accepts a batch, and the changed-set planner under [`spx/41-test.enabler/95-changed-set-planning.enabler`](../41-test.enabler/95-changed-set-planning.enabler/changed-set-planning.md) passes its whole source set in one call per language. The release resolver cannot: `RelatedTestResolution` reports `testPaths` and `resolvedSourcePaths` for the batch as a whole, with no mapping from a test path to the source paths it reaches, and `reduceEndpointClaims` needs the claim per changed path to attribute unresolved paths and candidate nodes. The memoized endpoint reader removes repeated file reads across those calls; the reachability walks repeat.

**Evidence:** the current-head CI review of PR #589 at `7393eec777dce6128412d6f11cf16336b93a41cf` (review comment of 2026-09-20T23:50:31Z, DEBT finding at `src/commands/release/product-context.ts:291`); the per-path `resolveLanguageClaims` call at `src/commands/release/product-context.ts:281-299`; `relatedTestPaths` in `src/test/languages/typescript.ts:374-406`, which allocates a fresh `moduleTextCache` and `reachabilityCache`, re-resolves the path mappings, and walks every candidate test's import graph on each call.

**Impact:** a release over N changed paths runs N full candidate-test reachability scans per language per endpoint, current and previous-tag endpoints alike, where one batched scan per language per endpoint covers the same inputs; a release over this changeset's 69 files runs 69 scans per language per endpoint.

**Settlement condition:** `RelatedTestResolution` carries a per-source-path result, or one batched call fans its result out per changed path with the ownership properties under [`18-release-architecture.adr.md`](18-release-architecture.adr.md) and the linked tests unchanged; then `resolveEndpointOwnership` calls `language.relatedTestPaths` once per language per endpoint.
