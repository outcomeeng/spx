# Plan

## Harness vocabulary guard

Before applying this plan to agent-driven release-note composition or SDK-backed runner boundaries, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Implemented

The release-notes composition is implemented and tested in `src/domains/release/release-notes.ts`: `resolveReleaseNotesPath` (changelog path resolved within the working tree, escaping paths rejected), `composeReleaseNotes` (prompt assembled from release data + resolved config, injected `AgentRunner` + `ArtifactReader`, read-back-and-validate against the Keep a Changelog structure and a section for the version), and the source-owned Keep a Changelog markers the tests and generator build content from. The `AgentRunner` interface is in `src/agent/agent-runner.ts`. Tests are co-located in `tests/` (scenario, conformance, compliance); the recording + writing agent double and the changelog/path generators are in `testing/harnesses/release/` and `testing/generators/release/`.

## Remaining

- **Production `AgentRunner` (Claude Agent SDK wrapper).** The production implementation of the `src/agent/` `AgentRunner` wraps the Claude Agent SDK `query()` from `@anthropic-ai/claude-agent-sdk` (NOT `claude-code-sdk`, which does not exist on npm), scoped to the caller-supplied working directory, a file read/write/edit tool allowlist, and a non-interactive permission mode, per `21-release-notes-generation.adr.md` and `../18-release-architecture.adr.md`. It is verified by `[audit]` (DI boundary, allowlist, non-interactive mode), not by an automated test — its only collaborator is the network- and credential-bound SDK (l3). Add it with `pnpm add @anthropic-ai/claude-agent-sdk` when the `spx release` command that consumes it is built (use the `/claude-api` reference for the `query()` binding). Delimit commit subjects as a quoted data block in the prompt before handing them to the agent adapter, so adversarial commit text cannot be mistaken for release-note instructions. The boundary is shared with `32-documentation-sync.enabler`, so the wrapper lands once, with its first consumer.
- **Faithfulness `[audit]`.** The spec's faithfulness assertion — generated notes describe and group the release's commits and introduce no claim absent from them — is established by audit of a real generated artifact against its release-data input, performed when the production agent runs.
