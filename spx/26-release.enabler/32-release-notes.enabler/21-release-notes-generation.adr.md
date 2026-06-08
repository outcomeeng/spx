# Release Notes Generation

Release notes are produced by a composition in `src/domains/release/` that assembles a prompt from the release data, invokes an injected agent runner to write the notes to the changelog path resolved from the resolved configuration within the product working tree, and reads the file back to validate its path and Keep a Changelog structure before the release proceeds. The agent runner — the Claude Agent SDK `query()` in production — lives behind a dependency-injected interface in `src/agent/`, scoped to a caller-supplied working directory, a file read/write/edit tool allowlist, and a non-interactive permission mode.

## Rationale

Generating release notes is the one part of a release that consults a model, so the model call is isolated behind a single injected boundary and the rest of the composition stays a deterministic function of its inputs. The agent runner belongs in `src/agent/` rather than the release domain because invoking `query()` with a working directory, a tool allowlist, and a permission mode is generic agent-SDK plumbing — the same boundary documentation sync drives — not release policy; placing it beside `src/git/` keeps the model and network access in one infrastructure layer and leaves `src/domains/release/` free of the SDK. The release-specific work — which release data the prompt carries, where the notes are written, what counts as Keep a Changelog conformance — is release policy and lives in the composition.

The agent writes an artifact, not a verdict about its own work, so the composition reads the file back and validates it: the structural guarantees — the resolved output path and the Keep a Changelog shape — are deterministic and checked in the same flow, and the release proceeds only when they hold. Faithfulness — that the notes describe and group the release's commits and add no claim absent from them — has no structural verdict to score, so it is established by audit of the artifact against its release-data input rather than by the producer's self-report.

The dependency-injected agent runner, the sanitized boundary, the prohibition on mocking, and the read-back-and-validate flow are governed by [18-release-architecture.adr.md](../18-release-architecture.adr.md); the three-layer command structure by [spx/14-cli-composition.adr.md](../../14-cli-composition.adr.md); the release data this node consumes by [21-release-data.enabler/21-release-data-computation.adr.md](../21-release-data.enabler/21-release-data-computation.adr.md). This decision refines them with the agent-boundary placement, the prompt and path derivation, and the conformance contract specific to release notes.

## Invariants

- Release-notes generation is a function of the release data, the resolved configuration, and the injected agent runner: the prompt carries nothing but release-data-derived content and the child's own resolved configuration.
- The release proceeds only when the written notes read back at the changelog path resolved from the resolved configuration and conform to the Keep a Changelog structure.
- The resolved changelog path is contained within the product working tree; a configured changelog path that escapes the working tree is rejected before the agent runner is invoked.

## Verification

### Audit

- ALWAYS: the agent runner is injected through an interface in `src/agent/` scoped to a caller-supplied working directory, a file read/write/edit tool allowlist, and a non-interactive permission mode; the production implementation wraps the Claude Agent SDK `query()` ([audit])
- ALWAYS: release-notes composition — prompt assembly, path resolution, Keep a Changelog validation, and the produce-then-validate orchestration — is a pure function in `src/domains/release/` taking the release data, the resolved configuration, and the injected agent runner as inputs ([audit])
- ALWAYS: the release-notes prompt is assembled only from the release data and the child's resolved configuration, never spec-tree or domain state ([audit])
- ALWAYS: the generated notes are read back from the resolved path and validated against the Keep a Changelog structure before the release proceeds ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem mocking stands in for the agent invocation or the artifact validation — the agent runner is injected and exercised against real temp fixtures ([audit])
- NEVER: a producer's self-reported verdict stands in for faithfulness evidence — faithfulness that the notes describe the release's commits is established by audit of the artifact against its release-data input ([audit])
