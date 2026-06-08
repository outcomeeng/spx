# Plan

Resume `/applying` for this node at **Step 5 (write tests)**. The architecture gate (Step 3–4) is APPROVED: [21-release-notes-generation.adr.md](21-release-notes-generation.adr.md). The spec is refined for the chosen design (single accumulating CHANGELOG.md). The node is in [spx/EXCLUDE](../../EXCLUDE) until tests + implementation land.

## Decided design — single accumulating CHANGELOG.md

Release notes are one Keep a Changelog `CHANGELOG.md` in the product working tree; each release prepends a `## [version]` section. The output path resolves from the resolved configuration + working tree (default `CHANGELOG.md`), **not** from release-data content; the release data determines the section CONTENT (the version, the commits to describe and group). Operator decision recorded 2026-06-08.

## Contract to build (Step 5 tests define it; Step 7 implements)

- **`src/agent/`** — `AgentRunner` DI interface: `run(request: { prompt: string; workingDirectory: string }): Promise<void>`, scoped per [18-release-architecture.adr.md](../18-release-architecture.adr.md) to a file read/write/edit tool allowlist and a non-interactive permission mode. Production wraps the Claude Agent SDK `query()` (consult `/claude-api` at Step 7 for the `query()` binding; add the dep with `pnpm add @anthropic-ai/claude-agent-sdk`). The agent writes files in `workingDirectory` per the prompt.
- **`src/domains/release/release-notes.ts`** — pure composition `composeReleaseNotes({ releaseData: ReleaseData, config: { changelogPath?: string }, workingDirectory: string, agentRunner: AgentRunner })`:
  1. `resolveReleaseNotesPath(workingDirectory, config)` → `join(workingDirectory, config.changelogPath ?? "CHANGELOG.md")` (exported, pure).
  2. assemble the prompt from `releaseData` (`version` + commit subjects) and the resolved config only — never spec-tree or domain state.
  3. invoke `agentRunner.run({ prompt, workingDirectory })`.
  4. read the file back at the resolved path; validate Keep a Changelog structure + a section for `releaseData.version`; proceed only when validation passes (else throw).
- The Keep a Changelog format markers (`# Changelog`, `## [version]`, `### Added/Changed/Fixed`, …) are **source-owned** by the validator — export them so the test fixtures and the generator build conformant/non-conformant content from the same constants (no literal reuse).

## Test plan (Step 5)

Inject a **recording + writing** `AgentRunner` double (NO mocking): constructed with `(outputPath, changelogContent)`, it records the received prompt and writes `changelogContent` to `outputPath`, simulating the agent. Real temp dirs via `withGitWorktreeEnv`; reuse/extend `testing/generators/release/release.ts` (`ReleaseData.version` from `RELEASE_TEST_GENERATOR.semver()`); add a Keep a Changelog content generator under `testing/generators/` driven by the source-owned format markers.

- `tests/release-notes.scenario.l1.test.ts` — (a) `resolveReleaseNotesPath` returns the configured changelog (default `CHANGELOG.md`; and a configured `changelogPath`) within the working tree; (b) after `composeReleaseNotes` with the writing double, the file exists at the resolved path and carries a `## [version]` section for `releaseData.version`.
- `tests/release-notes.conformance.l1.test.ts` — the read-back validation accepts a conformant CHANGELOG (via the double) and rejects a non-conformant one (throws) — proving generated notes conform to Keep a Changelog.
- `tests/release-notes.compliance.l1.test.ts` — the recording double captures the prompt; assert it is assembled only from release data (contains the version and commit subjects) and carries no spec-tree or domain state.

The faithfulness assertion stays `[audit]` (no test) — it is established by audit of the artifact against its release-data input per the ADR.

## After this node

`32-documentation-sync.enabler` (same index, also agent-driven, same SDK boundary) and then `43-publish-dispatch.enabler` (draws `version` from `ReleaseData.version`; its spec scenario "Given a release tag and the package version" should source the version from the shared record when implemented).
