# Plan

## Decided design — single accumulating CHANGELOG.md

Release notes are one Keep a Changelog `CHANGELOG.md` in the product working tree; each release prepends a `## [version]` section. The output path resolves from the resolved configuration + working tree (default `CHANGELOG.md`), **not** from release-data content; the release data determines the section content (the version, the commits to describe and group). A configured changelog path that escapes the product working tree is rejected.

## Contract

- **`src/agent/`** — `AgentRunner` dependency-injected interface: `run(request: { prompt: string; workingDirectory: string }): Promise<void>`, scoped per [18-release-architecture.adr.md](../18-release-architecture.adr.md) to a file read/write/edit tool allowlist and a non-interactive permission mode. The production implementation wraps the Claude Agent SDK `query()` from `@anthropic-ai/claude-agent-sdk` (the `/claude-api` skill is the reference for the `query()` binding; add the dependency with `pnpm add @anthropic-ai/claude-agent-sdk`). The agent writes files in `workingDirectory` per the prompt.
- **`src/domains/release/release-notes.ts`** — composition `composeReleaseNotes({ releaseData: ReleaseData, config: { changelogPath?: string }, workingDirectory: string, agentRunner: AgentRunner, readArtifact: ArtifactReader })`, a pure function of its inputs and injected dependencies — no direct filesystem or process access (the read-back flows through the injected `readArtifact`, mirroring how `computeReleaseData` delegates git access to the injected `GitDependencies`):
  1. `resolveReleaseNotesPath(workingDirectory, config)` → the resolved configuration's changelog path (default `CHANGELOG.md`) joined under `workingDirectory`, normalized; a path that resolves outside `workingDirectory` is rejected. Exported, pure.
  2. assemble the prompt from `releaseData` (the version + commit subjects) and the resolved configuration (the changelog path) only — never spec-tree or domain state.
  3. invoke `agentRunner.run({ prompt, workingDirectory })`.
  4. read the artifact back at the resolved path through the injected `readArtifact`; validate Keep a Changelog structure and a section for `releaseData.version`; proceed only when validation passes, otherwise reject.
- **`ArtifactReader`** — the injected read-back dependency: `readArtifact(path: string): Promise<string>`, returning the content the agent wrote. The production implementation reads from the filesystem; tests inject a reader over the temp working tree. Keeps the composition free of direct filesystem access per [spx/14-cli-composition.adr.md](../../14-cli-composition.adr.md).
- The Keep a Changelog format markers (`# Changelog`, `## [version]`, `### Added`/`### Changed`/`### Fixed`, …) are source-owned by the validator — exported so the test fixtures and the generator build conformant and non-conformant content from the same constants.

## Test plan

Inject a recording + writing `AgentRunner` double (no mocking): constructed with `(outputPath, changelogContent)`, it records the received prompt and writes `changelogContent` to `outputPath`, modelling what the agent writes. The composition's injected `readArtifact` is the real filesystem reader over the temp working tree, so the read-back exercises a real file the double wrote. Real temp dirs via `withGitWorktreeEnv`; reuse and extend [testing/generators/release/release.ts](../../../testing/generators/release/release.ts) (`ReleaseData.version` from `RELEASE_TEST_GENERATOR.semver()`); a Keep a Changelog content generator driven by the source-owned format markers.

- `tests/release-notes.scenario.l1.test.ts` — (a) `resolveReleaseNotesPath` returns the configured changelog (default `CHANGELOG.md`; and a configured `changelogPath`) within the working tree; (b) after `composeReleaseNotes` with the writing double, the file exists at the resolved path and carries a `## [version]` section for `releaseData.version`.
- `tests/release-notes.conformance.l1.test.ts` — the read-back validation accepts a conformant changelog (via the double) and rejects a non-conformant one.
- `tests/release-notes.compliance.l1.test.ts` — the recording double captures the prompt; the prompt contains the release-data-derived content (version, commit subjects) and the resolved changelog path, and carries no spec-tree or domain state; a configured changelog path that escapes the working tree is rejected.

The faithfulness assertion stays `[audit]` (no test) — established by audit of the artifact against its release-data input per the ADR.

## Related nodes

`32-documentation-sync.enabler` (same index, also agent-driven, same SDK boundary) and `43-publish-dispatch.enabler` (draws `version` from `ReleaseData.version`; its scenario "Given a release tag and the package version" sources the version from the shared record).
