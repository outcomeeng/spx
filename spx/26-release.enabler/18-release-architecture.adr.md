# Release Architecture

Release computes its data through injected git runners, produces each agent-authored artifact by invoking the Claude Agent SDK in-process under a restricted tool allowlist, and validates every produced artifact against its contract before a release proceeds.

## Context

**Business impact:** Release turns a product's git history into release notes, documentation updates, and a governed publication, governed by `spx/26-release.enabler/15-release-model.pdr.md`. Release notes and documentation are agent-authored; release data and publication are deterministic. Isolating the nondeterministic model call behind an injected boundary keeps the deterministic computation verifiable on its own and confines model access and network to the two agent-driven concerns.

**Technical constraints:** spx is a TypeScript ESM CLI whose command domains layer as pure computation (`src/domains/{domain}/`), process-agnostic handlers (`src/commands/{domain}/`), and a Commander descriptor (`src/interfaces/cli/{domain}.ts`) per `spx/14-cli-composition.adr.md`, with descriptor-based registration per `spx/19-language-registration.adr.md`. Git access is mediated by an injectable `execa`-style runner that strips the inherited git environment. The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) exposes an in-process `query()` that drives an agent against a working directory under a tool allowlist and permission mode, authenticated by `ANTHROPIC_API_KEY` over the network, and writes its output to disk rather than returning a structured verdict.

## Decision

Release data is computed by git utilities that accept an injected runner; agent-driven children invoke the Claude Agent SDK `query()` in-process — scoped to the product working directory, restricted to a file read/write/edit tool allowlist, and run non-interactively — and spx reads back and validates each produced artifact against its contract before the release proceeds.

## Rationale

A release's deterministic core — the commits since the last tag, the version delta, the changed paths — must verify without a model or network, so the git utilities take an injected runner and the model call lives only in the agent-driven children. Driving the agent through the SDK in-process, rather than spawning a CLI or delegating to an external runner, gives typed control of the working directory, the tool allowlist, and the permission mode in one boundary, and keeps the invocation owned by spx so the produced artifact is read back and validated in the same flow.

The agent writes an artifact, not a verdict about its own work, so faithfulness — that the notes and documentation describe the commits and introduce no claim absent from the release's changes — is established by an audit of the artifact against its release-data input, not by a producer self-report; the eval mechanism does not apply because no structurally scoreable verdict is produced. The structural and positional guarantees — the artifact lands at the resolved path, parses as Keep a Changelog, carries the updated version references — are deterministic and are verified by test.

Alternatives rejected:

- **Spawn the agent CLI as a subprocess:** opaque to typed control of tools, permissions, and working directory, and couples the invocation to an installed binary rather than a library boundary.
- **Emit a prompt for an external runner to execute:** removes the produce-then-validate flow from spx, so no single owner reads back and validates the artifact.
- **Score faithfulness with the eval runner:** the producer emits an artifact, not a structured verdict the runner can score; faithfulness reduces to agent judgment over the artifact and its input.

## Trade-offs accepted

| Trade-off                                                                    | Mitigation / reasoning                                                                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The two agent-driven children require `ANTHROPIC_API_KEY` and network access | They are agent-authored by nature, not core deterministic operations; release data and publication remain offline and deterministic |
| Faithfulness is verified by audit, not an automated gate                     | No structural verdict exists to score; the deterministic structure, path, and version checks remain tested and do gate              |
| Driving the SDK in-process adds a library dependency                         | The injected boundary keeps the dependency out of the deterministic core and isolates the model call for testing                    |

## Invariants

- Release data is a pure function of git state — identical repository state yields identical release data.
- Every agent-produced artifact is read back from disk and validated against its contract; the release proceeds only when validation passes.

## Compliance

### Recognized by

Git utilities and agent invocation accept dependency-injected runners; release command modules layer across `src/domains/release/`, `src/commands/release/`, and `src/interfaces/cli/release.ts`.

### MUST

- Git utilities — tag listing, commits-since-last-tag, changed-paths — accept an injected `execa`-style runner and run with a sanitized git environment, so they verify in isolation without ambient git state ([review])
- Agent-driven children invoke the Claude Agent SDK `query()` through an injected interface, scoped to a caller-supplied working directory, restricted to a file read/write/edit tool allowlist, and run non-interactively, so the model call is isolated behind dependency injection ([review])
- An agent-driven child's system prompt is assembled solely from release-data, so generation depends on no spec-tree or domain state ([review])
- Each agent-produced artifact is read back from disk and validated against its contract — output path and Keep a Changelog structure for release notes; configured documentation set and updated version references for documentation — before the release proceeds ([review])
- Release command modules separate pure computation in `src/domains/release/`, process-agnostic handlers in `src/commands/release/`, and the Commander descriptor in `src/interfaces/cli/release.ts` per `spx/14-cli-composition.adr.md` ([review])

### NEVER

- `vi.mock()`, `jest.mock()`, or filesystem mocking for git, agent invocation, or artifact validation — dependencies are injected and exercised against real temp fixtures ([review])
- Computing release data reads the network or invokes a model — git plumbing and the local working tree are its only inputs ([review])
- An agent invocation grants tools beyond the file read/write/edit allowlist, or runs in a mode that waits for interactive approval ([review])
- A producer's self-reported verdict stands in for faithfulness evidence — faithfulness is established by audit of the artifact against its release-data input ([review])
