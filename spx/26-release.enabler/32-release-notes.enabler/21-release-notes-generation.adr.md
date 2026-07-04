# Release Notes Generation

Release notes are produced by a composition in `src/domains/release/` that assembles a prompt from the release data, invokes an injected agent runner to write the notes to the changelog path resolved from the resolved configuration within the product working tree, and validates the artifact through injected path-canonicalization, symlink-detection, and artifact-reader dependencies before the release proceeds — so the composition performs no direct filesystem access and stays a pure function of its inputs and injected dependencies. The agent runner — the Claude Agent SDK `query()` in production — lives behind a dependency-injected interface in `src/agent/`, scoped to a caller-supplied working directory, a file read/write/edit tool allowlist, and a non-interactive permission mode. This decision refines [18-release-architecture.adr.md](../18-release-architecture.adr.md) and [spx/14-cli-composition.adr.md](../../14-cli-composition.adr.md) with the agent-boundary placement, the prompt and path derivation, and the conformance contract specific to release notes.

## Rationale

Generating release notes is the one part of a release that consults a model, so the model call is isolated behind a single injected boundary and the rest of the composition stays a deterministic function of its inputs. The agent runner belongs in `src/agent/` rather than the release domain because invoking `query()` with a working directory, a tool allowlist, and a permission mode is generic agent-SDK plumbing — the same boundary documentation sync drives — not release policy; placing it beside `src/lib/git/` keeps the model and network access in one infrastructure layer and leaves `src/domains/release/` free of the SDK. The release-specific work — which release data the prompt carries, where the notes are written, what counts as Keep a Changelog conformance — is release policy and lives in the composition.

The agent writes an artifact, not a verdict about its own work, so the composition reads the artifact back and validates it: the structural guarantees — the resolved output path and the Keep a Changelog shape — are deterministic and checked in the same flow, and the release proceeds only when they hold. Faithfulness — that the notes describe and group the release's commits and add no claim absent from them — has no structural verdict to score, so it is established by audit of the artifact against its release-data input rather than by the producer's self-report.

## Invariants

- Release-notes generation is a function of the release data, the resolved configuration, the injected agent runner, the injected path canonicalizer, the injected symlink detector, and the injected artifact reader: the prompt carries nothing but release-data-derived content and the child's own resolved configuration.
- The release proceeds only when the written notes read back at the changelog path resolved from the resolved configuration and conform to the Keep a Changelog structure.
- The resolved changelog path is lexically and canonically contained within the product working tree; a configured changelog path that escapes the working tree, resolves to the working-tree root, or points at a final symlink is rejected before the agent runner is invoked.
- The canonical containment check runs before and after the agent runner writes, so a symlink escape or path swap cannot move the release-notes artifact outside the product working tree between prompt assembly and read-back validation.

## Verification

### Audit

- ALWAYS: the agent runner is injected through an interface in `src/agent/` scoped to a caller-supplied working directory, a file read/write/edit tool allowlist, and a non-interactive permission mode; the production implementation wraps the Claude Agent SDK `query()` ([audit])
- ALWAYS: release-notes composition — prompt assembly, path resolution, canonical path validation, Keep a Changelog validation, and the produce-then-validate orchestration — is a pure function in `src/domains/release/` taking the release data, the resolved configuration, the injected agent runner, the injected path canonicalizer, the injected symlink detector, and the injected artifact reader as inputs, performing no direct filesystem or process access ([audit])
- ALWAYS: the release-notes prompt is assembled only from the release data and the child's resolved configuration, never spec-tree or domain state ([audit])
- ALWAYS: release-notes composition checks the configured changelog path's canonical containment and final symlink state before invoking the agent runner, and repeats canonical containment before reading the artifact back, so symlink escapes and write-time path swaps cannot carry release notes outside the product working tree ([audit])
- ALWAYS: the generated notes are read back from the resolved path through the injected reader and validated against the Keep a Changelog structure before the release proceeds ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem mocking stands in for the agent invocation or the artifact validation — the agent runner is injected and exercised against real temp fixtures ([audit])
- NEVER: a producer's self-reported verdict stands in for faithfulness evidence — faithfulness that the notes describe the release's commits is established by audit of the artifact against its release-data input ([audit])
