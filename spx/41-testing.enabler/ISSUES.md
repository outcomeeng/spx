# Issues: Testing

Coordination notes for the `spx test` enabler. These concern the not-yet-built dispatch and registry; the per-language runner descriptors they consume are complete.

## FOLLOW-UP: the central testing registry is not yet created

`spx/19-language-registration.adr.md` requires a central registry that imports each language's testing descriptor via an explicit import statement, and requires orchestration to reach languages only through that registry. The registry module `src/testing/registry.ts` does not exist yet: `pythonTestingLanguage` (`src/testing/languages/python.ts`) and `typescriptTestingLanguage` (`src/testing/languages/typescript.ts`) are each exported but imported by their own tests only. Each runner node's ADR scopes the registry as this parent enabler's concern, so it is out of scope for the individual language-node changes.

**Resolution:** when the `spx test` command in `spx/41-testing.enabler/testing.md` is built, create `src/testing/registry.ts` importing `pythonTestingLanguage` and `typescriptTestingLanguage` via explicit import statements and exposing their enumeration, satisfying the language-registration invariant; the dispatch then iterates the registry rather than naming any language.

**Evidence:** `spx/19-language-registration.adr.md` (the registry MUST and the "no language named in orchestration" invariant); the two language nodes `spx/41-testing.enabler/21-python-testing.enabler` and `spx/41-testing.enabler/21-typescript-testing.enabler` both ship descriptors with no registry consuming them.

## FOLLOW-UP: extract shared runner test-infra when a third language is added

The recording command runner (`createRecordingCommandRunner` and the `RecordingCommandRunner` interface) is duplicated between `testing/harnesses/testing/python-runner.ts` and `testing/harnesses/testing/typescript-runner.ts`, and the runner generators (`testing/generators/testing/python-runner.ts` and `…/typescript-runner.ts`) redeclare the same spec-tree path constants (`SPEC_ROOT`, `TESTS_DIR`, `NODE_SUFFIX`, the node-index and path-count bounds). Both operate purely on the shared `TestingLanguageDescriptor` contract (`src/testing/languages/types.ts`), so the structure is identical across languages. With two language runners the parallel structure is the cheaper choice; a third runner makes the duplication worth extracting and risks silent divergence.

**Resolution:** when a third language testing descriptor is added, extract the shared recording command runner to `testing/harnesses/testing/language-runner.ts` and the shared generator constants to `testing/generators/testing/language-runner.ts`, and re-point every language runner harness and generator at them.

**Evidence:** spec-tree-review on PR #69; the shared contract `src/testing/languages/types.ts` both runners conform to.

## FOLLOW-UP: forward-contract test link for the registry-based per-node run

`testing.md` carries a `[test](tests/testing.integration.test.ts)` link on the per-node run scenario (a status consumer requests one node's outcome and the registry-based per-node run executes that node's tests and records fresh evidence) whose covering case is not yet authored — like the other `testing.md` `[test]` links, it is a forward contract because the `spx test` dispatch and the registry are not yet built.

**Resolution:** when the central registry (`src/testing/registry.ts`) and the `spx test` dispatch are built per the registry FOLLOW-UP above, author the per-node run case in `tests/testing.integration.test.ts` and wire it to status per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`.

**Evidence:** spec-tree-review on the status/testing reconciliation; the per-node run surface declared in `testing.md` and consumed by the status delegation ADR.
