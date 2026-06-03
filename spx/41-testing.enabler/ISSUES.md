# Issues: Testing

Coordination notes for the `spx test` enabler. The dispatch and central registry are built; passing-scope filtering, last-run evidence recording, and the registry-based per-node run remain, so `41-testing.enabler` stays in `spx/EXCLUDE`. The deferred assertions (passing-scope, per-node run) carry forward-contract `[test]` links to `tests/testing.integration.test.ts`, which does not exist yet — the sanctioned declared-state pattern for nodes under `spx/EXCLUDE`; each link is re-pointed to its canonical file when the feature lands.

## FOLLOW-UP: passing-scope filtering for `spx test passing` is not yet built

`spx/41-testing.enabler/testing.md` declares that `spx test passing` filters test files under passing-scope-excluded nodes before runner invocation. The dispatch (`src/commands/testing/dispatch.ts`) runs every discovered file and has no passing-scope path. Testing config models passing-scope as a `PathFilterConfig` (prefix include/exclude) in `src/testing/config.ts`, and no shared applier exists — `src/validation/literal/index.ts` hand-rolls prefix matching for its own `PathFilterConfig`.

**Resolution:** add a `passing` subcommand and a `passing` parameter to `runTests`, resolve the testing config `passingScope`, and filter discovered files by prefix include/exclude before grouping; decide whether the applier is a shared primitive in `src/config/primitives/path-filter.ts` or local to the testing domain. Author the two passing-scope scenarios and re-point their `testing.md` links to the canonical scenario file.

**Evidence:** `testing.md` passing-scope assertions; `src/testing/config.ts` `passingScope: PathFilterConfig`; `src/validation/literal/index.ts` `applyPathFilter` prefix matching.

## FOLLOW-UP: last-run evidence and the registry-based per-node run are not yet built

`testing.md` declares that `spx test` records last-run evidence and that a status consumer can run one node's tests through the registry, recording fresh evidence (the per-node run scenario, link `tests/testing.integration.test.ts`). The dispatch records no evidence and exposes no per-node surface.

**Resolution:** record a `TestRunState` (via `src/testing/run-state.ts`) after a full run and after a per-node run; expose the registry-based per-node run that status consumes per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`; author the per-node case; remove `41-testing.enabler` from `spx/EXCLUDE` once it lands.

**Evidence:** `testing.md` evidence and per-node assertions; `src/testing/run-state.ts` (the relocated evidence contract); the status delegation ADR.

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
