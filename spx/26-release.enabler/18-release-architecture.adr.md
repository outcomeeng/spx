# Release Architecture

Release computes its data through dependency-injected git runners, selects product context by composing endpoint-specific spec-tree snapshots with backend-neutral evidence ownership through the public spec-tree library, produces each agent-authored artifact by invoking the Claude Agent SDK in-process under a restricted tool allowlist, and reads back and validates every produced artifact against its contract before a release proceeds.

## Rationale

A release's deterministic core — the commits since the last tag, the version delta, the changed paths — must verify without a model or network, so git utilities take an injected runner and the model call lives only in the agent-driven children, which alone require an API key and network access. Driving the agent through the SDK's in-process `query()`, rather than spawning a CLI or delegating to an external runner, gives typed control of the working directory, the tool allowlist, and the permission mode in one boundary and keeps the invocation owned by spx so the produced artifact is read back and validated in the same flow. The agent writes an artifact, not a verdict about its own work, so faithfulness — that the notes and documentation describe the commits and add no claim absent from the release's changes — is established by an audit of the artifact against its release-data input; the eval mechanism does not apply, because no structurally scoreable verdict is produced, while the structural guarantees of path, Keep a Changelog shape, and version references are deterministic and verified by the specs' tests. Spawning the agent CLI would be opaque to typed tool and permission control and couple the flow to an installed binary; emitting a prompt for an external runner would remove the produce-then-validate flow from spx's ownership.

## Invariants

- Release data is a pure function of git state — identical repository state yields identical release data.
- Governing-node selection is a pure function of the release-range endpoint trees, changed paths classified as source by registered evidence-reachability providers at either endpoint, and ownership claims from evidence reachability and exact audit-declaration path references: each endpoint yields a deduplicated candidate set plus its governing lowest common ancestor, or unresolved, and the release context contains every distinct candidate and governing owner.
- Every agent-produced artifact is read back from disk and validated against its contract; the release proceeds only when validation passes.

## Verification

- ALWAYS: the release command layer obtains ownership claims from evidence reachability and exact audit-declaration path references through injected boundaries, resolves candidate and governing-node ownership through the public spec-tree library for both release-range endpoint trees, and fails with the unresolved implementation paths before agent invocation when neither endpoint supplies an owner

### Audit

- ALWAYS: git utilities — tag listing, commits-since-last-tag, changed-paths — accept a dependency-injected runner and run with a sanitized git environment, so they verify in isolation without ambient git state ([audit])
- ALWAYS: agent-driven children invoke the Claude Agent SDK `query()` through a dependency-injected interface scoped to a caller-supplied working directory, a file read/write/edit tool allowlist, and a non-interactive permission mode ([audit])
- ALWAYS: an agent-driven child's prompt carries shared standards, release data, its resolved configuration, and available product context; the producer and independent auditor receive identical standards and source inputs, with their role-specific tasks stated separately ([audit])
- ALWAYS: product context is assembled before agent invocation through injected read boundaries and the public spec-tree surface, ordered by product specification, governing decisions, and affected specifications selected from direct spec-tree changes and implementation ownership; repository content is delimited as data and cannot replace the shared standards ([audit])
- ALWAYS: each agent-produced artifact is read back from disk and validated against its contract — output path and Keep a Changelog structure for release notes; configured documentation set and updated version references for documentation — before the release proceeds ([audit])
- ALWAYS: release command modules separate pure computation in `src/domains/release/`, process-agnostic handlers in `src/commands/release/`, and the Commander descriptor in `src/interfaces/cli/release.ts` per `spx/14-cli-composition.adr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem mocking for git, agent invocation, or artifact validation — dependencies are injected and exercised against real temp fixtures ([audit])
- NEVER: the release-data computation path reaches for the network or a model — its only collaborators are the injected git runner and the local working tree ([audit])
- NEVER: an agent invocation grants tools beyond the file read/write/edit allowlist, or runs in a mode that waits for interactive approval ([audit])
- NEVER: a producer's self-reported verdict stands in for faithfulness evidence — faithfulness is established by audit of the artifact against its release-data input ([audit])
