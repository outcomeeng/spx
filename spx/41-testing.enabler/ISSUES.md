# Issues: Testing

Coordination notes for the `spx test` enabler. The dispatch, central registry, the passing-scope dispatch filter, and config-driven scope resolution are built; last-run evidence recording and the registry-based per-node run remain, so `41-testing.enabler` stays in `spx/EXCLUDE`. Three scenarios — the two passing-scope end-to-end scenarios and the per-node-run scenario — carry forward-contract `[test]` links to `tests/testing.integration.test.ts`, which does not exist yet (the sanctioned declared-state pattern for nodes under `spx/EXCLUDE`); the links are re-pointed to the canonical file when the integration harness lands. The passing-scope dispatch mechanism itself is proven now in `tests/testing.scenario.l1.test.ts`.

## FOLLOW-UP: last-run evidence and the registry-based per-node run are not yet built

`testing.md` declares that `spx test` records last-run evidence and that a status consumer can run one node's tests through the registry, recording fresh evidence (the per-node run scenario, link `tests/testing.integration.test.ts`). The dispatch records no evidence and exposes no per-node surface.

**Resolution:** record a `TestRunState` (via `src/testing/run-state.ts`) after a full run and after a per-node run; expose the registry-based per-node run that status consumes per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`; author the per-node case; remove `41-testing.enabler` from `spx/EXCLUDE` once it lands.

**Evidence:** `testing.md` evidence and per-node assertions; `src/testing/run-state.ts` (the relocated evidence contract); the status delegation ADR.

## FOLLOW-UP: the integration harness must prove passing-scope end-to-end

The two passing-scope end-to-end scenarios in `testing.md` (`spx test passing` filters an excluded node / `spx test` runs it) forward-contract to `tests/testing.integration.test.ts`. The dispatch mechanism is proven now (the dispatch applies a supplied scope, `tests/testing.scenario.l1.test.ts`) and config-reading is the `ALWAYS` compliance `[review]`, but no automated test exercises `resolveTestingPassingScope` reading `spx.config.*` and the resolved scope reaching the runners end-to-end.

**Resolution:** when the integration harness `tests/testing.integration.test.ts` lands (with the last-run evidence and per-node run work above), add a CLI-boundary case that writes a `spx.config.*` carrying a `testing.passingScope` exclusion, runs `spx test passing`, and asserts the excluded node's files are not dispatched while `spx test` runs them — exercising `resolveTestingPassingScope` end-to-end — then re-point the two scenario links from `tests/testing.integration.test.ts` to the canonical case.

**Evidence:** local and CI changes review on PR-2b; `src/interfaces/cli/testing.ts` `resolveTestingPassingScope`; `testing.md` passing-scope scenarios and `ALWAYS` compliance assertion.

## FOLLOW-UP: passing-scope prefixes are matched as full product-root paths

`resolveTestingPassingScope` forwards the config `passingScope` straight to `applyPathFilter`, which matches prefixes against discovered test file paths rooted at the product directory (`spx/<node>/tests/…`). A `passingScope.exclude` value must therefore be a full path from the product root (`spx/41-testing.enabler`); a relative node path (`41-testing.enabler`) matches nothing and silently excludes no files, with no error or warning.

**Resolution:** state the path-format contract on the `spx test passing` assertions in `testing.md`, and decide whether a `passingScope` prefix that matches no discovered file should warn — closing the silent-no-op gap; when the integration harness lands, cover the no-op case (a config prefix matching no discovered file) with either an asserted warning or a documented silent-no-op contract.

**Evidence:** local changes review on PR-2b; `spx/41-testing.enabler/tests/testing.scenario.l1.test.ts` exclusion-prefix construction; `src/config/primitives/path-filter.ts` `applyPathFilter`.

## FOLLOW-UP: the testing language descriptor delegates detection to the composition root

`TestingLanguageDescriptor` (`src/testing/languages/types.ts`) delegates presence detection to an agnostic `isLanguagePresent(projectRoot)` in the injected dependencies rather than owning a detector. Because the descriptor carries no detection of its own, the CLI composition root maps each language to its concrete detector through a name-keyed table (`PRESENCE_BY_LANGUAGE_NAME` in `src/interfaces/cli/testing.ts`). Orchestration (`runTests`) stays registry-driven and names no language, so the table is boundary wiring, not an orchestration-layer language reference — but the mapping only exists because detection lives outside the descriptor. While the table exists, `spx/19-language-registration.adr.md`'s invariant — adding a language touches one descriptor module plus one registry entry and no other files — is not fully met, because a third language also needs a `PRESENCE_BY_LANGUAGE_NAME` entry in the CLI.

**Resolution:** move detection onto the descriptor (a `detect`/`isPresent` member or a detection marker on `TestingLanguageDescriptor`), implement it in `src/testing/languages/{typescript,python}.ts`, and replace the CLI's name-keyed table with `descriptor`-driven detection — eliminating the language-name lookup at the boundary.

**Evidence:** local changes review on PR-2a (F-001); `src/interfaces/cli/testing.ts` `PRESENCE_BY_LANGUAGE_NAME`; the descriptor contract `src/testing/languages/types.ts`.

## FOLLOW-UP: testing runner contract names the root `projectRoot`, not `productDir`

`TestRunRequest.projectRoot` and `TestRunnerDependencies.isLanguagePresent(projectRoot)` (`src/testing/languages/types.ts`) name the repository root with the deprecated term; `CLAUDE.md` prefers `productDir` for root-directory APIs. The dispatch and CLI already speak `productDir` and map it onto the descriptor's `projectRoot` field at the call boundary.

**Resolution:** when the descriptor contract is next edited, rename `projectRoot` to `productDir` across `TestRunRequest`, both language descriptors, the dispatch, the CLI, and the runner harnesses and generators.

**Evidence:** local changes review on PR-2a (F-003); `CLAUDE.md` product-directory vocabulary rule; `src/testing/languages/types.ts`.

## FOLLOW-UP: extract shared runner test-infra when a third language is added

The recording command runner (`createRecordingCommandRunner` and the `RecordingCommandRunner` interface) is duplicated between `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and the runner generators (`testing/generators/testing/python-runner.ts` and `…/typescript-runner.ts`) redeclare the same spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index and path-count bounds). Both operate purely on the shared `TestingLanguageDescriptor` contract (`src/testing/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

**Resolution:** when a third language testing descriptor is added, extract the shared recording command runner to `testing/harnesses/testing/language-runner.ts` and the shared generator constants to `testing/generators/testing/language-runner.ts`, and re-point every language runner harness and generator — and the dispatch-level test (`spx/41-testing.enabler/tests/testing.scenario.l1.test.ts`), which imports `createRecordingCommandRunner` from the typescript-runner harness — at the shared module.

**Evidence:** spec-tree-review on PR #69; the shared contract `src/testing/languages/types.ts` both runners conform to.
